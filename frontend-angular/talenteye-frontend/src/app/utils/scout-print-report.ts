import type {
  PerformanceSummary,
  PlayerProfile1,
  ScoutWrittenReport
} from '../services/api.service';
import {
  RADAR_AXIS_KINDS,
  COACH_FACING_TITLE,
  coachFacingTitleFromApiName,
  inferMetricKind,
  isExcludedCoachMetricName,
  type MetricKind
} from './metric-labels';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) && Math.abs(v) < 1e9 ? String(v) : v.toFixed(2);
}

function playerAgeYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

function metricsTableRows(summary: PerformanceSummary | null | undefined): string {
  const ms = summary?.metrics_summary;
  if (!ms || !Object.keys(ms).length) {
    return '<p class="muted">No aggregated performance metrics yet (no completed drill analysis).</p>';
  }

  const byKind = new Map<MetricKind, { name: string; unit: string; average: number }>();
  const extras: { name: string; unit: string; average: number }[] = [];

  for (const [rawKey, d] of Object.entries(ms)) {
    if (isExcludedCoachMetricName(rawKey) || isExcludedCoachMetricName(d.name)) continue;
    const kind = inferMetricKind(d.name) ?? inferMetricKind(rawKey);
    if (kind && RADAR_AXIS_KINDS.includes(kind)) {
      byKind.set(kind, d);
    } else {
      extras.push(d);
    }
  }

  const ordered: { label: string; unit: string; average: number }[] = [];
  for (const k of RADAR_AXIS_KINDS) {
    const row = byKind.get(k);
    if (row) {
      ordered.push({ label: COACH_FACING_TITLE[k], unit: row.unit, average: row.average });
    }
  }
  extras.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of extras) {
    ordered.push({
      label: coachFacingTitleFromApiName(e.name),
      unit: e.unit,
      average: e.average
    });
  }

  const body = ordered
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.label)}</td><td class="num">${escapeHtml(
          formatNum(r.average)
        )}</td><td>${escapeHtml(r.unit || '—')}</td></tr>`
    )
    .join('');

  return `<table class="metrics">
    <thead><tr><th>Metric</th><th>Average</th><th>Unit</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function writtenReportsSection(reports: ScoutWrittenReport[]): string {
  if (!reports.length) {
    return '<p class="muted">No written scout reports on file for this player.</p>';
  }
  return reports
    .map((r) => {
      const title = r.title?.trim() ? `<h3>${escapeHtml(r.title)}</h3>` : '';
      const when = r.created_at
        ? `<div class="report-meta">${escapeHtml(new Date(r.created_at).toLocaleString())}</div>`
        : '';
      const body = escapeHtml(r.body).replace(/\n/g, '<br/>');
      return `<article class="report-block">${title}${when}<div class="report-body">${body}</div></article>`;
    })
    .join('');
}

export interface ScoutPrintReportInput {
  player: PlayerProfile1;
  performanceSummary: PerformanceSummary | null;
  writtenReports: ScoutWrittenReport[];
  scoutDisplayName?: string | null;
  generatedAt?: Date;
}

/**
 * Full HTML document for print / Save as PDF (browser print dialog).
 */
