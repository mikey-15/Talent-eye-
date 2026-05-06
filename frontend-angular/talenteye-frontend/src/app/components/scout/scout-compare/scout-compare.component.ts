import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import {
  ApiService,
  PlayerPerformance,
  ScoutDirectoryPlayer
} from '../../../services/api.service';
import { ClientStorageService } from '../../../services/client-storage.service';
import { ToastrService } from 'ngx-toastr';
import {
  COACH_FACING_TITLE,
  RADAR_AXIS_KINDS,
  normalizeMetricByKind,
  type MetricKind
} from '../../../utils/metric-labels';

interface ColPlayer {
  id: number;
  username: string;
  preferred_position?: string | null;
  overall_rating?: number | null;
  total_videos?: number;
}

interface MetricRow {
  name: string;
  unit: string;
  values: { [playerId: number]: string };
}

@Component({
  selector: 'app-scout-compare',
  standalone: false,
  templateUrl: './scout-compare.component.html',
  styleUrls: ['./scout-compare.component.css']
})
export class ScoutCompareComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  players: ColPlayer[] = [];
  rows: MetricRow[] = [];
  isLoading = false;
  compareIds: number[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private storage: ClientStorageService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((q) => {
      const raw = q['ids'] as string | undefined;
      this.compareIds = this.parseIds(raw);
      if (!this.compareIds.length) {
        this.compareIds = this.storage.getCompareIds();
      }
      if (!this.compareIds.length) {
        this.toastr.warning('Select players to compare from the directory.', 'Compare');
        this.router.navigate(['/scout/players']);
        return;
      }
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private parseIds(raw: string | undefined): number[] {
    if (!raw || !raw.trim()) return [];
    return raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  load(): void {
    this.isLoading = true;
    const ids = [...new Set(this.compareIds)].slice(0, 4);

    const directory$ = this.api.getAllPlayers().pipe(
      catchError(() => {
        this.toastr.error('Could not load player directory.', 'Compare');
        return of([] as ScoutDirectoryPlayer[]);
      })
    );

    const performances$ =
      ids.length === 0
        ? of([] as (PlayerPerformance | null)[])
        : forkJoin(
            ids.map((id) =>
              this.api.getPlayerPerformance(id).pipe(catchError(() => of(null)))
            )
          );

    forkJoin({
      directory: directory$,
      performances: performances$
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: ({ directory, performances }) => {
          this.players = ids.map((id, i) => {
            const p = directory.find((x) => x.id === id);
            const perf = performances[i] ?? null;
            return {
              id,
              username: p?.username ?? `Player #${id}`,
              preferred_position: p?.preferred_position ?? null,
              overall_rating: perf?.performance_summary?.overall_rating ?? null,
              total_videos: perf?.performance_summary?.total_videos
            };
          });

          this.rows = this.buildRowsFromPerformances(ids, performances);
          this.cdr.detectChanges();
        },
        error: () => {
          this.toastr.error('Could not load comparison data.', 'Error');
          this.cdr.detectChanges();
        }
      });
  }

  private buildRowsFromPerformances(
    ids: number[],
    perfs: (PlayerPerformance | null)[]
  ): MetricRow[] {
    const rows: MetricRow[] = [];

    const pushMeta = (label: string, getter: (p: PlayerPerformance | null) => string) => {
      const values: { [playerId: number]: string } = {};
      ids.forEach((pid, i) => {
        values[pid] = getter(perfs[i]);
      });
      rows.push({ name: label, unit: '', values });
    };

    pushMeta('Overall rating', (p) => {
      const r = p?.performance_summary?.overall_rating;
      if (r == null || r === 0) return '—';
      return String(r);
    });
    pushMeta('Videos analyzed', (p) => {
      const n = p?.performance_summary?.total_videos;
      return n != null ? String(n) : '—';
    });

    const hasKind = (k: MetricKind) =>
      perfs.some((p) => {
        const d = p?.performance_summary?.metrics_summary?.[k];
        return d != null && (d.count ?? 0) > 0 && d.average != null;
      });

    for (const k of RADAR_AXIS_KINDS) {
      if (!hasKind(k)) continue;
      const values: { [playerId: number]: string } = {};
      ids.forEach((pid, i) => {
        values[pid] = this.cellForKind(perfs[i], k);
      });
      rows.push({ name: COACH_FACING_TITLE[k], unit: '%', values });
    }

    return rows;
  }

  private cellForKind(p: PlayerPerformance | null, k: MetricKind): string {
    const d = p?.performance_summary?.metrics_summary?.[k];
    if (!d || d.average == null || (d.count ?? 0) <= 0) return '—';
    return `${normalizeMetricByKind(k, d.average).toFixed(0)}%`;
  }

  clearCompare(): void {
    this.storage.clearCompare();
    this.router.navigate(['/scout/players']);
  }
}
