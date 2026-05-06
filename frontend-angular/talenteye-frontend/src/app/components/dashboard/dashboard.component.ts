// src/app/components/dashboard/dashboard.component.ts
import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { ApiService, Video } from '../../services/api.service';
import { ChartConfiguration } from 'chart.js';
import { of, Subject } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { aggregatePayloadScore } from '../../utils/metric-display';
import {
  METRIC_NORMALIZATION,
  metricValueForKind,
  normalizeMetricByKind,
  RADAR_AXIS_KINDS
} from '../../utils/metric-labels';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  /** Same caps as overall rating / metrics UI (short-clip friendly). */
  readonly metricNorm = METRIC_NORMALIZATION;

  private destroy$ = new Subject<void>();
  currentUser: User | null = null;
  recentVideos: Video[] = [];
  isLoading = false;

  currentDate = new Date();

  stats = {
    totalVideos: 0,
    processedVideos: 0,
    pendingVideos: 0,
    averageScore: 0
  };

  /** Latest completed video metrics (raw values from analysis API). */
  playerKpis = {
    cadence: null as number | null,
    scans: null as number | null,
    touch: null as number | null
  };

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser?.role === 'SCOUT') {
      this.router.navigate(['/scout'], { replaceUrl: true });
      return;
    }
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.loadPlayerDashboard();
  }

  loadPlayerDashboard(): void {
    this.apiService
      .getMyVideos()
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Error loading videos:', error);
          return of([]);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (videos) => {
          this.recentVideos = videos.slice(0, 5);
          this.stats.totalVideos = videos.length;
          this.stats.processedVideos = videos.filter((v) => v.status === 'COMPLETED').length;
          this.stats.pendingVideos = videos.filter(
            (v) => v.status === 'PENDING' || v.status === 'PROCESSING'
          ).length;
          this.updatePerformanceTrend(videos);

          const latestCompleted = videos.find((v) => v.status === 'COMPLETED');
          if (latestCompleted) {
            this.loadVideoMetrics(latestCompleted.id);
          } else {
            this.resetPlayerKpisAndScore();
          }
          this.cdr.detectChanges();
        }
      });
  }

  private updatePerformanceTrend(videos: Video[]): void {
    const completed = [...videos]
      .filter((v) => v.status === 'COMPLETED')
      .sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime())
      .slice(-7);
    const labels = completed.map((v) => `#${v.id}`);
    const data = completed.map((v) => aggregatePayloadScore(v.result_payload ?? null) ?? 0);
    this.performanceChartData = {
      ...this.performanceChartData,
      labels: labels.length ? labels : ['No completed videos yet'],
      datasets: [
        {
          ...this.performanceChartData.datasets[0],
          label: 'Composite score (0–100) per video',
          data: data.length ? data : [0]
        }
      ]
    };
  }

  private resetPlayerKpisAndScore(): void {
    this.playerKpis = {
      cadence: null,
      scans: null,
      touch: null
    };
    this.stats.averageScore = 0;
  }

  loadVideoMetrics(videoId: number): void {
    this.apiService
      .getVideoMetrics(videoId)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Error loading metrics:', error);
          return of([]);
        })
      )
      .subscribe({
        next: (metrics) => {
          this.playerKpis = {
            cadence: metricValueForKind(metrics, 'cadence_spm'),
            scans: metricValueForKind(metrics, 'total_scans_detected'),
            touch: metricValueForKind(metrics, 'avg_touch_tightness')
          };
          const normalized = RADAR_AXIS_KINDS.map((kind) => {
            const v = metricValueForKind(metrics, kind);
            return v != null ? normalizeMetricByKind(kind, v) : null;
          }).filter((n): n is number => n != null);
          this.stats.averageScore = normalized.length
            ? Math.round((normalized.reduce((a, b) => a + b, 0) / normalized.length) * 10) / 10
            : 0;
          this.cdr.detectChanges();
        }
      });
  }

  viewVideoDetails(_video: Video): void {
    this.router.navigate(['/videos']);
  }

  analyzeVideo(video: Video): void {
    this.router.navigate(['/metrics'], { queryParams: { videoId: video.id } });
  }

  getVideoStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      COMPLETED: 'completed',
      PROCESSING: 'processing',
      PENDING: 'pending'
    };
    return classes[status] || '';
  }

  /** Progress width for close-control score (same curve as metrics dashboard). */
  touchProgressPercent(): number {
    const t = this.playerKpis.touch;
    if (t == null) return 0;
    return normalizeMetricByKind('avg_touch_tightness', t);
  }

  public performanceChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      {
        label: 'Composite score (0–100) per video',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.4
      }
    ]
  };

  public performanceChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    plugins: {
      legend: {
        display: true
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100
      }
    }
  };
}