export function buildScoutPlayerPrintableReportHtml(input: ScoutPrintReportInput): string {
  const { player, performanceSummary, writtenReports, scoutDisplayName } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const age = playerAgeYears(player.date_of_birth);
  const rating =
    performanceSummary?.overall_rating != null && performanceSummary.overall_rating > 0
      ? String(performanceSummary.overall_rating)
      : '—';
  const videos = performanceSummary?.total_videos ?? 0;

  const metaBits: string[] = [];
  if (age != null) metaBits.push(`${age} years`);
  if (player.height_cm) metaBits.push(`${player.height_cm} cm`);
  if (player.location) metaBits.push(player.location);
  if (player.preferred_position) metaBits.push(player.preferred_position);
  if (player.dominant_foot) metaBits.push(`${player.dominant_foot} foot`);

  const title = `TalentEye — Scout report: ${player.username}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --navy: #0A2342;
      --green: #006400;
      --paper: #fafbfc;
      --ink: #2D3748;
      --muted: #64748b;
      --line: #e2e8f0;
      --accent: #0f766e;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.55;
      margin: 0;
      padding: 0 0 2rem;
      font-size: 15px;
    }
    .no-print {
      position: sticky;
      top: 0;
      z-index: 10;
      background: linear-gradient(135deg, var(--navy) 0%, #0d3a5c 100%);
      color: #fff;
      padding: 14px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 20px;
      box-shadow: 0 4px 20px rgba(10, 35, 66, 0.25);
    }
    .no-print button {
      background: #fff;
      color: var(--navy);
      border: 0;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
    }
    .no-print button:hover { filter: brightness(0.95); }
    .no-print .hint { font-size: 13px; opacity: 0.92; max-width: 520px; }
    .wrap { max-width: 800px; margin: 0 auto; padding: 28px 24px 48px; }
    .hero {
      background: linear-gradient(120deg, var(--navy) 0%, #134e7c 55%, var(--green) 160%);
      color: #fff;
      border-radius: 16px;
      padding: 28px 32px;
      margin-bottom: 28px;
      box-shadow: 0 12px 40px rgba(10, 35, 66, 0.22);
    }
    .hero h1 { margin: 0 0 8px; font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
    .hero .sub { opacity: 0.9; font-size: 0.95rem; }
    .badges { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .badge {
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(6px);
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .badge strong { font-weight: 700; margin-right: 6px; opacity: 0.85; }
    section {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 22px 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(10, 35, 66, 0.06);
    }
    section h2 {
      margin: 0 0 14px;
      font-size: 1.1rem;
      color: var(--navy);
      border-bottom: 2px solid var(--accent);
      padding-bottom: 8px;
      display: inline-block;
    }
    .muted { color: var(--muted); font-size: 0.95rem; }
    .dl-grid { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; }
    .dl-grid dt { color: var(--muted); font-weight: 600; font-size: 0.88rem; }
    .dl-grid dd { margin: 0; }
    table.metrics { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    table.metrics th, table.metrics td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
    }
    table.metrics th {
      background: #f1f5f9;
      color: var(--navy);
      font-weight: 600;
    }
    table.metrics .num { font-variant-numeric: tabular-nums; font-weight: 600; }
    .report-block {
      border-left: 4px solid var(--accent);
      padding: 12px 0 12px 18px;
      margin-bottom: 20px;
      background: #f8fafc;
      border-radius: 0 10px 10px 0;
    }
    .report-block h3 { margin: 0 0 6px; font-size: 1rem; color: var(--navy); }
    .report-meta { font-size: 0.82rem; color: var(--muted); margin-bottom: 10px; }
    .report-body { white-space: pre-wrap; font-size: 0.95rem; }
    footer {
      text-align: center;
      color: var(--muted);
      font-size: 0.8rem;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; padding: 0; font-size: 11pt; }
      .wrap { max-width: none; padding: 0 12mm; }
      .hero { break-inside: avoid; box-shadow: none; }
      section { break-inside: avoid; box-shadow: none; border: 1px solid #ccc; }
      table.metrics { break-inside: auto; }
      tr { break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
    <span class="hint">In the print dialog, choose <strong>Save as PDF</strong> (or Microsoft Print to PDF) to download a PDF copy.</span>
  </div>
  <div class="wrap">
    <header class="hero">
      <h1>${escapeHtml(player.username)}</h1>
      <p class="sub">TalentEye scout performance report</p>
      <div class="badges">
        <span class="badge"><strong>Overall</strong>${escapeHtml(rating)}</span>
        <span class="badge"><strong>Videos</strong>${escapeHtml(String(videos))} analyzed</span>
      </div>
    </header>

    <section>
      <h2>Profile</h2>
      <dl class="dl-grid">
        <dt>Generated</dt><dd>${escapeHtml(generatedAt.toLocaleString())}</dd>
        ${
          scoutDisplayName
            ? `<dt>Scout</dt><dd>${escapeHtml(scoutDisplayName)}</dd>`
            : ''
        }
        <dt>Player</dt><dd>${escapeHtml(player.username)}</dd>
        ${
          metaBits.length
            ? `<dt>Details</dt><dd>${escapeHtml(metaBits.join(' · '))}</dd>`
            : ''
        }
      </dl>
    </section>

    <section>
      <h2>Performance metrics</h2>
      <p class="muted" style="margin-top:0;margin-bottom:14px;">Averages across completed drill videos (engine-derived).</p>
      ${metricsTableRows(performanceSummary)}
    </section>

    <section>
      <h2>Written reports</h2>
      ${writtenReportsSection(writtenReports)}
    </section>

    <footer>
      Confidential — TalentEye · ${escapeHtml(generatedAt.getFullYear().toString())}
    </footer>
  </div>
</body>
</html>`;
}
