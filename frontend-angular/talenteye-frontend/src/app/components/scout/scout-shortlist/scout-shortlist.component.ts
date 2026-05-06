import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, takeUntil, finalize } from 'rxjs/operators';
import { ApiService, ScoutShortlistEntry } from '../../../services/api.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-scout-shortlist',
  standalone: false,
  templateUrl: './scout-shortlist.component.html',
  styleUrls: ['./scout-shortlist.component.css']
})
export class ScoutShortlistComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  entries: ScoutShortlistEntry[] = [];
  isLoading = true;

  constructor(
    private api: ApiService,
    public router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.isLoading = true;
    this.api
      .getScoutShortlist()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.toastr.error('Could not load shortlist.');
          return of([] as ScoutShortlistEntry[]);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((rows) => {
        this.entries = rows || [];
      });
  }

  avatarUrl(entry: ScoutShortlistEntry): string {
    const p = entry.player;
    if (p.profile_image) {
      const u = this.api.resolveMediaUrl(p.profile_image);
      if (u) return u;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(p.username)}&size=80&background=0D6EFD&color=fff`;
  }

  age(dob: string | null | undefined): string {
    if (!dob) return '—';
    const b = new Date(dob);
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
    return String(a);
  }

  openPlayer(id: number): void {
    this.router.navigate(['/scout/players', id]);
  }

  remove(entry: ScoutShortlistEntry, ev: Event): void {
    ev.stopPropagation();
    const id = entry.player.id;
    this.api
      .removeScoutShortlist(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.entries = this.entries.filter((e) => e.player.id !== id);
          this.toastr.info('Removed from shortlist.');
          this.cdr.detectChanges();
        },
        error: () => this.toastr.error('Could not remove.')
      });
  }
}
