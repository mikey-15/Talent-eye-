import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil, finalize } from 'rxjs/operators';
import { AuthService, User } from '../../../services/auth.service';
import { ApiService, ScoutDirectoryPlayer } from '../../../services/api.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-scout-dashboard',
  standalone: false,
  templateUrl: './scout-dashboard.component.html',
  styleUrls: ['./scout-dashboard.component.css']
})
export class ScoutDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  user: User | null = null;
  isLoading = true;
  totalPlayers = 0;
  playersWithVideos = 0;
  shortlistCount = 0;
  /** Best overall_rating in the directory (0–100), if any. */
  topProspectName: string | null = null;
  topProspectRating: number | null = null;

  constructor(
    private auth: AuthService,
    private api: ApiService,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.user = this.auth.getCurrentUser();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.isLoading = true;
    forkJoin({
      players: this.api.getAllPlayers().pipe(catchError(() => of([] as ScoutDirectoryPlayer[]))),
      shortlist: this.api.getScoutShortlist().pipe(catchError(() => of([])))
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe(({ players, shortlist }) => {
        const list = players || [];
        this.totalPlayers = list.length;
        this.playersWithVideos = list.filter((p) => (p.completed_videos_count ?? 0) > 0).length;
        this.shortlistCount = (shortlist || []).length;
        let best: { name: string; rating: number } | null = null;
        for (const p of list) {
          const r = p.overall_rating;
          if (r == null || Number.isNaN(Number(r)) || r <= 0) continue;
          if (!best || r > best.rating) {
            best = { name: p.username, rating: Number(r) };
          }
        }
        this.topProspectName = best?.name ?? null;
        this.topProspectRating = best?.rating ?? null;
      });
  }

  goPlayers(): void {
    this.router.navigate(['/scout/players']);
  }

  goShortlist(): void {
    this.router.navigate(['/scout/shortlist']);
  }

  goCompare(): void {
    this.router.navigate(['/scout/compare']);
  }

  exportDirectory(): void {
    this.api
      .getAllPlayers()
      .pipe(takeUntil(this.destroy$), catchError(() => of([] as ScoutDirectoryPlayer[])))
      .subscribe((players) => {
        if (!players?.length) {
          this.toastr.info('No players in the directory.');
          return;
        }
        const headers = [
          'id',
          'username',
          'preferred_position',
          'dominant_foot',
          'location',
          'height_cm',
          'date_of_birth',
          'completed_videos_count',
          'overall_rating'
        ];
        const esc = (v: unknown) => {
          if (v == null) return '';
          const s = String(v);
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const lines = [
          headers.join(','),
          ...players.map((p) => headers.map((h) => esc((p as any)[h])).join(','))
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `talenteye_directory_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.toastr.success('Directory exported.', 'CSV');
      });
  }
}
