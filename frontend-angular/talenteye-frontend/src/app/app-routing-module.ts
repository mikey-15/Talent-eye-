import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

// Components
import { LoginComponent } from './components/auth/login/login.component';
import { RegisterComponent } from './components/auth/register/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { VideoUploadComponent } from './components/videos/video-upload/video-upload.component';
import { Home } from './components/home/home';
import { PlayerProfile } from './components/player-profile/player-profile';
import { VideoList } from './components/videos/video-list/video-list';
import { MetricsDashboard } from './components/metrics-dashboard/metrics-dashboard';
import { ScoutPlayers } from './components/scout/scout-players/scout-players';
import { ScoutPlayerDetail } from './components/scout/scout-player-detail/scout-player-detail';
import { ScoutCompareComponent } from './components/scout/scout-compare/scout-compare.component';
import { ScoutDashboardComponent } from './components/scout/scout-dashboard/scout-dashboard.component';
import { ScoutShortlistComponent } from './components/scout/scout-shortlist/scout-shortlist.component';
import { SettingsComponent } from './components/settings/settings.component';

const routes: Routes = [
  // Public routes
  { path: '', component: Home },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  
  // Protected routes
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [AuthGuard] 
  },
  {
    path: 'settings',
    component: SettingsComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'profile',
    component: PlayerProfile,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'PLAYER' }
  },
  {
    path: 'upload',
    component: VideoUploadComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'PLAYER' }
  },
  {
    path: 'videos',
    component: VideoList,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'PLAYER' }
  },
  {
    path: 'metrics',
    component: MetricsDashboard,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'PLAYER' }
  },
  {
    path: 'scout/players/:id',
    component: ScoutPlayerDetail,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'SCOUT' }
  },
  {
    path: 'scout/players',
    component: ScoutPlayers,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'SCOUT' }
  },
  {
    path: 'scout/compare',
    component: ScoutCompareComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'SCOUT' }
  },
  {
    path: 'scout/shortlist',
    component: ScoutShortlistComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'SCOUT' }
  },
  {
    path: 'scout',
    component: ScoutDashboardComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'SCOUT' }
  },
  
  // Fallback route
  { path: '**', redirectTo: '/' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
