// src/app/components/videos/video-upload/video-upload.component.ts
import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, Video } from '../../../services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Subject, Subscription, interval, EMPTY } from 'rxjs';
import { takeUntil, catchError, take } from 'rxjs/operators';

@Component({
  selector: 'app-video-upload',
  standalone: false,
  templateUrl: './video-upload.component.html',
  styleUrls: ['./video-upload.component.css']
})
export class VideoUploadComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private processingPollSub: Subscription | null = null;
  private readonly processingPollIntervalMs = 4000;

  uploadForm: FormGroup;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  /** Upload HTTP request in flight, or simulated progress. */
  uploadPhase: 'idle' | 'uploading' | 'processing' = 'idle';
  uploadProgress = 0;
  /** Latest server state while polling after upload. */
  processingVideo: Video | null = null;
  /** Set when polling ends (COMPLETED or FAILED) until user dismisses or starts again. */
  processingResult: Video | null = null;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.uploadForm = this.fb.group({});
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.stopProcessingPoll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isUploading(): boolean {
    return this.uploadPhase === 'uploading';
  }

  get isProcessing(): boolean {
    return this.uploadPhase === 'processing';
  }

  get formLocked(): boolean {
    return this.uploadPhase === 'uploading' || this.uploadPhase === 'processing';
  }

  processingStatusMessage(): string {
    const v = this.processingVideo;
    if (!v) return 'Starting analysis…';
    switch (v.status) {
      case 'PENDING':
        return 'Queued for analysis…';
      case 'PROCESSING':
        return 'AI is analyzing your video…';
      case 'COMPLETED':
        return 'Analysis complete.';
      case 'FAILED':
        return 'Analysis could not be completed.';
      default:
        return 'Working…';
    }
  }

  private stopProcessingPoll(): void {
    if (this.processingPollSub) {
      this.processingPollSub.unsubscribe();
      this.processingPollSub = null;
    }
  }

  private startProcessingPoll(videoId: number): void {
    this.stopProcessingPoll();
    const poll = (): void => {
      this.apiService
        .getMyVideos()
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe({
          next: (videos) => {
            const v = videos?.find((x) => x.id === videoId);
            if (!v) {
              return;
            }
            this.processingVideo = v;
            this.cdr.detectChanges();
            if (v.status === 'COMPLETED' || v.status === 'FAILED') {
              this.stopProcessingPoll();
              this.uploadPhase = 'idle';
              this.processingResult = v;
              if (v.status === 'COMPLETED') {
                this.toastr.success('Your video is ready. View metrics or upload another.', 'Analysis complete');
              } else {
                this.toastr.error(v.error_message || 'Processing failed.', 'Analysis failed');
              }
              this.cdr.detectChanges();
            }
          },
          error: () => {
            this.toastr.warning('Could not refresh status. Check My Videos in a moment.', 'Status');
          }
        });
    };
    poll();
    this.processingPollSub = interval(this.processingPollIntervalMs)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => poll());
  }

  clearProcessingResult(): void {
    this.processingResult = null;
    this.processingVideo = null;
    this.removeFile();
    this.cdr.detectChanges();
  }

  goToVideos(): void {
    this.router.navigate(['/videos']);
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/mkv'];
    if (!validTypes.includes(file.type)) {
      this.toastr.error('Please select a valid video file (MP4, AVI, MOV, MKV)', 'Invalid File');
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB in bytes
    if (file.size > maxSize) {
      this.toastr.error('File size must be less than 100MB', 'File Too Large');
      return;
    }

    this.selectedFile = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'copy';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer!.files;
    if (files.length > 0) {
      const fileInput = document.getElementById('videoFile') as HTMLInputElement;
      if (fileInput) {
        fileInput.files = files;
        this.onFileSelected({ target: { files } });
      }
    }
  }

  removeFile(): void {
    this.selectedFile = null;
    this.previewUrl = null;
    const fileInput = document.getElementById('videoFile') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  onSubmit(): void {
    if (!this.selectedFile) {
      this.toastr.error('Please select a video file', 'Missing File');
      return;
    }

    this.processingResult = null;
    this.processingVideo = null;
    this.uploadPhase = 'uploading';
    this.uploadProgress = 0;

    const formData = new FormData();
    formData.append('video', this.selectedFile);

    const progressInterval = setInterval(() => {
      if (this.uploadProgress < 90) {
        this.uploadProgress += 10;
        this.cdr.detectChanges();
      }
    }, 300);

    this.apiService
      .uploadVideo(formData)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Error uploading video:', error);
          clearInterval(progressInterval);
          this.uploadPhase = 'idle';
          this.uploadProgress = 0;
          this.toastr.error('Failed to upload video. Please try again.', 'Error');
          this.cdr.detectChanges();
          return EMPTY;
        })
      )
      .subscribe({
        next: (response: Video) => {
          clearInterval(progressInterval);
          this.uploadProgress = 100;
          this.processingVideo = response;
          this.uploadPhase = 'processing';
          this.toastr.success(
            `Upload complete (video #${response?.id ?? '—'}). Analysis is running…`,
            'Uploaded'
          );
          this.cdr.detectChanges();
          this.startProcessingPoll(response.id);
        }
      });
  }
}