from celery import shared_task
import logging
import os
import shutil
import traceback
import cv2
import subprocess
import tempfile
from django.conf import settings
from django.utils import timezone
from django.core.files import File

from .models import DrillVideo
from metrics.models import MetricDefinition, MetricResult

from ai_engine import process_media

logger = logging.getLogger(__name__)

# Metric catalog for AI outputs -> MetricDefinition records (coach/player-facing copy)
METRIC_MAP = {
	"heavy_touches_counted": {
		"name": "Heavy touches",
		"unit": "count",
		"description": (
			"Times the ball sat loose—too far from your feet—while you were still in a control situation."
		),
	},
	"total_steps": {
		"name": "Steps",
		"unit": "count",
		"description": "Foot switches counted from pose while you were in frame.",
	},
	"cadence_spm": {
		"name": "Footwork tempo",
		"unit": "steps/min",
		"description": "How quickly your feet were moving, in steps per minute.",
	},
	"total_scans_detected": {
		"name": "Shoulder checks",
		"unit": "count",
		"description": "Times you checked your surroundings—typical head movement when scanning before a pass or turn.",
	},
	"avg_touch_tightness": {
		"name": "Ball-to-foot spacing",
		"unit": "px",
		"description": (
			"Average space between the ball and your nearest foot in the clip (on-screen pixels). "
			"Lower usually means tighter control."
		),
	},
	"movement_speed_px_s": {
		"name": "Movement speed",
		"unit": "px/s",
		"description": (
			"Average horizontal movement of your hip center between frames (pixels per second). "
			"Higher usually means you were covering more ground in frame; compare across similar camera setups."
		),
	},
}


def _extract_metric_values(report: dict) -> dict:
	"""Extract scalar metrics from the AI engine report."""
	metrics = report.get('metrics', {}) if isinstance(report, dict) else {}
	values = {}
	# direct metrics (total_scans_detected may live on report root in older JSON)
	for key in ("heavy_touches_counted", "total_steps", "cadence_spm", "total_scans_detected", "movement_speed_px_s"):
		v = metrics.get(key)
		if v is None and key == "total_scans_detected" and isinstance(report, dict):
			v = report.get("total_scans_detected")
		if v is not None:
			values[key] = v
	# derived metric: average touch tightness
	touch_hist = metrics.get('touch_tightness_history') or []
	if touch_hist:
		values['avg_touch_tightness'] = round(sum(touch_hist) / len(touch_hist), 2)
	return values


def _persist_metrics(video: DrillVideo, metric_values: dict):
	"""Upsert MetricDefinition and persist MetricResult rows for a video."""
	# Clear previous results for idempotency (one run per video)
	MetricResult.objects.filter(video=video).delete()
	for key, value in metric_values.items():
		meta = METRIC_MAP.get(key, {"name": key, "unit": "value", "description": key})
		desc = meta.get("description", meta["name"])
		metric_def, created = MetricDefinition.objects.get_or_create(
			key=key,
			defaults={"name": meta["name"], "unit": meta["unit"], "description": desc},
		)
		if not created:
			MetricDefinition.objects.filter(pk=metric_def.pk).update(
				name=meta["name"],
				unit=meta["unit"],
				description=desc,
			)
		MetricResult.objects.create(
			video=video,
			metric=metric_def,
			value=value,
			confidence=1.0,
		)


def _generate_thumbnail(video_path: str, thumbnail_path: str) -> bool:
	"""Save the first frame of the video as a thumbnail image.

	Returns True on success, False otherwise (without raising).
	"""
	try:
		cap = cv2.VideoCapture(video_path)
		ok, frame = cap.read()
		cap.release()
		if not ok or frame is None:
			return False
		# Write as JPEG
		os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
		return cv2.imwrite(thumbnail_path, frame)
	except Exception:
		return False


def _ensure_h264_mp4(input_path: str) -> str:
	"""Ensure the video is H.264/AAC in MP4 container for browser compatibility.

	If the input already decodes (per OpenCV) and has a common fourcc, we keep it.
	Otherwise we transcode via ffmpeg (must be installed) to a temp MP4 and return that path.
	"""
	try:
		cap = cv2.VideoCapture(input_path)
		if not cap.isOpened():
			return input_path
		fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
		cap.release()
		fourcc_str = ''.join([chr((fourcc >> 8*i) & 0xFF) for i in range(4)])
		# H.264 in MP4 is web-safe; mp4v (OpenCV default) is not — transcode below.
		if fourcc_str.lower() in ('avc1', 'h264'):
			return input_path
		# Fallback: transcode
		tmp_dir = tempfile.mkdtemp(prefix='converted_')
		output_path = os.path.join(tmp_dir, os.path.basename(input_path).rsplit('.', 1)[0] + '_h264.mp4')
		cmd = [
			'ffmpeg', '-y', '-i', input_path,
			'-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
			'-c:a', 'aac', '-movflags', '+faststart',
			output_path,
		]
		try:
			subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
			return output_path
		except Exception:
			return input_path
	except Exception:
		return input_path


