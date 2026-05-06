
import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService, PlayerProfile1 } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil, finalize, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-player-profile',
  standalone: false,
  templateUrl: './player-profile.html',
  styleUrls: ['./player-profile.css']
})
export class PlayerProfile implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  profileForm: FormGroup;
  isLoading = false;
  isEditing = false;
  profile: PlayerProfile1 | null = null;
  
  positions = [
    'Goalkeeper',
    'Center Back',
    'Full Back',
    'Defensive Midfielder',
    'Central Midfielder',
    'Attacking Midfielder',
    'Winger',
    'Striker',
    'Forward'
  ];
  
  footOptions = [
    { value: 'Right', label: 'Right', icon: 'bi-foot' },
    { value: 'Left', label: 'Left', icon: 'bi-foot' },
    { value: 'Both', label: 'Both', icon: 'bi-feet' }
  ];

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    public authService: AuthService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.profileForm = this.fb.group({
      date_of_birth: [''],
      height_cm: ['', [Validators.min(100), Validators.max(250)]],
      preferred_position: [''],
      dominant_foot: [''],
      location: ['']
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProfile(): void {
    this.isLoading = true;
    this.apiService.getPlayerProfile()
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error loading profile:', error);
          this.toastr.error('Failed to load profile', 'Error');
          return of(null);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (profile) => {
          if (profile) {
            this.profile = profile;
            this.profileForm.patchValue({
              date_of_birth: profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
              height_cm: profile.height_cm || '',
              preferred_position: profile.preferred_position || '',
              dominant_foot: profile.dominant_foot || '',
              location: profile.location || ''
            });
            this.cdr.detectChanges();
          }
        }
      });
  }

  toggleEdit(): void {
    this.isEditing = !this.isEditing;
    if (!this.isEditing) {
      this.loadProfile(); // Reset form
    }
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched(this.profileForm);
      return;
    }

    this.isLoading = true;
    const formData = this.profileForm.value;

    this.apiService.updatePlayerProfile(formData)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error updating profile:', error);
          this.toastr.error('Failed to update profile', 'Error');
          return of(null);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (updatedProfile) => {
          if (updatedProfile) {
            this.profile = updatedProfile;
            this.isEditing = false;
            this.authService.updateUserProfile({
              preferred_position: updatedProfile.preferred_position,
              location: updatedProfile.location
            });
            this.toastr.success('Profile updated successfully', 'Success');
            this.cdr.detectChanges();
          }
        }
      });
  }

  calculateAge(birthDate: string | null | undefined): number {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  getHeightInFeet(heightCm: number | null | undefined): string {
    if (!heightCm) return 'N/A';
    const totalInches = heightCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}'${inches}"`;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  get date_of_birth() { return this.profileForm.get('date_of_birth'); }
  get height_cm() { return this.profileForm.get('height_cm'); }
  get preferred_position() { return this.profileForm.get('preferred_position'); }
  get dominant_foot() { return this.profileForm.get('dominant_foot'); }
  get location() { return this.profileForm.get('location'); }
}