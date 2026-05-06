"""Shared TalentEye 0–100 overall rating from aggregated metric averages."""

from __future__ import annotations

from collections import defaultdict
from typing import Any


# Match frontend `METRIC_NORMALIZATION` — calibrated for ~30s clips (see metric-labels.ts).
CADENCE_SPM_AT_100 = 92.0
MOVEMENT_PX_S_AT_100 = 200.0
SCANS_COUNT_AT_100 = 5.0
STEPS_COUNT_AT_100 = 38.0
HEAVY_TOUCHES_AT_MIN = 40.0
TOUCH_AVG_PX_CAP = 170.0
TOUCH_AVG_PX_DIVISOR = 2.45


def normalize_engine_metric(metric_key: str, value: Any) -> float:
    """Map engine averages to 0–100 (higher is better unless noted)."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0

    if metric_key == "cadence_spm":
        return min(100.0, max(0.0, (v / CADENCE_SPM_AT_100) * 100.0))
    if metric_key == "movement_speed_px_s":
        return min(100.0, max(0.0, (v / MOVEMENT_PX_S_AT_100) * 100.0))
    if metric_key == "total_scans_detected":
        return min(100.0, max(0.0, (v / SCANS_COUNT_AT_100) * 100.0))
    if metric_key == "total_steps":
        return min(100.0, max(0.0, (v / STEPS_COUNT_AT_100) * 100.0))
    if metric_key == "heavy_touches_counted":
        return min(100.0, max(0.0, 100.0 - min(v / HEAVY_TOUCHES_AT_MIN, 1.0) * 100.0))
    if metric_key == "avg_touch_tightness":
        return min(
            100.0,
            max(0.0, 100.0 - min(v, TOUCH_AVG_PX_CAP) / TOUCH_AVG_PX_DIVISOR),
        )
    return min(100.0, max(0.0, v))


def calculate_overall_rating(metrics_summary: dict) -> float:
    """Weighted 0–100 from metrics_summary (keys = metric_key, values have 'average')."""
    weights = {
        "movement_speed_px_s": 0.18,
        "cadence_spm": 0.22,
        "total_scans_detected": 0.18,
        "total_steps": 0.12,
        "heavy_touches_counted": 0.15,
        "avg_touch_tightness": 0.15,
    }

    total_weight = 0.0
    weighted_sum = 0.0

    for metric_key, data in metrics_summary.items():
        w = weights.get(metric_key)
        if not w:
            continue
        avg = data.get("average")
        if avg is None:
            continue
        normalized = normalize_engine_metric(metric_key, avg)
        weighted_sum += normalized * w
        total_weight += w

    if total_weight == 0:
        return 0.0

    return round(weighted_sum / total_weight, 1)


def bulk_overall_ratings_by_player_id(player_ids: list[int]) -> dict[int, float | None]:
    """
    One DB pass: map player_id -> overall_rating or None if no completed video metrics.
    """
    if not player_ids:
        return {}

    from videos.models import DrillVideo
    from metrics.models import MetricResult

    videos = DrillVideo.objects.filter(
        player_id__in=player_ids, status="COMPLETED"
    ).values("id", "player_id")
    video_rows = list(videos)
    if not video_rows:
        return {int(pid): None for pid in player_ids}

    vid_to_player = {int(r["id"]): int(r["player_id"]) for r in video_rows}
    video_ids = list(vid_to_player.keys())

    results = MetricResult.objects.filter(video_id__in=video_ids).select_related("metric")
    # player_id -> metric_key -> list of values
    buckets: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for r in results:
        pid = vid_to_player.get(int(r.video_id))
        if pid is None:
            continue
        key = r.metric.key
        buckets[pid][key].append(float(r.value))

    weight_keys = {
        "movement_speed_px_s",
        "cadence_spm",
        "total_scans_detected",
        "total_steps",
        "heavy_touches_counted",
        "avg_touch_tightness",
    }
    out: dict[int, float | None] = {}
    for pid in player_ids:
        pid = int(pid)
        if pid not in buckets or not buckets[pid]:
            out[pid] = None
            continue
        metrics_summary = {}
        for k, vals in buckets[pid].items():
            metrics_summary[k] = {"average": sum(vals) / len(vals)}
        if not any(k in weight_keys for k in metrics_summary):
            out[pid] = None
            continue
        out[pid] = calculate_overall_rating(metrics_summary)

    return out
