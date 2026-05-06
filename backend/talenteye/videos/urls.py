from django.urls import path
from .views import (
    UploadDrillVideoView,
    MyVideosView,
    ProcessDrillVideoSyncView,
    DeleteDrillVideoView,
)

urlpatterns = [
    path('upload/', UploadDrillVideoView.as_view()),
    path('my/', MyVideosView.as_view()),
    path('process/<int:video_id>/', ProcessDrillVideoSyncView.as_view()),
    path('delete/<int:video_id>/', DeleteDrillVideoView.as_view()),
]
