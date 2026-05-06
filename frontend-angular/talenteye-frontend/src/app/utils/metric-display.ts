import { Metric, DrillVideoResultPayload } from '../services/api.service';
import {
  inferMetricKind,
  METRIC_NORMALIZATION,
  normalizeMetricByKind,
  type MetricKind
} from './metric-labels';

/** Single 0–100 “how good is this session on this axis?” score for scouts & players. */
export function scoutQualityPercent(metricName: string, rawValue: number): number {
  const kind = inferMetricKind(metricName);
  if (!kind) return Math.min(100, Math.max(0, Number(rawValue)));
  return normalizeMetricByKind(kind, Number(rawValue));
}

export function scoutQualityPercentForKind(kind: MetricKind, rawValue: number): number {
  return normalizeMetricByKind(kind, rawValue);
}

/** Rough 0–100 scale for radar / comparison (AI metrics use mixed units). */
export function normalizeMetricTo100(name: string, value: number): number {
  const kind = inferMetricKind(name);
  if (kind) return normalizeMetricByKind(kind, value);
  const N = METRIC_NORMALIZATION;
  const n = name.toLowerCase();
  if (n.includes('cadence') || n.includes('footwork tempo') || n.includes('steps/min')) {
    return Math.min(100, Math.max(0, (value / N.CADENCE_SPM_AT_100) * 100));
  }
  if (n.includes('step')) return Math.min(100, Math.max(0, (value / N.STEPS_COUNT_AT_100) * 100));
  if (n.includes('scan') || n.includes('shoulder')) return Math.min(100, Math.max(0, (value / N.SCANS_COUNT_AT_100) * 100));
  if (n.includes('tightness') || n.includes('spacing') || (n.includes('ball') && n.includes('foot'))) {
    return Math.min(
      100,
      Math.max(0, 100 - Math.min(value, N.TOUCH_AVG_PX_CAP) / N.TOUCH_AVG_PX_DIVISOR)
    );
  }
  if (n.includes('movement speed') || n.includes('px/s')) {
    return Math.min(100, Math.max(0, (value / N.MOVEMENT_PX_S_AT_100) * 100));
  }
  return Math.min(100, Math.max(0, value));
}

export function aggregatePayloadScore(payload: DrillVideoResultPayload | null | undefined): number | null {
  if (!payload) return null;
  const m = payload.metrics || payload;
  const parts: number[] = [];
  const push = (name: string, v: number | null | undefined) => {
    if (v != null && !Number.isNaN(Number(v))) parts.push(normalizeMetricTo100(name, Number(v)));
  };
  push('cadence', m.cadence_spm ?? (payload as any).cadence_spm);
  push('steps', m.total_steps ?? (payload as any).total_steps);
  push('scans', m.total_scans_detected ?? (payload as any).total_scans_detected);
  push('movement speed', m.movement_speed_px_s ?? (payload as any).movement_speed_px_s);
  const hist = m.touch_tightness_history || (payload as any).touch_tightness_history;
  if (Array.isArray(hist) && hist.length) {
    const avg = hist.reduce((a: number, b: number) => a + Number(b), 0) / hist.length;
    push('tightness', avg);
  } else if (m.avg_touch_tightness != null) {
    push('tightness', m.avg_touch_tightness);
  }
  if (!parts.length) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export function formatMetricValue(m: Metric): string {
  const v = m.value;
  const unit = (m.unit || '').toLowerCase();
  if (unit === 'count' || unit === 'steps_per_min') {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  if (unit === 'px/s') {
    return v.toFixed(1);
  }
  return v.toFixed(1);
}

export function metricDisplayUnit(m: Metric): string {
  const kind = inferMetricKind(m.metric_name);
  if (kind === 'cadence_spm' || m.unit === 'steps_per_min') return 'steps/min';
  if (m.unit === 'count' || kind === 'total_scans_detected') {
    return '';
  }
  if (kind === 'avg_touch_tightness' && (m.unit === 'px' || !m.unit)) return 'px';
  if (kind === 'movement_speed_px_s' || (m.unit || '').toLowerCase() === 'px/s') return 'px/s';
  return m.unit || '';
}
