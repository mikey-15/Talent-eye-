
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ApiService, DrillVideoResultMetrics, Video } from '../../../services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Subject, of, interval, Subscription } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-video-list',
  standalone: false,
  templateUrl: './video-list.html',
  styleUrls: ['./video-list.css']
})
export class VideoList implements OnInit, OnDestroy {
  videos: Video[] = [];
  filteredVideos: Video[] = [];
  isLoading = false;
  searchTerm = '';
  statusFilter = 'ALL';
  sortBy = 'newest';
  downloadingJsonIds = new Set<number>();
  readonly math = Math;
  activeVideo: Video | null = null;
  /** Bypass URL sanitizer so trimmed / cross-origin media URLs are not rewritten to `unsafe:...`. */
  lightboxVideoSrc: SafeUrl | null = null;
  private pollSub: Subscription | null = null;
  private readonly pollIntervalMs = 4500;
  private destroy$ = new Subject<void>();
  
  statusOptions = [
    { value: 'ALL', label: 'All Status' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'PROCESSING', label: 'Processing' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'FAILED', label: 'Failed' }
  ];
  
  sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'status', label: 'By Status' }
  ];

  constructor(
    private apiService: ApiService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadVideos();
  }

  ngOnDestroy(): void {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadVideos(showSpinner = true): void {
    if (showSpinner) {
      this.isLoading = true;
    }

    this.apiService.getMyVideos()
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error loading videos:', error);
          this.toastr.error('Failed to load videos', 'Error');
          return of([] as Video[]);
        }),
        finalize(() => {
          if (showSpinner) {
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        })
      )
      .subscribe((videos) => {
        this.videos = videos || [];
        this.applyFilters();
        this.handlePollingState();
        this.cdr.detectChanges();
      });
  }

  private handlePollingState(): void {
    const hasInFlight = this.videos.some(v => v.status === 'PENDING' || v.status === 'PROCESSING');

    if (hasInFlight && !this.pollSub) {
      this.pollSub = interval(this.pollIntervalMs)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.loadVideos(false));
    }

    if (!hasInFlight && this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
  }

  applyFilters(): void {
    let filtered = [...this.videos];

    // Apply search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(video => 
        video.drill_name?.toLowerCase().includes(term) ||
        video.status.toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (this.statusFilter !== 'ALL') {
      filtered = filtered.filter(video => video.status === this.statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'newest':
          return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
        case 'oldest':
          return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    this.filteredVideos = filtered;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  onSortChange(): void {
    this.applyFilters();
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'badge bg-success';
      case 'PROCESSING': return 'badge bg-warning text-dark';
      case 'PENDING': return 'badge bg-secondary';
      case 'FAILED': return 'badge bg-danger';
      default: return 'badge bg-light text-dark';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'COMPLETED': return 'bi-check-circle-fill';
      case 'PROCESSING': return 'bi-hourglass-split';
      case 'PENDING': return 'bi-clock';
      case 'FAILED': return 'bi-x-circle-fill';
      default: return 'bi-question-circle';
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  viewMetrics(videoId: number): void {
    this.router.navigate(['/metrics'], { queryParams: { videoId } });
  }

  thumbnailSrc(video: Video): string | null {
    return this.apiService.resolveMediaUrl(video.thumbnail_url ?? null);
  }

  posterUrl(video: Video | null): string | null {
    if (!video?.thumbnail_url) return null;
    return this.apiService.resolveMediaUrl(video.thumbnail_url);
  }

  getPlayableUrl(video?: Video | null): string | null {
    if (!video) return null;
    const firstNonEmpty = (...vals: (string | null | undefined)[]): string | null => {
      for (const v of vals) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s) return s;
      }
      return null;
    };
    // Prefer the uploaded source file so playback still works if annotated output is missing or bad.
    const raw = firstNonEmpty(video.video, video.annotated_video_url, video.annotated_video);
    return this.apiService.resolveMediaUrl(raw);
  }

  /** Same base URL resolution as <video src> — required so /media/... hits Django, not the SPA origin. */
  annotatedMp4Href(video: Video): string | null {
    const raw = video.annotated_video_url || video.annotated_video || null;
    return this.apiService.resolveMediaUrl(raw);
  }

  resultJsonHref(video: Video): string | null {
    const raw = video.result_json_url || video.result_json || null;
    return this.apiService.resolveMediaUrl(raw);
  }

  hasPlayable(video: Video): boolean {
    return !!this.getPlayableUrl(video);
  }

  openPlayer(video: Video): void {
    const playable = this.getPlayableUrl(video);
    if (!playable) {
      this.toastr.error('No video file available to play.', 'Unavailable');
      return;
    }
    this.activeVideo = { ...video, video: playable } as Video;
    this.lightboxVideoSrc = this.sanitizer.bypassSecurityTrustUrl(playable);
    this.cdr.detectChanges();
  }

  closePlayer(): void {
    this.activeVideo = null;
    this.lightboxVideoSrc = null;
    this.cdr.detectChanges();
  }

  onLightboxVideoError(): void {
    this.toastr.error(
      'The browser could not load this video. Check the file on the server or try the Annotated MP4 link.',
      'Playback error'
    );
  }

  isDownloadingJson(videoId: number): boolean {
    return this.downloadingJsonIds.has(videoId);
  }

  downloadResultJson(video: Video): void {
    const url = video.result_json_url || video.result_json;

    if (!url) {
      this.toastr.error('No result JSON available for this video yet.', 'Unavailable');
      return;
    }

    if (this.downloadingJsonIds.has(video.id)) {
      return;
    }

    this.downloadingJsonIds.add(video.id);
    this.cdr.detectChanges();

    this.apiService.getVideoResultJson(url)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `video_${video.id}_result.json`;
          link.click();
          URL.revokeObjectURL(blobUrl);
          this.toastr.success('Downloaded result JSON', 'Success');
        },
        error: () => {
          this.toastr.error('Failed to fetch result JSON. Please try again.', 'Error');
        },
        complete: () => {
          this.downloadingJsonIds.delete(video.id);
          this.cdr.detectChanges();
        }
      });
  }

  retryProcessing(videoId: number): void {
    this.apiService
      .reprocessVideo(videoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Processing re-queued.', 'Retry');
          this.loadVideos(false);
        },
        error: () => this.toastr.error('Could not re-queue processing.', 'Retry')
      });
  }

  deleteVideo(videoId: number): void {
    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return;
    }
    this.apiService
      .deleteMyVideo(videoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Video removed from your library.', 'Deleted');
          if (this.activeVideo?.id === videoId) {
            this.closePlayer();
          }
          this.loadVideos(false);
        },
        error: () => this.toastr.error('Delete failed. Please try again.', 'Error')
      });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'COMPLETED': return '#198754';
      case 'PROCESSING': return '#ffc107';
      case 'PENDING': return '#6c757d';
      case 'FAILED': return '#dc3545';
      default: return '#6c757d';
    }
  }

  getMetricSnapshot(video: Video) {
    const payload = video.result_payload;
    if (!payload) return null;

    const metrics: DrillVideoResultMetrics = payload.metrics || payload as any;
    const history = metrics.touch_tightness_history || (payload as any)?.touch_tightness_history || [];
    const avgTouch = metrics.avg_touch_tightness ?? (Array.isArray(history) && history.length
      ? history.reduce((sum, val) => sum + val, 0) / history.length
      : null);

    return {
      totalSteps: metrics.total_steps ?? (payload as any)?.total_steps ?? null,
      cadenceSpm: metrics.cadence_spm ?? (payload as any)?.cadence_spm ?? null,
      scansDetected: metrics.total_scans_detected ?? payload.total_scans_detected ?? (payload as any)?.total_scans_detected ?? null,
      movementSpeedPxS: metrics.movement_speed_px_s ?? (payload as any)?.movement_speed_px_s ?? null,
      avgTouchTightness: avgTouch,
      history
    };
  }
}