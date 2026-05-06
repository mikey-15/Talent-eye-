import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ApiService, ScoutDirectoryPlayer } from '../../../services/api.service';
import { ClientStorageService } from '../../../services/client-storage.service';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-scout-players',
  standalone: false,
  templateUrl: './scout-players.html',
  styleUrls: ['./scout-players.css']
})
export class ScoutPlayers implements OnInit, OnDestroy {
  players: ScoutDirectoryPlayer[] = [];
  filteredPlayers: ScoutDirectoryPlayer[] = [];
  isLoading = false;
  searchTerm = '';
  positionFilter = '';
  locationFilter = '';
  ageRange: [number, number] = [16, 40];
  exportingPlayerId: number | null = null;
  serverShortlistIds = new Set<number>();

  private destroy$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private toastr: ToastrService,
    public router: Router,
    private storage: ClientStorageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refreshShortlistFromServer();
    this.loadPlayers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private refreshShortlistFromServer(): void {
    this.apiService
      .getScoutShortlist()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([]))
      )
      .subscribe((entries) => {
        this.serverShortlistIds = new Set(
          (entries || []).map((e) => e.player?.id).filter((id): id is number => Number.isFinite(id))
        );
        this.applyFilters();
        this.cdr.detectChanges();
      });
  }

  loadPlayers(): void {
    this.isLoading = true;
    this.apiService
      .getAllPlayers()
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error(err);
          this.toastr.error('Failed to load players', 'Error');
          return of([] as ScoutDirectoryPlayer[]);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((list) => {
        this.players = list || [];
        this.applyFilters();
      });
  }

  uniquePositions(): string[] {
    const set = new Set<string>();
    this.players.forEach((p) => {
      if (p.preferred_position?.trim()) {
        set.add(p.preferred_position.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  uniqueLocations(): string[] {
    const set = new Set<string>();
    this.players.forEach((p) => {
      if (p.location?.trim()) {
        set.add(p.location.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  applyFilters(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredPlayers = this.players.filter((player) => {
      const matchesSearch =
        !term ||
        player.username.toLowerCase().includes(term) ||
        (player.preferred_position && player.preferred_position.toLowerCase().includes(term)) ||
        (player.location && player.location.toLowerCase().includes(term));

      const matchesPosition =
        !this.positionFilter || player.preferred_position === this.positionFilter;

      const matchesLocation =
        !this.locationFilter ||
        (player.location && player.location.toLowerCase().includes(this.locationFilter.toLowerCase()));

      const age = this.playerAge(player.date_of_birth);
      const matchesAge =
        age == null || (age >= this.ageRange[0] && age <= this.ageRange[1]);

      return matchesSearch && matchesPosition && matchesLocation && matchesAge;
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  playerAge(dateOfBirth: string | null | undefined): number | null {
    if (!dateOfBirth) return null;
    const birth = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  avatarUrl(player: ScoutDirectoryPlayer): string {
    if (player.profile_image) {
      const u = this.apiService.resolveMediaUrl(player.profile_image);
      if (u) return u;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&size=80&background=0D6EFD&color=fff`;
  }

  performanceLabel(player: ScoutDirectoryPlayer): string {
    if ((player.completed_videos_count ?? 0) === 0) {
      return '—';
    }
    if (player.overall_rating != null && !Number.isNaN(Number(player.overall_rating))) {
      return Number(player.overall_rating).toFixed(1);
    }
    return '—';
  }

  isOnShortlist(player: ScoutDirectoryPlayer): boolean {
    return this.serverShortlistIds.has(player.id) || this.storage.isPlayerSaved(player.id);
  }

  toggleShortlist(player: ScoutDirectoryPlayer): void {
    if (this.serverShortlistIds.has(player.id)) {
      this.apiService
        .removeScoutShortlist(player.id)
        .pipe(
          takeUntil(this.destroy$),
          catchError(() => {
            this.toastr.error('Could not update shortlist.', 'Shortlist');
            return of(null);
          })
        )
        .subscribe((res) => {
          if (res === null) return;
          this.serverShortlistIds.delete(player.id);
          this.storage.removeSavedPlayer(player.id);
          this.toastr.info(`${player.username} removed from shortlist.`, 'Shortlist');
          this.cdr.detectChanges();
        });
      return;
    }

    this.apiService
      .addScoutShortlist(player.id)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          if (this.storage.addSavedPlayer(player.id, player.username)) {
            this.toastr.warning('Saved on this device only; API unreachable.', 'Shortlist');
          } else {
            this.toastr.error('Could not add to shortlist.', 'Shortlist');
          }
          return of(null);
        })
      )
      .subscribe((entry) => {
        if (!entry) return;
        this.serverShortlistIds.add(player.id);
        this.storage.addSavedPlayer(player.id, player.username);
        this.toastr.success(`${player.username} added to shortlist.`, 'Shortlist');
        this.cdr.detectChanges();
      });
  }

  viewPlayerDetails(playerId: number): void {
    this.router.navigate(['/scout/players', playerId]);
  }

  exportPlayerReport(player: ScoutDirectoryPlayer): void {
    this.exportingPlayerId = player.id;
    this.apiService
      .exportScoutPlayerReport(player.id)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.toastr.error('Export failed.', 'Error');
          return of(null);
        }),
        finalize(() => {
          this.exportingPlayerId = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe((blob) => {
        if (!blob) return;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${player.username.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_metrics.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toastr.success('CSV downloaded.', 'Export');
      });
  }

  exportPlayers(): void {
    const list = this.filteredPlayers;
    if (!list.length) {
      this.toastr.info('No rows to export.');
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
      ...list.map((p) => headers.map((h) => esc((p as any)[h])).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `talenteye_players_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.toastr.success(`Exported ${list.length} player(s).`, 'CSV');
  }

  addToComparison(player: ScoutDirectoryPlayer): void {
    const r = this.storage.addToCompare(player.id);
    if (r.atCapacity) {
      this.toastr.warning('Compare supports up to 4 players.', 'Compare');
      return;
    }
    if (!r.ok) return;
    this.toastr.success(`${player.username} added to compare.`, 'Compare');
    const ids = this.storage.getCompareIds().join(',');
    this.router.navigate(['/scout/compare'], { queryParams: { ids } });
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.positionFilter = '';
    this.locationFilter = '';
    this.ageRange = [16, 40];
    this.applyFilters();
  }

  refreshPlayers(): void {
    this.loadPlayers();
  }

  avgRatingDisplay(): string {
    const vals = this.players
      .map((p) => p.overall_rating)
      .filter((r): r is number => r != null && !Number.isNaN(Number(r)));
    if (!vals.length) return '—';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg.toFixed(1);
  }

  withVideoCount(): number {
    return this.players.filter((p) => (p.completed_videos_count ?? 0) > 0).length;
  }
}
