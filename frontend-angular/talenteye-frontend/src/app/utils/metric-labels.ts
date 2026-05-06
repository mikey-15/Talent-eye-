import { Metric } from '../services/api.service';

/**
 * Raw engine values at which the 0–100 display score saturates.
 * Calibrated for ~30s clips: total-count metrics (steps, scans) use lower caps than long drills;
 * rates (cadence, px/s) are slightly relaxed so short bursts still show strong scores.
 * Keep in sync with `players/performance_rating.py`.
 */
export const METRIC_NORMALIZATION = {
  CADENCE_SPM_AT_100: 92,
  MOVEMENT_PX_S_AT_100: 200,
  SCANS_COUNT_AT_100: 5,
  STEPS_COUNT_AT_100: 38,
  TOUCH_AVG_PX_CAP: 170,
  TOUCH_AVG_PX_DIVISOR: 2.45
} as const;

/** Stable ids matching backend `MetricDefinition.key` values. */
export type MetricKind =
  | 'total_steps'
  | 'cadence_spm'
  | 'total_scans_detected'
  | 'avg_touch_tightness'
  | 'movement_speed_px_s';

/** API / DB metric names (old and new) → resolve values after renames. */
const KIND_ALIASES: Record<MetricKind, string[]> = {
  total_steps: ['Total Steps', 'Steps with the ball', 'Steps on the ball', 'Steps taken', 'Steps', 'total_steps'],
  cadence_spm: ['Cadence', 'Footwork tempo', 'cadence_spm', 'Footwork tempo (steps/min)'],
  total_scans_detected: [
    'Total Scans',
    'Shoulder checks',
    'total_scans_detected',
    'Scanning (head checks)'
  ],
  avg_touch_tightness: [
    'Avg Touch Tightness',
    'Ball-to-foot spacing',
    'avg_touch_tightness',
    'Average gap (ball to foot)',
    'Average ball-to-foot spacing'
  ],
  movement_speed_px_s: [
    'movement_speed_px_s',
    'Movement speed',
    'Hip movement speed',
    'movement speed'
  ]
};

/** Short titles shown to players, coaches, and scouts (football language, not lab jargon). */
export const COACH_FACING_TITLE: Record<MetricKind, string> = {
  total_scans_detected: 'Scanning',
  cadence_spm: 'Quick feet',
  total_steps: 'Steps',
  avg_touch_tightness: 'Close control',
  movement_speed_px_s: 'Mobility'
};

/** One-line hints for tooltips / subtitles (optional). */
export const COACH_FACING_HINT: Record<MetricKind, string> = {
  total_scans_detected: 'How often you looked around like you were scanning before a pass or turn.',
  cadence_spm: 'How quickly your feet were moving (steps per minute in the clip).',
  total_steps: 'Foot switches counted from pose while you were in frame.',
  avg_touch_tightness: 'Average space between ball and your nearest foot in the video. Lower usually means tighter control.',
  movement_speed_px_s:
    'How fast your hip center moved in the frame (pixels per second). Compare clips shot with similar camera distance.'
};

/** Radar / dashboard axis order (matches previous product order). */
export const RADAR_AXIS_KINDS: MetricKind[] = [
  'total_scans_detected',
  'cadence_spm',
  'movement_speed_px_s',
  'total_steps',
  'avg_touch_tightness'
];

export const RADAR_AXIS_LABELS: string[] = RADAR_AXIS_KINDS.map((k) => COACH_FACING_TITLE[k]);

export function inferMetricKind(name: string | null | undefined): MetricKind | null {
  if (name == null || !String(name).trim()) return null;
  const n = String(name).trim().toLowerCase();

  const directKey = (Object.keys(KIND_ALIASES) as MetricKind[]).find((k) => k === n);
  if (directKey) return directKey;

  const tryExact = (): MetricKind | null => {
    for (const kind of Object.keys(KIND_ALIASES) as MetricKind[]) {
      for (const a of KIND_ALIASES[kind]) {
        if (n === a.toLowerCase()) return kind;
      }
    }
    return null;
  };

  const exact = tryExact();
  if (exact) return exact;

  // Substring fallbacks (order matters: more specific first)
  if (n.includes('ball') && (n.includes('foot') || n.includes('spacing') || n.includes('tight'))) {
    return 'avg_touch_tightness';
  }
  if (n.includes('shoulder') || (n.includes('scan') && !n.includes('per')) || n.includes('head check')) {
    return 'total_scans_detected';
  }
  if (n.includes('cadence') || n.includes('footwork tempo') || n.includes('steps/min') || n.includes('spm')) {
    return 'cadence_spm';
  }
  if (n.includes('total step') || (n.includes('step') && n.includes('ball'))) return 'total_steps';
  if (n.includes('movement speed') || n.includes('px/s') || n.includes('movement_speed')) {
    return 'movement_speed_px_s';
  }

  return null;
}

export function coachFacingTitleFromApiName(apiName: string): string {
  const kind = inferMetricKind(apiName);
  return kind ? COACH_FACING_TITLE[kind] : apiName;
}

/** Legacy engine metric; hidden from player-facing tables when it still appears in API payloads. */
export function isExcludedCoachMetricName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const n = String(name).trim().toLowerCase();
  return (
    n.includes('heavy touch') ||
    n.includes('loose touch') ||
    n === 'heavy_touches_counted'
  );
}

export function metricValueForKind(metrics: Metric[], kind: MetricKind): number | null {
  const aliases = KIND_ALIASES[kind];
  const byLower = new Map(metrics.map((m) => [m.metric_name.trim().toLowerCase(), m.value]));
  for (const a of aliases) {
    const v = byLower.get(a.toLowerCase());
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  for (const m of metrics) {
    const mn = m.metric_name.toLowerCase();
    for (const a of aliases) {
      const al = a.toLowerCase();
      if (al.length >= 5 && mn.includes(al)) return m.value;
    }
  }
  return null;
}

/** Same 0–100 scaling as backend `normalize_engine_metric`, keyed by kind. */
export function normalizeMetricByKind(kind: MetricKind, value: number): number {
  const N = METRIC_NORMALIZATION;
  switch (kind) {
    case 'cadence_spm':
      return Math.min(100, Math.max(0, (value / N.CADENCE_SPM_AT_100) * 100));
    case 'total_steps':
      return Math.min(100, Math.max(0, (value / N.STEPS_COUNT_AT_100) * 100));
    case 'total_scans_detected':
      return Math.min(100, Math.max(0, (value / N.SCANS_COUNT_AT_100) * 100));
    case 'avg_touch_tightness':
      return Math.min(
        100,
        Math.max(0, 100 - Math.min(value, N.TOUCH_AVG_PX_CAP) / N.TOUCH_AVG_PX_DIVISOR)
      );
    case 'movement_speed_px_s':
      return Math.min(100, Math.max(0, (value / N.MOVEMENT_PX_S_AT_100) * 100));
    default:
      return Math.min(100, Math.max(0, value));
  }
}
