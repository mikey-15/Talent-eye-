import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ApiService,
  Metric,
  PlayerPerformance,
  PerformanceSummary,
  ScoutShortlistEntry,
  ScoutWrittenReport
} from '../../../services/api.service';
import { ClientStorageService } from '../../../services/client-storage.service';
import { ToastrService } from 'ngx-toastr';
import { ChartConfiguration, ChartData } from 'chart.js';
import { forkJoin, of, Subject } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { scoutQualityPercent } from '../../../utils/metric-display';
import {
  COACH_FACING_TITLE,
  inferMetricKind,
  normalizeMetricByKind,
  RADAR_AXIS_KINDS,
  type MetricKind
} from '../../../utils/metric-labels';

@Component({
  selector: 'app-scout-player-detail',
  standalone: false,
  templateUrl: './scout-player-detail.html',
  styleUrls: ['./scout-player-detail.css']
})
export class ScoutPlayerDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  player: PlayerPerformance['player'] | null = null;
  performanceSummary: PlayerPerformance['performance_summary'] | null = null;
  metrics: Metric[] = [];
  isLoading = false;
  activeTab = 'overview';
  scoutNotesDraft = '';
  isShortlisted = false;
  writtenReports: ScoutWrittenReport[] = [];
  reportTitleDraft = '';
  reportBodyDraft = '';
  savingReport = false;

  radarChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pct = ctx.raw != null ? `${Number(ctx.raw).toFixed(0)}%` : '';
            return pct ? `Score: ${pct}` : '';
          }
        }
      }
    },
    scales: {
      r: {
        angleLines: { display: true },
        suggestedMin: 0,
        suggestedMax: 100,
        ticks: {
          stepSize: 20,
          callback: (value) => `${value}%`
        }
      }
    }
  };

  radarChartData: ChartData<'radar'> = {
    labels: [],
    datasets: [
      {
        label: 'Normalized',
        data: [],
        fill: true,
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgb(54, 162, 235)',
        pointBackgroundColor: 'rgb(54, 162, 235)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgb(54, 162, 235)'
      }
    ]
  };

  barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw;
            return v != null ? `${Number(v).toFixed(0)}%` : '—';
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        max: 100,
        title: { display: true, text: 'Score (0–100%)' }
      }
    }
  };

  barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [
          'rgba(255, 99, 132, 0.7)',
          'rgba(54, 162, 235, 0.7)',
          'rgba(255, 206, 86, 0.7)',
          'rgba(75, 192, 192, 0.7)',
          'rgba(153, 102, 255, 0.7)',
          'rgba(255, 159, 64, 0.7)'
        ],
        borderColor: [
          'rgb(255, 99, 132)',
          'rgb(54, 162, 235)',
          'rgb(255, 206, 86)',
          'rgb(75, 192, 192)',
          'rgb(153, 102, 255)',
          'rgb(255, 159, 64)'
        ],
        borderWidth: 1
      }
    ]
  };

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private apiService: ApiService,
    private toastr: ToastrService,
    private storage: ClientStorageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.params['id'];
    const playerId = idParam ? Number(idParam) : NaN;
    if (Number.isFinite(playerId)) {
      this.loadPlayerDetails(playerId);
    } else {
      this.toastr.error('Invalid player', 'Error');
      this.router.navigate(['/scout/players']);
    }

    const frag = this.route.snapshot.fragment;
    if (frag === 'metrics') {
      this.activeTab = 'metrics';
    }
    if (frag === 'reports') {
      this.activeTab = 'reports';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPlayerDetails(playerId: number): void {
    this.isLoading = true;

    forkJoin({
      performance: this.apiService.getPlayerPerformance(playerId).pipe(
        catchError((error) => {
          console.error(error);
          this.toastr.error('Failed to load player', 'Error');
          return of(null);
        })
      ),
      shortlist: this.apiService.getScoutShortlist().pipe(
        catchError(() => of([] as ScoutShortlistEntry[]))
      ),
      reports: this.apiService.getScoutWrittenReports(playerId).pipe(
        catchError(() => of([] as ScoutWrittenReport[]))
      )
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: ({ performance, shortlist, reports }) => {
          if (!performance?.player) {
            this.router.navigate(['/scout/players']);
            return;
          }
          this.player = performance.player;
          this.performanceSummary = performance.performance_summary;
          this.syncMetricsFromSummary();
          const sid = performance.player.id;
          const entry = (shortlist || []).find((e) => e.player?.id === sid);
          this.isShortlisted = !!entry;
          this.scoutNotesDraft =
            entry?.notes != null && entry.notes !== ''
              ? entry.notes
              : this.storage.getScoutNotes(sid);
          this.writtenReports = reports || [];
          this.updateCharts();
        }
      });
  }

  private syncMetricsFromSummary(): void {
    const s = this.performanceSummary?.metrics_summary;
    if (!s || Object.keys(s).length === 0) {
      this.metrics = [];
      return;
    }
    const allowed = new Set(RADAR_AXIS_KINDS);
    this.metrics = Object.entries(s)
      .filter(([key, d]) => {
        const kind = inferMetricKind(key) || inferMetricKind(d.name);
        if (!kind || !allowed.has(kind)) return false;
        if ((d.count ?? 0) <= 0) return false;
        return d.average != null;
      })
      .map(([key, d]) => ({
        metric_name: key,
        value: d.average,
        unit: d.unit,
        confidence: 1
      }));
  }

  updateCharts(): void {
    const summary = this.performanceSummary?.metrics_summary;
    const emptyRadar = () => {
      this.radarChartData = {
        ...this.radarChartData,
        labels: [],
        datasets: [{ ...this.radarChartData.datasets[0], data: [] }]
      };
      this.barChartData = {
        ...this.barChartData,
        labels: [],
        datasets: [{ ...this.barChartData.datasets[0], data: [] }]
      };
    };

    if (!summary || Object.keys(summary).length === 0) {
      emptyRadar();
      return;
    }

    const presentKinds = RADAR_AXIS_KINDS.filter(
      (k) => summary[k]?.average != null && (summary[k]?.count ?? 0) > 0
    );
    if (presentKinds.length === 0) {
      emptyRadar();
      return;
    }

    const radarLabels = presentKinds.map((k) => COACH_FACING_TITLE[k]);
    const normRadar = presentKinds.map((k) =>
      normalizeMetricByKind(k as MetricKind, summary[k].average)
    );

    this.radarChartData = {
      labels: radarLabels,
      datasets: [{ ...this.radarChartData.datasets[0], data: normRadar }]
    };

    const barLabels = [...presentKinds].sort((a, b) =>
      COACH_FACING_TITLE[a].localeCompare(COACH_FACING_TITLE[b])
    );
    const barNorm = barLabels.map((k) => normalizeMetricByKind(k as MetricKind, summary[k].average));

    this.barChartData = {
      labels: barLabels.map((k) => COACH_FACING_TITLE[k]),
      datasets: [{ ...this.barChartData.datasets[0], data: barNorm }]
    };
    (this.barChartData.datasets[0] as any).units = barLabels.map(() => '%');
  }

  profileImageUrl(): string | null {
    const p = this.player;
    if (!p?.profile_image) return null;
    return this.apiService.resolveMediaUrl(p.profile_image);
  }

  calculateAge(birthDate: string | undefined | null): number {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  getHeightInFeet(heightCm: number | undefined | null): string {
    if (!heightCm) return 'N/A';
    const totalInches = heightCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}'${inches}"`;
  }

  getPositionBadgeClass(position: string | null): string {
    if (!position) return 'badge bg-secondary';

    const positionClasses: { [key: string]: string } = {
      Goalkeeper: 'badge bg-danger',
      'Center Back': 'badge bg-warning text-dark',
      'Full Back': 'badge bg-info',
      'Defensive Midfielder': 'badge bg-primary',
      'Central Midfielder': 'badge bg-success',
      'Attacking Midfielder': 'badge bg-purple',
      Winger: 'badge bg-pink',
      Striker: 'badge bg-orange',
      Forward: 'badge bg-teal'
    };

    return positionClasses[position] || 'badge bg-secondary';
  }

  getFootIcon(foot: string | null): string {
    if (!foot) return 'bi-question-circle';
    const u = foot.toUpperCase();
    if (u === 'LEFT') return 'bi-arrow-left-circle';
    if (u === 'RIGHT') return 'bi-arrow-right-circle';
    return 'bi-arrows-collapse';
  }

  getFootColor(foot: string | null): string {
    if (!foot) return '#6c757d';
    const u = foot.toUpperCase();
    if (u === 'LEFT') return '#dc3545';
    if (u === 'RIGHT') return '#198754';
    return '#0d6efd';
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  toggleShortlist(): void {
    if (!this.player) return;
    const p = this.player;
    if (this.isShortlisted) {
      this.apiService.removeScoutShortlist(p.id).subscribe({
        next: () => {
          this.isShortlisted = false;
          this.storage.removeSavedPlayer(p.id);
          this.toastr.info(`${p.username} removed from your shortlist.`, 'Shortlist');
          this.cdr.detectChanges();
        },
        error: () => this.toastr.error('Could not update shortlist.', 'Shortlist')
      });
      return;
    }
    this.apiService.addScoutShortlist(p.id, this.scoutNotesDraft || undefined).subscribe({
      next: () => {
        this.isShortlisted = true;
        this.storage.addSavedPlayer(p.id, p.username);
        this.toastr.success(`${p.username} added to your shortlist.`, 'Shortlist');
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.storage.addSavedPlayer(p.id, p.username)) {
          this.toastr.warning('Saved on this device only; shortlist API failed.', 'Shortlist');
        } else {
          this.toastr.error('Could not add to shortlist.', 'Shortlist');
        }
        this.cdr.detectChanges();
      }
    });
  }

  contactPlayer(): void {
    if (!this.player) return;
    const email = this.player.email;
    if (email) {
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('TalentEye — ' + this.player.username)}`;
      return;
    }
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const done = () =>
      this.toastr.success('Profile link copied — share it with your club contact.', 'Contact');
    if (url && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => {
        if (url && this.syncCopyToClipboard(url)) done();
        else this.toastr.error('Could not copy link.', 'Contact');
      });
      return;
    }
    if (url && this.syncCopyToClipboard(url)) {
      done();
      return;
    }
    this.toastr.error('No email on file and could not copy link.', 'Contact');
  }

  drillVideos(): PerformanceSummary['drills_completed'] {
    return this.performanceSummary?.drills_completed ?? [];
  }

  /** Prefer coaching overlay; fall back to raw upload. */
  drillVideoPlayableUrl(row: PerformanceSummary['drills_completed'][number]): string | null {
    const u = row.annotated_video_url || row.video_url || null;
    return this.apiService.resolveMediaUrl(u);
  }

  private syncCopyToClipboard(text: string): boolean {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  scoutNotesSave(): void {
    if (!this.player) return;
    const id = this.player.id;
    const notes = this.scoutNotesDraft;
    const onOk = () => {
      this.storage.setScoutNotes(id, notes);
      this.toastr.success('Notes saved.', 'Scout notes');
    };
    if (this.isShortlisted) {
      this.apiService.patchScoutShortlistNotes(id, notes).subscribe({
        next: onOk,
        error: () => this.toastr.error('Could not save notes to the server.', 'Scout notes')
      });
      return;
    }
    this.apiService.addScoutShortlist(id, notes).subscribe({
      next: () => {
        this.isShortlisted = true;
        this.storage.addSavedPlayer(this.player!.id, this.player!.username);
        onOk();
      },
      error: () => {
        this.storage.setScoutNotes(id, notes);
        this.toastr.warning('Notes saved on this device only.', 'Scout notes');
      }
    });
  }

  scoutNotesClear(): void {
    if (!this.player) return;
    if (!this.scoutNotesDraft.trim()) {
      return;
    }
    this.storage.clearScoutNotes(this.player.id);
    this.scoutNotesDraft = '';
    this.toastr.success('Notes cleared.', 'Scout notes');
    this.cdr.detectChanges();
  }

  submitWrittenReport(): void {
    if (!this.player) return;
    const body = this.reportBodyDraft.trim();
    if (!body) {
      this.toastr.warning('Write something in the report body first.', 'Reports');
      return;
    }
    this.savingReport = true;
    this.apiService
      .postScoutWrittenReport(this.player.id, body, this.reportTitleDraft.trim() || undefined)
      .pipe(
        finalize(() => {
          this.savingReport = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (r) => {
          this.writtenReports = [r, ...this.writtenReports];
          this.reportTitleDraft = '';
          this.reportBodyDraft = '';
          this.toastr.success('Report saved.', 'Reports');
        },
        error: () => this.toastr.error('Could not save report.', 'Reports')
      });
  }

  /** Download all written reports for this player as a plain-text file. */
  exportWrittenReportsDocument(): void {
    if (!this.player || !this.writtenReports.length) {
      this.toastr.warning('No written reports to export yet.', 'Reports');
      return;
    }
    const lines: string[] = [
      `TalentEye — scout reports for ${this.player.username}`,
      `Player ID: ${this.player.id}`,
      `Exported: ${new Date().toISOString()}`,
      '',
      ...this.writtenReports.flatMap((r) => {
        const title = r.title ? `${r.title}\n` : '';
        const when = new Date(r.created_at).toLocaleString();
        return [`--- ${when} ---`, title, r.body.trim(), ''];
      })
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scout_reports_${this.player.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.toastr.success('Reports downloaded.', 'Export');
  }

  /** Server CSV export (aggregated metrics). */
  downloadCsvMetricsExport(): void {
    if (!this.player?.id) return;
    this.apiService.exportScoutPlayerReport(this.player.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `player_${this.player!.id}_metrics.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toastr.success('CSV downloaded.', 'Export');
      },
      error: () => this.toastr.error('Export failed', 'Error')
    });
  }

  metricValueDisplay(m: Metric): string {
    return scoutQualityPercent(m.metric_name, m.value).toFixed(0);
  }

  metricUnitDisplay(_m: Metric): string {
    return '%';
  }

  videosAnalyzedCount(): number {
    return this.performanceSummary?.total_videos ?? 0;
  }

  overallRatingDisplay(): string {
    const r = this.performanceSummary?.overall_rating;
    if (r == null || r === 0) return '—';
    return `${r}`;
  }

  normalizeBar(m: Metric): number {
    return scoutQualityPercent(m.metric_name, m.value);
  }
}
