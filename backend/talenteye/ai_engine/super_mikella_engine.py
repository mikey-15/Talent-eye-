import cv2
import mediapipe as mp
from ultralytics import YOLO
import math
import time
import os
import json
import sys

import cv2
import mediapipe as mp
from ultralytics import YOLO
import math
import time
import os
import json
import sys
from typing import Optional, Tuple


# Refactor the script into a callable function so Django/Celery can import it.
def run_engine_on_video(
    input_video_path: str,
    output_json_path: Optional[str] = None,
    output_video_path: Optional[str] = None,
    headless: bool = True,
    display_scale: float = 0.6,
) -> Tuple[dict, Optional[str]]:
    """Run the Super Mikella engine on a single video file.

    Args:
        input_video_path: Path to input video file.
        output_json_path: Path where the JSON report will be written. If None, writes to cwd as `mikella_scouting_report.json`.
        headless: If True, do not create GUI windows or show frames.
        display_scale: Preview display scaling (ignored when headless=True).

    Returns:
        (scouting_report dict (also written to output_json_path), output_video_path if written)
    """
    base_dir = os.path.dirname(__file__)

    # YOLOv8 model path (bundled next to this script)
    yolo_path = os.path.join(base_dir, 'yolov8n.pt')
    yolo_model = YOLO(yolo_path)

    # MediaPipe initialization (support legacy and Tasks API)
    USE_TASKS_API = False
    mp_drawing = None
    pose = None
    mp_pose = None
    try:
        mp_pose = mp.solutions.pose
        pose = mp_pose.Pose(model_complexity=2, min_detection_confidence=0.5, min_tracking_confidence=0.5)
        mp_drawing = mp.solutions.drawing_utils
        USE_TASKS_API = False
    except Exception:
        from mediapipe.tasks.python.vision import pose_landmarker as tasks_pose
        from mediapipe.tasks.python.vision import drawing_utils as tasks_drawing
        from mediapipe.tasks.python.core.base_options import BaseOptions
        from mediapipe.tasks.python.vision.core import image as mp_image
        from mediapipe.tasks.python.vision import RunningMode

        # Prefer a model under ai_engine/models/, but also accept ai_engine/pose_landmarker.task
        model_file_candidates = [
            os.path.join(base_dir, 'models', 'pose_landmarker.task'),
            os.path.join(base_dir, 'pose_landmarker.task'),
        ]
        model_file = None
        for candidate in model_file_candidates:
            if os.path.isfile(candidate):
                model_file = candidate
                break
        if model_file is None:
            checked = '\n'.join(model_file_candidates)
            raise RuntimeError(
                "MediaPipe Tasks model not found. I looked for the pose_landmarker.task file at the following paths:\n"
                f"{checked}\n\nPlease download the MediaPipe Tasks `pose_landmarker.task` model and place it in one of those paths, or install a legacy `mediapipe` that provides `mp.solutions` (e.g. mediapipe 0.9.x)."
            )

        base_options = BaseOptions(model_asset_path=model_file)
        options = tasks_pose.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=RunningMode.VIDEO,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        pose = tasks_pose.PoseLandmarker.create_from_options(options)
        mp_drawing = tasks_drawing
        PoseLandmark = tasks_pose.PoseLandmark
        PoseLandmarksConnections = tasks_pose.PoseLandmarksConnections
        MP_IMAGE = mp_image
        USE_TASKS_API = True

    # Validate input video
    if not os.path.isfile(input_video_path):
        raise FileNotFoundError(f"Input video not found: {input_video_path}")

    cap = cv2.VideoCapture(input_video_path)
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    writer = None

    scouting_report = {
        "video_file": os.path.basename(input_video_path),
        "total_frames_processed": 0,
        "metrics": {
            "touch_tightness_history": [],
            "heavy_touches_counted": 0,
        }
    }

    DISPLAY_SCALE = display_scale

    if not headless:
        cv2.namedWindow('Super Mikella Master Engine', cv2.WINDOW_NORMAL)

    is_scanning = False
    total_scans = 0
    steps_taken = 0
    right_foot_forward = None
    prev_hip_mid = None
    speed_samples = []
    # Avoid counting "heavy touches" when the ball is far away (scanning / no real control context)
    # or spamming one increment per video frame during sustained loose distance.
    heavy_touch_cooldown_frames = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if output_video_path and writer is None:
            h0, w0, _ = frame.shape
            # mp4v (MPEG-4 Part 2): fine for OpenCV; Celery task re-encodes to H.264 for browsers.
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            os.makedirs(os.path.dirname(output_video_path), exist_ok=True)
            writer = cv2.VideoWriter(output_video_path, fourcc, video_fps, (w0, h0))

        h, w, _ = frame.shape
        ball_center = None
        right_ankle = None
        left_ankle = None

        # YOLO tracking (ball class id 32)
        try:
            yolo_results = yolo_model.track(frame, classes=[32], conf=0.15, persist=True, tracker="botsort.yaml", verbose=False)
        except Exception:
            # Fallback to predict if track is not available
            yolo_results = yolo_model.predict(frame)

        if len(yolo_results) > 0 and hasattr(yolo_results[0], 'boxes') and getattr(yolo_results[0].boxes, 'xyxy', None) is not None:
            boxes = yolo_results[0].boxes.xyxy.cpu().numpy()
            for box in boxes:
                x1, y1, x2, y2 = map(int, box)
                ball_cx = int((x1 + x2) / 2)
                ball_cy = int((y1 + y2) / 2)
                ball_center = (ball_cx, ball_cy)
                cv2.circle(frame, ball_center, 8, (255, 255, 0), -1)

        # MediaPipe pose
        if not USE_TASKS_API:
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pose_results = pose.process(image_rgb)
            if getattr(pose_results, 'pose_landmarks', None):
                mp_drawing.draw_landmarks(
                    frame, pose_results.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(249, 115, 22), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(6, 182, 212), thickness=2, circle_radius=2)
                )
                landmarks = pose_results.pose_landmarks.landmark
                rx = int(landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE.value].x * w)
                ry = int(landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE.value].y * h)
                right_ankle = (rx, ry)
                lx = int(landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].x * w)
                ly = int(landmarks[mp_pose.PoseLandmark.LEFT_ANKLE.value].y * h)
                left_ankle = (lx, ly)
        else:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = MP_IMAGE.Image(MP_IMAGE.ImageFormat.SRGB, rgb)
            timestamp_ms = int(time.time() * 1000)
            result = pose.detect_for_video(mp_img, timestamp_ms)
            if result and result.pose_landmarks:
                first_pose = result.pose_landmarks[0]
                mp_drawing.draw_landmarks(
                    frame,
                    first_pose,
                    PoseLandmarksConnections.POSE_LANDMARKS,
                    mp_drawing.DrawingSpec(color=(249, 115, 22), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(6, 182, 212), thickness=2, circle_radius=2),
                )
                rx = int(first_pose[PoseLandmark.RIGHT_ANKLE.value].x * w)
                ry = int(first_pose[PoseLandmark.RIGHT_ANKLE.value].y * h)
                right_ankle = (rx, ry)
                lx = int(first_pose[PoseLandmark.LEFT_ANKLE.value].x * w)
                ly = int(first_pose[PoseLandmark.LEFT_ANKLE.value].y * h)
                left_ankle = (lx, ly)

        # Scanning calculations
        pose_available = False
        current_landmarks = None
        if not USE_TASKS_API:
            if 'pose_results' in locals() and getattr(pose_results, 'pose_landmarks', None):
                current_landmarks = landmarks
                PL = mp_pose.PoseLandmark
                pose_available = True
        else:
            if 'result' in locals() and result and result.pose_landmarks:
                current_landmarks = first_pose
                PL = PoseLandmark
                pose_available = True

        if pose_available:
            nose_x = current_landmarks[PL.NOSE.value].x
            l_shoulder_x = current_landmarks[PL.LEFT_SHOULDER.value].x
            r_shoulder_x = current_landmarks[PL.RIGHT_SHOULDER.value].x
            shoulder_width = abs(l_shoulder_x - r_shoulder_x)
            if shoulder_width > 0.02:
                mid_shoulder_x = (l_shoulder_x + r_shoulder_x) / 2.0
                nose_offset = abs(nose_x - mid_shoulder_x)
                scan_ratio = nose_offset / (shoulder_width / 2.0)
                if scan_ratio > 0.7:
                    if not is_scanning:
                        total_scans += 1
                        is_scanning = True
                else:
                    is_scanning = False

                lhx = int(current_landmarks[PL.LEFT_HIP.value].x * w)
                lhy = int(current_landmarks[PL.LEFT_HIP.value].y * h)
                rhx = int(current_landmarks[PL.RIGHT_HIP.value].x * w)
                rhy = int(current_landmarks[PL.RIGHT_HIP.value].y * h)
                hip_mid = ((lhx + rhx) / 2.0, (lhy + rhy) / 2.0)
                if prev_hip_mid is not None:
                    hd = math.hypot(hip_mid[0] - prev_hip_mid[0], hip_mid[1] - prev_hip_mid[1])
                    if hd > 0.5:
                        speed_samples.append(hd * video_fps)
                prev_hip_mid = hip_mid

        cv2.putText(frame, f"Scans Count: {total_scans}", (50, 90), cv2.FONT_HERSHEY_SIMPLEX, 1, (168, 85, 247), 3)

        if right_ankle and left_ankle:
            currently_right_forward = right_ankle[0] > left_ankle[0]
            if right_foot_forward is None:
                right_foot_forward = currently_right_forward
            elif right_foot_forward != currently_right_forward:
                steps_taken += 1
                right_foot_forward = currently_right_forward

        cv2.putText(frame, f"Steps: {steps_taken}", (50, 130), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 165, 255), 3)

        if heavy_touch_cooldown_frames > 0:
            heavy_touch_cooldown_frames -= 1

        if ball_center and right_ankle and left_ankle:
            dist_right = math.hypot(ball_center[0] - right_ankle[0], ball_center[1] - right_ankle[1])
            dist_left = math.hypot(ball_center[0] - left_ankle[0], ball_center[1] - left_ankle[1])
            closest_foot = right_ankle if dist_right < dist_left else left_ankle
            min_dist = min(dist_right, dist_left)
            cv2.line(frame, closest_foot, ball_center, (0, 255, 0), 2)
            cv2.putText(frame, f"Control Dist: {int(min_dist)} px", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)
            # Only score touch tightness when the ball is plausibly in a control context (not scanning
            # with the ball meters away or a false detection at the edge of the frame).
            diag = max(math.hypot(float(w), float(h)), 1.0)
            # Ball must be this close to a foot (px, scale-free via diagonal) to count touch metrics.
            engage_max_px = diag * 0.24
            # At or below this distance = tight control (not a heavy touch).
            tight_max_px = diag * 0.075
            if min_dist <= engage_max_px:
                scouting_report["metrics"]["touch_tightness_history"].append(round(min_dist, 2))
                # "Heavy touch" = loose control while still engaged (between tight and engagement radius).
                if min_dist > tight_max_px and heavy_touch_cooldown_frames == 0:
                    scouting_report["metrics"]["heavy_touches_counted"] += 1
                    heavy_touch_cooldown_frames = max(12, int(round(video_fps * 0.4)))

        scouting_report["total_frames_processed"] += 1

        if writer is not None:
            writer.write(frame)

        if not headless:
            try:
                disp_w = max(1, int(w * DISPLAY_SCALE))
                disp_h = max(1, int(h * DISPLAY_SCALE))
                display_frame = cv2.resize(frame, (disp_w, disp_h))
                cv2.resizeWindow('Super Mikella Master Engine', disp_w, disp_h)
                cv2.imshow('Super Mikella Master Engine', display_frame)
            except Exception:
                cv2.imshow('Super Mikella Master Engine', frame)

            if cv2.waitKey(10) & 0xFF == ord('q'):
                break

    cap.release()
    if writer is not None:
        writer.release()
    if not headless:
        cv2.destroyAllWindows()

    total_video_seconds = 0
    try:
        total_video_seconds = scouting_report["total_frames_processed"] / float(video_fps) if video_fps and video_fps > 0 else 0
    except Exception:
        total_video_seconds = 0

    if total_video_seconds > 0:
        cadence_spm = (steps_taken / total_video_seconds) * 60
    else:
        cadence_spm = 0

    mv_spd = round(sum(speed_samples) / len(speed_samples), 1) if speed_samples else 0.0
    scouting_report["metrics"]["movement_speed_px_s"] = mv_spd
    scouting_report["metrics"]["total_steps"] = steps_taken
    scouting_report["metrics"]["cadence_spm"] = round(cadence_spm, 1)
    scouting_report["metrics"]["total_scans_detected"] = total_scans
    scouting_report["total_scans_detected"] = total_scans

    if output_json_path is None:
        output_json_path = os.path.join(os.getcwd(), "mikella_scouting_report.json")

    with open(output_json_path, "w") as f:
        json.dump(scouting_report, f, indent=4)

    print(f"\n AI Processing Complete! Saved to: {output_json_path}")
    return scouting_report, output_video_path if writer is not None else None


def _cli_main():
    import argparse
    parser = argparse.ArgumentParser(description='Run Super Mikella engine on a video file')
    parser.add_argument('--video', '-v', required=True, help='Path to input video')
    parser.add_argument('--output', '-o', required=False, help='Path to output JSON')
    parser.add_argument('--headless', action='store_true', help='Run without GUI')
    parser.add_argument('--display-scale', type=float, default=0.6, help='Preview display scale (0.1-1.0)')
    args = parser.parse_args()

    output = args.output if args.output else None
    run_engine_on_video(args.video, output_json_path=output, headless=args.headless, display_scale=args.display_scale)


if __name__ == '__main__':
    _cli_main()