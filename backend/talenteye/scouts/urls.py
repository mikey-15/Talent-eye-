
from django.urls import path
from .views import (
    ScoutPlayerListView,
    ScoutPlayerMetricsView,
    ScoutPlayerReportExportView,
    ScoutShortlistListCreateView,
    ScoutShortlistDetailView,
    ScoutPlayerWrittenReportsView,
)

urlpatterns = [
    path('players/', ScoutPlayerListView.as_view(), name='scout-player-list'),
    path('players/<int:player_id>/metrics/', ScoutPlayerMetricsView.as_view(), name='scout-player-metrics'),
    path('players/<int:player_id>/report/export/', ScoutPlayerReportExportView.as_view(), name='scout-player-report-export'),
    path(
        'players/<int:player_id>/written-reports/',
        ScoutPlayerWrittenReportsView.as_view(),
        name='scout-player-written-reports',
    ),
    path('shortlist/', ScoutShortlistListCreateView.as_view(), name='scout-shortlist-list'),
    path('shortlist/<int:player_id>/', ScoutShortlistDetailView.as_view(), name='scout-shortlist-detail'),
]
