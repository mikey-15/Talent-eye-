from django.urls import path
from .views import VideoMetricsView

urlpatterns = [
    path('video/<int:video_id>/', VideoMetricsView.as_view()),
]
