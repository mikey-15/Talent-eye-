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
          const perfById = new Map<number, PlayerPerformance | null>();
          ids.forEach((id, i) => perfById.set(id, performances[i] ?? null));
          const sortedIds = [...ids].sort((a, b) =>
            this.compareForRanking(perfById.get(a) ?? null, perfById.get(b) ?? null)
          );

          this.players = sortedIds.map((id) => {
            const p = directory.find((x) => x.id === id);
            const perf = perfById.get(id) ?? null;
            return {
              id,
              username: p?.username ?? `Player #${id}`,
              preferred_position: p?.preferred_position ?? null,
              overall_rating: perf?.performance_summary?.overall_rating ?? null,
              total_videos: perf?.performance_summary?.total_videos
            };
          });

          this.rows = this.buildRowsFromPerformances(
            sortedIds,
            sortedIds.map((id) => perfById.get(id) ?? null)
          );
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
      rows.push({
        name: k === 'total_steps' ? `${COACH_FACING_TITLE[k]} (context)` : COACH_FACING_TITLE[k],
        unit: k === 'total_steps' ? 'avg count' : '%',
        values
      });
    }

    return rows;
  }

  private cellForKind(p: PlayerPerformance | null, k: MetricKind): string {
    const d = p?.performance_summary?.metrics_summary?.[k];
    if (!d || d.average == null || (d.count ?? 0) <= 0) return '—';
    if (k === 'total_steps') {
      const n = Number(d.average);
      if (Number.isNaN(n)) return '—';
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }
    return `${normalizeMetricByKind(k, d.average).toFixed(0)}%`;
  }

  private averageForKind(p: PlayerPerformance | null, k: MetricKind): number | null {
    const d = p?.performance_summary?.metrics_summary?.[k];
    if (!d || d.average == null || (d.count ?? 0) <= 0) return null;
    const n = Number(d.average);
    return Number.isNaN(n) ? null : n;
  }

  /** Drive first (mobility), then tempo for tie-breaks. */
  private compareForRanking(a: PlayerPerformance | null, b: PlayerPerformance | null): number {
    const driveA = this.averageForKind(a, 'movement_speed_px_s');
    const driveB = this.averageForKind(b, 'movement_speed_px_s');
    if (driveA != null || driveB != null) {
      if (driveA == null) return 1;
      if (driveB == null) return -1;
      if (driveA !== driveB) return driveB - driveA;
    }

    const tempoA = this.averageForKind(a, 'cadence_spm');
    const tempoB = this.averageForKind(b, 'cadence_spm');
    if (tempoA != null || tempoB != null) {
      if (tempoA == null) return 1;
      if (tempoB == null) return -1;
      if (tempoA !== tempoB) return tempoB - tempoA;
    }

    const ratingA = a?.performance_summary?.overall_rating ?? null;
    const ratingB = b?.performance_summary?.overall_rating ?? null;
    if (ratingA != null || ratingB != null) {
      if (ratingA == null) return 1;
      if (ratingB == null) return -1;
      if (ratingA !== ratingB) return ratingB - ratingA;
    }
    return 0;
  }

  clearCompare(): void {
    this.storage.clearCompare();
    this.router.navigate(['/scout/players']);
  }
}
