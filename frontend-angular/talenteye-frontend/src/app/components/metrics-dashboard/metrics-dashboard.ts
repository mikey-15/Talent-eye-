
import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChartConfiguration, ChartData } from 'chart.js';
import { ApiService, Metric, Video } from '../../services/api.service';
import { ToastrService } from 'ngx-toastr';
import {
  COACH_FACING_TITLE,
  coachFacingTitleFromApiName,
  isExcludedCoachMetricName,
  metricValueForKind,
  normalizeMetricByKind
} from '../../utils/metric-labels';
import { forkJoin, Observable, of, Subject } from 'rxjs';
import { catchError, finalize, map, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-metrics-dashboard',
  standalone: false,
  templateUrl: './metrics-dashboard.html',
  styleUrls: ['./metrics-dashboard.css']
})
export class MetricsDashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  isLoading = false;
  videos: Video[] = [];
  selectedVideoId: number | null = null;
  metrics: Metric[] = [];
  hasMetricsData = false;
  touchTightnessHistory: number[] = [];
  hasTouchHistory = false;
  /** True when the engine returned no per-touch samples; chart is a flat series from average tightness. */
  touchHistoryIsSynthetic = false;
  kpi = {
    totalSteps: null as number | null,
    cadenceSpm: null as number | null,
    totalScans: null as number | null,
    avgTouchTightness: null as number | null,
    movementSpeedPxS: null as number | null,
    totalFrames: null as number | null,
  };
  overall = {
    videoCount: 0,
    totalStepsAvg: null as number | null,
    cadenceSpmAvg: null as number | null,
    totalScansAvg: null as number | null,
    avgTouchTightnessAvg: null as number | null,
    movementSpeedPxSAvg: null as number | null,
    totalFramesAvg: null as number | null,
  };
  
  barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: {}
      }
    }
  };

  barChartData: ChartData<'bar'> = {
    labels: [
      COACH_FACING_TITLE.total_steps,
      COACH_FACING_TITLE.total_scans_detected,
      COACH_FACING_TITLE.cadence_spm
    ],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)'
      ],
      borderColor: [
        'rgb(255, 99, 132)',
        'rgb(54, 162, 235)',
        'rgb(255, 206, 86)'
      ],
      borderWidth: 1,
      maxBarThickness: 60
    }]
  };

  touchChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        max: 100,
        title: { display: true, text: 'Close control score (0–100%)' }
      }
    }
  };

  touchChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Close control (session score)',
        data: [],
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.2,
        pointRadius: 0
      }
    ]
  };

  constructor(
    private apiService: ApiService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const requestedId = params['videoId'] ? Number(params['videoId']) : null;
        this.loadVideos(requestedId);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadVideos(requestedId?: number | null): void {
    this.isLoading = true;
    this.apiService.getMyVideos()
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error loading videos:', error);
          this.toastr.error('Failed to load videos', 'Error');
          return of([] as Video[]);
        })
      )
      .subscribe({
        next: (videos) => {
          this.videos = (videos || []).filter(v => v.status === 'COMPLETED');

          this.computeOverallAverages();

          if (this.videos.length > 0) {
            const matched = requestedId && this.videos.find(v => v.id === requestedId);
            this.selectedVideoId = matched ? matched.id : this.videos[0].id;
            this.loadMetricsAndHistory(this.selectedVideoId);
          } else {
            this.isLoading = false;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  loadMetricsAndHistory(videoId: number): void {
    this.isLoading = true;
    this.touchHistoryIsSynthetic = false;
    const video = this.videos.find((v) => v.id === videoId);

    forkJoin({
      metrics: this.apiService.getVideoMetrics(videoId).pipe(
        catchError((error) => {
          console.error('Error loading metrics:', error);
          this.toastr.error('Failed to load metrics', 'Error');
          return of([] as Metric[]);
        })
      ),
      payload: this.loadMergedPayload(video)
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe(({ metrics, payload }) => {
        this.metrics = metrics || [];
        const payloadSource =
          typeof payload === 'string'
            ? (() => {
                try {
                  return JSON.parse(payload);
                } catch {
                  return {};
                }
              })()
            : payload && typeof payload === 'object'
              ? payload
              : {};

        const lookup = new Map<string, number>();
        this.metrics.forEach((m) => lookup.set(m.metric_name, m.value));
        const metricByName = (name: string) => lookup.get(name) ?? null;

        const totalFrames =
          payloadSource?.total_frames_processed ??
          payloadSource?.metrics?.total_frames_processed ??
          null;
        this.kpi.totalFrames = totalFrames;

        const stepsFromPayload = payloadSource?.metrics?.total_steps ?? payloadSource?.total_steps;
        const cadenceFromPayload =
          payloadSource?.metrics?.cadence_spm ?? payloadSource?.cadence_spm;
        const scansFromPayload =
          payloadSource?.metrics?.total_scans_detected ?? payloadSource?.total_scans_detected;
        const movementFromPayload =
          payloadSource?.metrics?.movement_speed_px_s ?? payloadSource?.movement_speed_px_s;

        const rawTouchHist =
          payloadSource?.metrics?.touch_tightness_history ??
          payloadSource?.touch_tightness_history ??
          [];
        let numericHistory = Array.isArray(rawTouchHist)
          ? rawTouchHist.map((v: unknown) => Number(v)).filter((v) => !Number.isNaN(v))
          : [];

        const avgFromRealHistory =
          numericHistory.length > 0
            ? numericHistory.reduce((sum, val) => sum + val, 0) / numericHistory.length
            : null;

        const avgTouchFromPayload =
          payloadSource?.metrics?.avg_touch_tightness ??
          payloadSource?.avg_touch_tightness ??
          avgFromRealHistory;

        this.kpi.totalSteps =
          stepsFromPayload ?? metricValueForKind(this.metrics, 'total_steps') ?? metricByName('Total Steps');
        this.kpi.cadenceSpm =
          cadenceFromPayload ?? metricValueForKind(this.metrics, 'cadence_spm') ?? metricByName('Cadence');
        this.kpi.totalScans =
          scansFromPayload ??
          metricValueForKind(this.metrics, 'total_scans_detected') ??
          metricByName('Total Scans');
        this.kpi.avgTouchTightness =
          avgTouchFromPayload ??
          metricValueForKind(this.metrics, 'avg_touch_tightness') ??
          metricByName('Avg Touch Tightness');
        const mspN = movementFromPayload != null ? Number(movementFromPayload) : NaN;
        this.kpi.movementSpeedPxS = Number.isFinite(mspN)
          ? mspN
          : metricValueForKind(this.metrics, 'movement_speed_px_s') ??
            metricByName('Movement speed');

        if (numericHistory.length === 1) {
          numericHistory = [numericHistory[0], numericHistory[0]];
        }

        this.touchHistoryIsSynthetic = false;
        if (numericHistory.length === 0) {
          const avgForLine = this.kpi.avgTouchTightness;
          const frames = this.kpi.totalFrames ?? 24;
          if (avgForLine != null && frames > 0) {
            const n = Math.min(Math.max(frames, 12), 80);
            numericHistory = Array.from({ length: n }, () => avgForLine);
            this.touchHistoryIsSynthetic = true;
          }
        }

        this.touchTightnessHistory = numericHistory.map((rawPx) =>
          normalizeMetricByKind('avg_touch_tightness', rawPx)
        );
        this.hasTouchHistory = numericHistory.length > 0;

        this.hasMetricsData =
          this.metrics.length > 0 ||
          this.touchTightnessHistory.length > 0 ||
          Object.values(this.kpi).some((v) => v !== null);

        this.updateCharts();
        this.cdr.detectChanges();
      });
  }

  /** Merge list `result_payload` with full JSON file so `touch_tightness_history` is never dropped when the list view is partial. */
  private loadMergedPayload(video: Video | undefined): Observable<Record<string, unknown>> {
    if (!video) {
      return of({});
    }
    const cached = video.result_payload;
    const url = video.result_json_url || video.result_json;
    if (!url) {
      return of(
        cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : {}
      );
    }
    return this.apiService.fetchResultJson(url).pipe(
      map((remote) => this.mergeResultPayloads(cached, remote)),
      catchError((err) => {
        console.error('Error loading result JSON:', err);
        this.toastr.warning('Using cached metrics only; full JSON could not be loaded.', 'Payload');
        return of(
          cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : {}
        );
      })
    );
  }

  private mergeResultPayloads(cached: unknown, remote: unknown): Record<string, unknown> {
    const c = cached && typeof cached === 'object' && !Array.isArray(cached) ? { ...(cached as object) } : {};
    const r = remote && typeof remote === 'object' && !Array.isArray(remote) ? (remote as Record<string, unknown>) : {};
    const cm =
      c && typeof (c as { metrics?: unknown }).metrics === 'object'
        ? { ...((c as { metrics: Record<string, unknown> }).metrics) }
        : {};
    const rMetrics = r['metrics'];
    const rm =
      rMetrics && typeof rMetrics === 'object' && !Array.isArray(rMetrics)
        ? { ...(rMetrics as Record<string, unknown>) }
        : {};
    const h1 = Array.isArray(cm['touch_tightness_history']) ? (cm['touch_tightness_history'] as unknown[]) : [];
    const h2 = Array.isArray(rm['touch_tightness_history']) ? (rm['touch_tightness_history'] as unknown[]) : [];
    const touch_tightness_history = h2.length > 0 ? h2 : h1;
    return {
      ...(c as Record<string, unknown>),
      ...r,
      total_frames_processed:
        r['total_frames_processed'] ?? (c as { total_frames_processed?: unknown }).total_frames_processed,
      total_scans_detected:
        r['total_scans_detected'] ?? (c as { total_scans_detected?: unknown }).total_scans_detected,
      metrics: {
        ...cm,
        ...rm,
        touch_tightness_history
      }
    } as Record<string, unknown>;
  }

  resultDocUrl(): string | null {
    const v = this.selectedVideo;
    if (!v) return null;
    return this.apiService.resolveMediaUrl(v.result_json_url || v.result_json || null);
  }

  annotatedCoachingVideoUrl(): string | null {
    const v = this.selectedVideo;
    if (!v) return null;
    return this.apiService.resolveMediaUrl(v.annotated_video_url || v.annotated_video || null);
  }

  /** Session-specific cues from this clip vs your recent uploads (same coaching clip). */
  actionTips(): string[] {
    const tips: string[] = [];
    const v = this.selectedVideo;
    const label = v
      ? `This clip (${new Date(v.uploaded_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })})`
      : 'This clip';

    const scans = this.kpi.totalScans;
    const cad = this.kpi.cadenceSpm;
    const tight = this.kpi.avgTouchTightness;
    const spd = this.kpi.movementSpeedPxS;

    const ov = this.overall;
    const multi = ov.videoCount > 1;

    const cmp = (cur: number | null, avg: number | null, higherIsBetter: boolean): 'above' | 'below' | 'same' | null => {
      if (cur == null || avg == null || !multi) return null;
      const diff = (cur - avg) / (Math.abs(avg) < 1e-6 ? 1 : avg);
      if (Math.abs(diff) < 0.08) return 'same';
      if (higherIsBetter) return diff > 0 ? 'above' : 'below';
      return diff < 0 ? 'above' : 'below';
    };

    if (scans != null && scans < 3) {
      tips.push(
        `${label}: try more picture checks before you receive—you want a quick look over the shoulder when pressure is coming.`
      );
    } else if (scans != null && cmp(scans, ov.totalScansAvg, true) === 'above') {
      tips.push(`${label}: your scanning count is up versus your recent clips—keep demanding pictures before every touch.`);
    }

    if (cad != null && cad < 90) {
      tips.push(`${label}: feet could be busier in tight spaces—stay on your toes so you can shift balance faster.`);
    } else if (cad != null && cmp(cad, ov.cadenceSpmAvg, true) === 'below') {
      tips.push(`${label}: tempo is a touch slower than your usual sessions—check if you were waiting too long before moving the feet.`);
    }

    if (tight != null && tight > 80) {
      tips.push(`${label}: ball was riding a bit far from the boot—shorten the gap when you dribble in traffic.`);
    } else if (tight != null && cmp(tight, ov.avgTouchTightnessAvg, false) === 'above') {
      tips.push(`${label}: close control looks tighter than your recent uploads—nice trap-to-carry spacing here.`);
    } else if (tight != null && cmp(tight, ov.avgTouchTightnessAvg, false) === 'below') {
      tips.push(`${label}: the ball is sitting farther from the foot than in your recent clips—nudge touches closer.`);
    }

    if (spd != null && spd < 40 && (cad ?? 0) > 100) {
      tips.push(
        `${label}: lots of quick steps but limited ground covered—when space opens, commit hips and push into it.`
      );
    }

    if (tips.length === 0) {
      tips.push(
        `${label}: numbers look balanced—use the overlay clip to spot one habit to repeat and one to sharpen next time.`
      );
    } else {
      tips.push(`Watch this same clip with overlays on to match these moments to how the session felt.`);
    }
    return tips;
  }

  updateCharts(): void {
    const steps = this.kpi.totalSteps ?? 0;
    const scans = this.kpi.totalScans ?? 0;
    const cadence = this.kpi.cadenceSpm ?? 0;
    this.barChartData = {
      ...this.barChartData,
      datasets: [
        {
          ...this.barChartData.datasets[0],
          data: [steps, scans, cadence]
        }
      ]
    };

    const history = this.touchTightnessHistory || [];
    const ds0 = this.touchChartData.datasets[0];
    this.touchChartData = {
      ...this.touchChartData,
      labels: history.map((_, idx) =>
        this.touchHistoryIsSynthetic ? `Segment ${idx + 1}` : `Moment ${idx + 1}`
      ),
      datasets: [
        {
          ...ds0,
          label: this.touchHistoryIsSynthetic
            ? 'Close control score — estimated from your average touch'
            : 'Close control score through the clip',
          data: history,
          pointRadius: history.length <= 24 ? 2 : 0,
          borderColor: this.touchHistoryIsSynthetic ? 'rgb(16, 185, 129)' : 'rgb(54, 162, 235)',
          backgroundColor: this.touchHistoryIsSynthetic
            ? 'rgba(16, 185, 129, 0.12)'
            : 'rgba(54, 162, 235, 0.1)'
        }
      ]
    };
  }

  onVideoSelect(videoId: number | string): void {
    const id = typeof videoId === 'string' ? Number(videoId) : videoId;
    if (!Number.isFinite(id)) return;
    this.selectedVideoId = id;
    this.loadMetricsAndHistory(id);
  }

  downloadReport(): void {
    const v = this.selectedVideo;
    if (!v) {
      this.toastr.warning('Select a video first.', 'Report');
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cc = this.closeControlScorePercent();
    const dr = this.driveScorePercent();
    const kRows: [string, string][] = [
      ['Frames processed', this.fmt(this.kpi.totalFrames)],
      ['Close control score (0–100)', cc != null ? `${cc.toFixed(0)}` : this.fmt(this.kpi.avgTouchTightness, true)],
      ['Steps', this.fmt(this.kpi.totalSteps)],
      ['Quick feet', this.fmt(this.kpi.cadenceSpm, true) + ' / min'],
      ['Scanning', this.fmt(this.kpi.totalScans)],
      ['Mobility score (0–100)', dr != null ? `${dr.toFixed(0)}` : this.fmt(this.kpi.movementSpeedPxS, true)],
      [
        'Close control through the clip',
        this.touchHistoryIsSynthetic ? 'Estimated from your average touch (no frame-by-frame samples)' : 'From full analysis'
      ]
    ];
    const kpiTable =
      '<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>' +
      kRows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('') +
      '</tbody></table>';
    const apiRows = this.metrics
      .filter((m) => !isExcludedCoachMetricName(m.metric_name))
      .map(
        (m) =>
          `<tr><td>${esc(coachFacingTitleFromApiName(m.metric_name))}</td><td>${esc(String(m.value))}</td><td>${esc(m.unit)}</td></tr>`
      );
    const apiTable =
      '<table><thead><tr><th>Metric</th><th>Value</th><th>Unit</th></tr></thead><tbody>' +
      apiRows.join('') +
      '</tbody></table>';
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>TalentEye report — Video #${v.id}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;padding:28px;color:#1a237e;max-width:720px;margin:0 auto;line-height:1.5}
h1{font-size:1.5rem;margin:0 0 8px} .muted{color:#666;font-size:0.9rem;margin-bottom:24px}
table{border-collapse:collapse;width:100%;margin:16px 0} th,td{border:1px solid #e0e0e0;padding:10px 12px;text-align:left}
th{background:#f1f5f9;font-weight:600} .hint{margin-top:28px;padding:12px;background:#f8f9fa;border-radius:8px;font-size:0.9rem;color:#444}
@media print{ .hint{break-inside:avoid} }
</style></head><body>
<h1>TalentEye — performance report</h1>
<p class="muted">Video #${v.id} · Uploaded ${esc(new Date(v.uploaded_at).toLocaleString())} · Generated ${esc(new Date().toLocaleString())}</p>
<h2>Summary</h2>${kpiTable}
<h2>All saved results</h2>${apiTable}
<p class="hint"><strong>PDF:</strong> Use your browser’s <em>Print</em> dialog and choose <em>Save as PDF</em> to export a PDF copy.</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `talenteye_metrics_video_${v.id}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.toastr.success('Report downloaded. Open the file and use Print → Save as PDF if needed.', 'Report');
  }

  private fmt(v: number | null | undefined, decimals = false): string {
    if (v == null || Number.isNaN(Number(v))) return '—';
    return decimals ? Number(v).toFixed(1) : String(v);
  }

  shareMetrics(): void {
    let shareUrl = window.location.href;
    try {
      const u = new URL(shareUrl);
      if (this.selectedVideoId) {
        u.searchParams.set('videoId', String(this.selectedVideoId));
      }
      shareUrl = u.toString();
    } catch {
      /* keep href */
    }
    const title = 'TalentEye — My metrics';
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      nav
        .share({
          title,
          text: 'Open my TalentEye performance breakdown.',
          url: shareUrl
        })
        .then(() => this.toastr.success('Shared successfully.', 'Share'))
        .catch(() => this.copyMetricsLink(shareUrl));
    } else {
      this.copyMetricsLink(shareUrl);
    }
  }

  private copyMetricsLink(url: string): void {
    const done = () => this.toastr.success('Link copied to clipboard.', 'Share');
    const fail = () => this.toastr.error('Could not copy link.', 'Share');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => this.fallbackCopyText(url, done, fail));
      return;
    }
    this.fallbackCopyText(url, done, fail);
  }

  private fallbackCopyText(url: string, ok: () => void, err: () => void): void {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy') ? ok() : err();
    } catch {
      err();
    }
    document.body.removeChild(ta);
  }

  get selectedVideo(): Video | undefined {
    if (!this.selectedVideoId) return undefined;
    return this.videos.find(v => v.id === this.selectedVideoId);
  }

  /** Close control as a simple 0–100 score for this clip (from raw spacing). */
  closeControlScorePercent(): number | null {
    const v = this.kpi.avgTouchTightness;
    if (v == null) return null;
    return normalizeMetricByKind('avg_touch_tightness', v);
  }

  /** Mobility / speed as 0–100 for this clip. */
  driveScorePercent(): number | null {
    const v = this.kpi.movementSpeedPxS;
    if (v == null) return null;
    return normalizeMetricByKind('movement_speed_px_s', v);
  }

  /** Rolling average close-control score across completed uploads. */
  closeControlOverallPercent(): number | null {
    const v = this.overall.avgTouchTightnessAvg;
    if (v == null) return null;
    return normalizeMetricByKind('avg_touch_tightness', v);
  }

  private computeOverallAverages(): void {
    const sums = {
      steps: 0,
      cadence: 0,
      scans: 0,
      avgTouch: 0,
      movement: 0,
      frames: 0,
    };
    const counts = {
      steps: 0,
      cadence: 0,
      scans: 0,
      avgTouch: 0,
      movement: 0,
      frames: 0,
    };

    this.videos.forEach(v => {
      const metrics = this.extractMetricsFromPayload(v.result_payload);
      if (metrics.totalSteps !== null) { sums.steps += metrics.totalSteps; counts.steps++; }
      if (metrics.cadenceSpm !== null) { sums.cadence += metrics.cadenceSpm; counts.cadence++; }
      if (metrics.totalScans !== null) { sums.scans += metrics.totalScans; counts.scans++; }
      if (metrics.avgTouchTightness !== null) { sums.avgTouch += metrics.avgTouchTightness; counts.avgTouch++; }
      if (metrics.movementSpeedPxS !== null) { sums.movement += metrics.movementSpeedPxS; counts.movement++; }
      if (metrics.totalFrames !== null) { sums.frames += metrics.totalFrames; counts.frames++; }
    });

    const avg = (sum: number, count: number) => count > 0 ? +(sum / count).toFixed(1) : null;

    this.overall = {
      videoCount: this.videos.length,
      totalStepsAvg: avg(sums.steps, counts.steps),
      cadenceSpmAvg: avg(sums.cadence, counts.cadence),
      totalScansAvg: avg(sums.scans, counts.scans),
      avgTouchTightnessAvg: avg(sums.avgTouch, counts.avgTouch),
      movementSpeedPxSAvg: avg(sums.movement, counts.movement),
      totalFramesAvg: avg(sums.frames, counts.frames),
    };
  }

  private extractMetricsFromPayload(payload: any) {
    if (!payload) {
      return {
        totalSteps: null,
        cadenceSpm: null,
        totalScans: null,
        avgTouchTightness: null,
        movementSpeedPxS: null,
        totalFrames: null
      };
    }

    const metrics = payload.metrics || payload;
    const history = metrics.touch_tightness_history || payload.touch_tightness_history || [];
    const avgFromHistory = Array.isArray(history) && history.length
      ? history.reduce((sum: number, val: number) => sum + val, 0) / history.length
      : null;

    return {
      totalSteps: metrics.total_steps ?? payload.total_steps ?? null,
      cadenceSpm: metrics.cadence_spm ?? payload.cadence_spm ?? null,
      totalScans: metrics.total_scans_detected ?? payload.total_scans_detected ?? null,
      avgTouchTightness: metrics.avg_touch_tightness ?? payload.avg_touch_tightness ?? avgFromHistory,
      movementSpeedPxS: metrics.movement_speed_px_s ?? payload.movement_speed_px_s ?? null,
      totalFrames: payload.total_frames_processed ?? metrics.total_frames_processed ?? null
    };
  }
}