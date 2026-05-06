import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';

import { provideCharts, withDefaultRegisterables, BaseChartDirective } from 'ng2-charts';

import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { JwtModule } from '@auth0/angular-jwt';



import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ErrorInterceptor } from './interceptors/error.interceptor';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';
import { environment } from '../environments/environment';

// Components (we'll create these next)
import { LoginComponent } from './components/auth/login/login.component';
import { RegisterComponent } from './components/auth/register/register.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
// import { PlayerProfileComponent } from './components/player/player-profile/player-profile.component';
import { VideoUploadComponent } from './components/videos/video-upload/video-upload.component';
// import { VideoListComponent } from './components/videos/video-list/video-list.component';
// import { MetricsDashboardComponent } from './components/metrics/metrics-dashboard/metrics-dashboard.component';
// import { ScoutPlayersComponent } from './components/scout/scout-players/scout-players.component';
// import { ScoutPlayerDetailComponent } from './components/scout/scout-player-detail/scout-player-detail.component';
import { NavbarComponent } from './components/layout/navbar/navbar.component';
import { FooterComponent } from './components/layout/footer/footer.component';
// import { HomeComponent } from './components/home/home.component';
import { LoadingSpinnerComponent } from './components/shared/loading-spinner/loading-spinner.component';
import { VideoList } from './components/videos/video-list/video-list';
import { MetricsDashboard } from './components/metrics-dashboard/metrics-dashboard';
import { PlayerProfile } from './components/player-profile/player-profile';
import { ScoutPlayers } from './components/scout/scout-players/scout-players';
import { ScoutPlayerDetail } from './components/scout/scout-player-detail/scout-player-detail';
import { Home } from './components/home/home';
import { SettingsComponent } from './components/settings/settings.component';
import { ScoutCompareComponent } from './components/scout/scout-compare/scout-compare.component';
import { ScoutDashboardComponent } from './components/scout/scout-dashboard/scout-dashboard.component';
import { ScoutShortlistComponent } from './components/scout/scout-shortlist/scout-shortlist.component';
import { CoachMetricTitlePipe } from './pipes/coach-metric-title.pipe';

export function tokenGetter() {
  return localStorage.getItem('access_token');
}


@NgModule({
  declarations: [
    App,
    LoginComponent,
    RegisterComponent,
    DashboardComponent,
    VideoUploadComponent,
    NavbarComponent,
    FooterComponent,
    LoadingSpinnerComponent,
    VideoList,
    MetricsDashboard,
    PlayerProfile,
    ScoutPlayers,
    ScoutPlayerDetail,
    ScoutCompareComponent,
    ScoutDashboardComponent,
    ScoutShortlistComponent,
    SettingsComponent,
    Home,
    CoachMetricTitlePipe
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    BaseChartDirective,
    ToastrModule.forRoot({
      timeOut: 3000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
    }),
    JwtModule.forRoot({
      config: {
        tokenGetter: tokenGetter,
        allowedDomains: ['localhost:8000', '127.0.0.1:8000'],
        disallowedRoutes: [
          `${environment.apiUrl}/accounts/login/`,
          `${environment.apiUrl}/accounts/register/`,
          `${environment.apiUrl}/accounts/refresh/`
        ]
      }
    })
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCharts(withDefaultRegisterables()),
    AuthGuard,
    RoleGuard,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true }
  ],
  bootstrap: [App]
})
export class AppModule { }
