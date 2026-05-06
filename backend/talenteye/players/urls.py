from django.urls import path
from .views import PlayerProfileView, PlayerPerformanceView

urlpatterns = [
    path('profile/', PlayerProfileView.as_view(), name='player-profile'),
    path('performance/<int:player_id>/', PlayerPerformanceView.as_view(), name='player-performance'),
]