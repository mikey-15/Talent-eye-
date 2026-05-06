
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PlayerProfile1 {
  id: number;
  username: string;
  email?: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
  preferred_position: string | null;
  dominant_foot: string | null;
  location: string | null;
  profile_image?: string | null;
}

/** Player row from `GET /api/scouts/players/` (includes video-derived fields). */
export interface ScoutDirectoryPlayer extends PlayerProfile1 {
  completed_videos_count?: number;
  overall_rating?: number | null;
}

export interface PerformanceSummary {
  total_videos: number;
  overall_rating: number;
  metrics_summary: {
    [key: string]: {
      name: string;
      unit: string;
      average: number;
      best: number;
      count: number;
    };
  };
  drills_completed: Array<{
    drill_name: string;
    drill_id?: number | null;
    video_id: number;
    uploaded_at?: string | null;
    video_url?: string | null;
    annotated_video_url?: string | null;
    metrics: {
      [key: string]: {
        name: string;
        value: number;
        unit: string;
      };
    };
  }>;
}

export interface PlayerPerformance {
  player: PlayerProfile1;
  performance_summary: PerformanceSummary;
}

export interface Drill {
  id: number;
  name: string;
  description: string;
  duration_seconds: number;
  required_view: string;
}

export interface DrillVideoResultMetrics {
  touch_tightness_history?: number[];
  total_steps?: number;
  cadence_spm?: number;
  total_scans_detected?: number;
  avg_touch_tightness?: number;
  movement_speed_px_s?: number;
}

export interface DrillVideoResultPayload {
  video_file?: string;
  total_frames_processed?: number;
  metrics?: DrillVideoResultMetrics;
  total_scans_detected?: number;
  [key: string]: any;
}

export interface Video {
  id: number;
  drill?: number | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  uploaded_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  video?: string;
  annotated_video?: string | null;
  result_json?: string | null;
  result_json_url?: string | null;
  annotated_video_url?: string | null;
  result_payload?: DrillVideoResultPayload | null;
  error_message?: string | null;
  drill_name?: string;
  thumbnail_url?: string;
}

export interface Metric {
  metric_name: string;
  value: number;
  unit: string;
  confidence: number;
  percentile?: number;
  feedback?: string;
}

export interface ScoutShortlistEntry {
  id: number;
  player: ScoutDirectoryPlayer;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ScoutWrittenReport {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  /** Origin for resolving `/media/...` paths (falls back to API host if unset). */
  private mediaOriginBase(): string {
    const e = environment as { mediaOrigin?: string; apiUrl?: string };
    const explicit = e.mediaOrigin?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }
    if (e.apiUrl) {
      try {
        const u = new URL(e.apiUrl);
        return `${u.protocol}//${u.host}`;
      } catch {
        /* ignore */
      }
    }
    return '';
  }

  /** Turn relative `/media/...` or path-only URLs into absolute URLs for <video src>, <img src>. */
  resolveMediaUrl(url: string | null | undefined): string | null {
    if (url == null) return null;
    const trimmed = String(url).trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) {
      if (typeof window !== 'undefined' && window.location?.protocol) {
        return `${window.location.protocol}${trimmed}`;
      }
      return `https:${trimmed}`;
    }
    const base = this.mediaOriginBase();
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\//, '')}`;
    if (!base) return path;
    return `${base}${path}`;
  }

  // Player Profile
  getPlayerProfile(): Observable<PlayerProfile1> {
    return this.http.get<PlayerProfile1>(`${this.apiUrl}/player/profile/`);
  }

  updatePlayerProfile(profileData: any): Observable<PlayerProfile1> {
    return this.http.put<PlayerProfile1>(`${this.apiUrl}/player/profile/`, profileData);
  }

  getPlayerPerformance(playerId: number): Observable<PlayerPerformance> {
    return this.http.get<PlayerPerformance>(`${this.apiUrl}/player/performance/${playerId}/`);
  }

  // Drills
  getDrills(): Observable<Drill[]> {
    return this.http.get<Drill[]>(`${this.apiUrl}/drills/`);
  }

  // Videos
  uploadVideo(formData: FormData): Observable<Video> {
    return this.http.post<Video>(`${this.apiUrl}/videos/upload/`, formData);
  }

  getMyVideos(): Observable<Video[]> {
    return this.http.get<Video[]>(`${this.apiUrl}/videos/my/`);
  }

  reprocessVideo(videoId: number): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/videos/process/${videoId}/`, {});
  }

  deleteMyVideo(videoId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/videos/delete/${videoId}/`);
  }

  getVideoResultJson(resultUrl: string): Observable<any> {
    const resolved = this.resolveMediaUrl(resultUrl) || resultUrl;
    return this.http.get(resolved);
  }

  // Metrics
  getVideoMetrics(videoId: number): Observable<Metric[]> {
    return this.http.get<Metric[]>(`${this.apiUrl}/metrics/video/${videoId}/`);
  }

  fetchResultJson(url: string): Observable<any> {
    const resolved = this.resolveMediaUrl(url) || url;
    return this.http.get(resolved);
  }

  // Scout endpoints
  getAllPlayers(): Observable<ScoutDirectoryPlayer[]> {
    return this.http.get<ScoutDirectoryPlayer[]>(`${this.apiUrl}/scouts/players/`);
  }

  getPlayerMetrics(playerId: number): Observable<Metric[]> {
    return this.http.get<Metric[]>(`${this.apiUrl}/scouts/players/${playerId}/metrics/`);
  }

  exportScoutPlayerReport(playerId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/scouts/players/${playerId}/report/export/`, {
      responseType: 'blob'
    });
  }

  getScoutShortlist(): Observable<ScoutShortlistEntry[]> {
    return this.http.get<ScoutShortlistEntry[]>(`${this.apiUrl}/scouts/shortlist/`);
  }

  addScoutShortlist(playerId: number, notes?: string): Observable<ScoutShortlistEntry> {
    const body: { player: number; notes?: string } = { player: playerId };
    if (notes !== undefined) {
      body.notes = notes;
    }
    return this.http.post<ScoutShortlistEntry>(`${this.apiUrl}/scouts/shortlist/`, body);
  }

  patchScoutShortlistNotes(playerId: number, notes: string): Observable<ScoutShortlistEntry> {
    return this.http.patch<ScoutShortlistEntry>(`${this.apiUrl}/scouts/shortlist/${playerId}/`, {
      notes
    });
  }

  removeScoutShortlist(playerId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/scouts/shortlist/${playerId}/`);
  }

  getScoutWrittenReports(playerId: number): Observable<ScoutWrittenReport[]> {
    return this.http.get<ScoutWrittenReport[]>(
      `${this.apiUrl}/scouts/players/${playerId}/written-reports/`
    );
  }

  postScoutWrittenReport(
    playerId: number,
    body: string,
    title?: string
  ): Observable<ScoutWrittenReport> {
    return this.http.post<ScoutWrittenReport>(
      `${this.apiUrl}/scouts/players/${playerId}/written-reports/`,
      { body, title: title ?? '' }
    );
  }

  // Utility method for file uploads
  createFormData(data: any): FormData {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return formData;
  }
}