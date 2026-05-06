from django.test import SimpleTestCase

from videos.tasks import _extract_metric_values


class MetricExtractionTests(SimpleTestCase):
	def test_extracts_all_known_metrics_and_average(self):
		report = {
			"total_frames_processed": 120,
			"metrics": {
				"heavy_touches_counted": 3,
				"total_steps": 40,
				"cadence_spm": 85.5,
				"total_scans_detected": 7,
				"touch_tightness_history": [100, 120, 80],
			},
		}
		values = _extract_metric_values(report)
		self.assertEqual(values["heavy_touches_counted"], 3)
		self.assertEqual(values["total_steps"], 40)
		self.assertEqual(values["cadence_spm"], 85.5)
		self.assertEqual(values["total_scans_detected"], 7)
		self.assertEqual(values["avg_touch_tightness"], 100.0)

	def test_handles_missing_fields_gracefully(self):
		values = _extract_metric_values({"metrics": {}})
		self.assertEqual(values, {})