def _reencode_annotated_mp4_for_browser(src_path: str) -> bool:
	"""Replace annotated MP4 in place with H.264 / yuv420p / faststart for HTML5 playback.

	OpenCV's VideoWriter uses the ``mp4v`` (MPEG-4 Part 2) fourcc, which most browsers
	will not decode inside an MP4 ``<video>``. This step re-encodes via ffmpeg when available.

	Returns True if the file at ``src_path`` is browser-safe after the call (either transcoded
	or ffmpeg was skipped and the original is left unchanged).
	"""
	if not src_path or not os.path.isfile(src_path):
		return False
	ffmpeg = shutil.which('ffmpeg')
	if not ffmpeg:
		logger.warning(
			'ffmpeg not found; annotated video left as OpenCV mp4v (may not play in browsers). '
			'Install ffmpeg and re-run processing to fix.'
		)
		return True
	dir_name = os.path.dirname(os.path.abspath(src_path)) or '.'
	try:
		fd, tmp_path = tempfile.mkstemp(suffix='.mp4', prefix='annot_web_', dir=dir_name)
		os.close(fd)
	except OSError as e:
		logger.warning('Could not create temp file for annotated re-encode: %s', e)
		return True
	try:
		cmd = [
			ffmpeg,
			'-hide_banner',
			'-loglevel', 'error',
			'-y',
			'-i',
			src_path,
			'-c:v',
			'libx264',
			'-profile:v',
			'main',
			'-level',
			'4.0',
			'-pix_fmt',
			'yuv420p',
			'-vf',
			'scale=trunc(iw/2)*2:trunc(ih/2)*2',
			'-preset',
			'veryfast',
			'-crf',
			'23',
			'-movflags',
			'+faststart',
			'-an',
			tmp_path,
		]
		subprocess.run(cmd, check=True, timeout=7200)
		os.replace(tmp_path, src_path)
		return True
	except Exception as e:
		logger.warning('Annotated web transcode failed (leaving OpenCV output): %s', e)
		try:
			if os.path.isfile(tmp_path):
				os.unlink(tmp_path)
		except OSError:
			pass
		return True


@shared_task(bind=True)
def process_video_file(self, input_path: str, output_path: str = None, headless: bool = True):
	"""Celery task example that runs the AI engine on a video file.

	Args:
		input_path: local filesystem path to the input video.
		output_path: optional path where JSON should be written. If not provided, service chooses a path.
		headless: run without GUI (recommended for workers).
	"""
	try:
		report, outpath, _ = process_media(input_path, output_json_path=output_path, headless=headless)
		metric_values = _extract_metric_values(report)
		return {'status': 'SUCCESS', 'output': outpath, 'report_summary': {
			'frames': report.get('total_frames_processed'),
			'heavy_touches': report.get('metrics', {}).get('heavy_touches_counted'),
			'cadence_spm': metric_values.get('cadence_spm'),
			'total_scans': metric_values.get('total_scans_detected'),
			'avg_touch_tightness': metric_values.get('avg_touch_tightness'),
		}}
	except Exception as e:
		tb = traceback.format_exc()
		return {'status': 'FAILED', 'error': str(e), 'traceback': tb}


@shared_task(bind=True)
def process_drillvideo_file(self, drillvideo_id: int):
	"""Process a DrillVideo record: run the engine, attach JSON to the model and update status/timestamps."""
	try:
		dv = DrillVideo.objects.get(pk=drillvideo_id)
	except DrillVideo.DoesNotExist:
		return {'status': 'FAILED', 'error': f'DrillVideo {drillvideo_id} not found'}

	dv.status = 'PROCESSING'
	dv.started_at = timezone.now()
	dv.save()

	input_path = dv.video.path
	results_dir = os.path.join(settings.MEDIA_ROOT, 'results')
	os.makedirs(results_dir, exist_ok=True)
	output_path = os.path.join(results_dir, f'drillvideo_{drillvideo_id}.json')

	try:
		annotated_dir = os.path.join(settings.MEDIA_ROOT, 'annotated')
		os.makedirs(annotated_dir, exist_ok=True)
		annotated_path = os.path.join(annotated_dir, f'drillvideo_{drillvideo_id}.mp4')

		# Ensure input is browser-friendly (H.264/AAC). If not, transcode to a temp file
		# and also replace the stored file so browsers stream the compatible version.
		input_for_processing = _ensure_h264_mp4(input_path)
		if input_for_processing != input_path:
			with open(input_for_processing, 'rb') as f:
				dv.video.save(os.path.basename(input_for_processing), File(f), save=False)
			dv.save(update_fields=['video'])
			input_path = dv.video.path
			input_for_processing = input_path

		report, outpath, annotated_out = process_media(
			input_for_processing,
			output_json_path=output_path,
			output_video_path=annotated_path,
			headless=True,
		)
		metric_values = _extract_metric_values(report)

		# Attach JSON file to the model
		with open(outpath, 'rb') as f:
			dv.result_json.save(os.path.basename(outpath), File(f), save=True)

		# Save payload inline for API consumption
		dv.result_payload = report

		# Attach annotated video if generated (re-encode for browser-safe H.264)
		if annotated_out and os.path.isfile(annotated_out):
			_reencode_annotated_mp4_for_browser(annotated_out)
			with open(annotated_out, 'rb') as f:
				dv.annotated_video.save(os.path.basename(annotated_out), File(f), save=False)

		# Generate thumbnail automatically (best-effort)
		thumb_dir = os.path.join(settings.MEDIA_ROOT, 'thumbnails')
		thumb_path = os.path.join(thumb_dir, f'drillvideo_{drillvideo_id}.jpg')
		if _generate_thumbnail(input_path, thumb_path):
			with open(thumb_path, 'rb') as f:
				dv.thumbnail.save(os.path.basename(thumb_path), File(f), save=False)

		# Persist metrics into MetricResult table
		if metric_values:
			_persist_metrics(dv, metric_values)

		dv.status = 'COMPLETED'
		dv.finished_at = timezone.now()
		dv.save()
		return {'status': 'SUCCESS', 'output': dv.result_json.url}
	except Exception as e:
		dv.status = 'FAILED'
		dv.error_message = str(e)
		dv.finished_at = timezone.now()
		dv.save()
		tb = traceback.format_exc()
		return {'status': 'FAILED', 'error': str(e), 'traceback': tb}
