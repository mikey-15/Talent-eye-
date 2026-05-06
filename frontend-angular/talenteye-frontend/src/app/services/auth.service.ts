// src/app/services/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { JwtHelperService } from '@auth0/angular-jwt';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'PLAYER' | 'SCOUT';
  first_name: string;
  last_name: string;
  full_name?: string;
}

export interface AuthResponse {
  refresh: string;
  access: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private apiUrl = environment.apiUrl;
  private jwtHelper = new JwtHelperService();

  constructor(
    private http: HttpClient,
    private router: Router,
    private toastr: ToastrService
  ) {
    this.loadStoredUser();
  }

  private loadStoredUser(): void {
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('current_user');
    
    if (token && !this.jwtHelper.isTokenExpired(token) && userStr) {
      try {
        const user: User = JSON.parse(userStr);
        this.currentUserSubject.next(user);
      } catch (e) {
        this.clearStorage();
      }
    } else {
      this.clearStorage();
    }
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/accounts/login/`, { username, password })
      .pipe(
        tap(response => {
          this.handleAuthentication(response);
          this.toastr.success('Login successful!', 'Welcome');
        }),
        catchError(error => {
          this.toastr.error('Invalid credentials', 'Login Failed');
          return throwError(() => error);
        })
      );
  }

  register(userData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/accounts/register/`, userData)
      .pipe(
        tap(() => {
          this.toastr.success('Registration successful! Please login.', 'Success');
        }),
        catchError(error => {
          this.toastr.error('Registration failed', 'Error');
          return throwError(() => error);
        })
      );
  }

  private handleAuthentication(response: AuthResponse): void {
    localStorage.setItem('access_token', response.access);
    localStorage.setItem('refresh_token', response.refresh);
    localStorage.setItem('current_user', JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  logout(): void {
    this.clearStorage();
    this.currentUserSubject.next(null);
    this.toastr.info('You have been logged out', 'Goodbye');
    this.router.navigate(['/login']);
  }

  refreshToken(): Observable<any> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      this.logout();
      return throwError(() => 'No refresh token');
    }

    return this.http.post<any>(`${this.apiUrl}/accounts/refresh/`, { refresh: refreshToken })
      .pipe(
        tap(response => {
          localStorage.setItem('access_token', response.access);
        }),
        catchError(error => {
          this.logout();
          return throwError(() => error);
        })
      );
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('access_token');
    return token ? !this.jwtHelper.isTokenExpired(token) : false;
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user ? user.role === role : false;
  }

  private clearStorage(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
  }

  updateUserProfile(profileData: any): void {
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      const updatedUser = { ...currentUser, ...profileData };
      localStorage.setItem('current_user', JSON.stringify(updatedUser));
      this.currentUserSubject.next(updatedUser);
    }
  }
}