from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import MetricResult
from .serializers import MetricResultSerializer
from videos.models import DrillVideo
from accounts.permissions import IsPlayer, IsScout
from rest_framework.permissions import IsAuthenticated

class VideoMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, video_id):
        video = DrillVideo.objects.get(id=video_id)

        # Player can only view own video
        if request.user.role == 'PLAYER':
            if video.player.user != request.user:
                return Response({"detail": "Forbidden"}, status=403)

        # Scouts are allowed
        metrics = MetricResult.objects.filter(video=video)
        serializer = MetricResultSerializer(metrics, many=True)
        return Response(serializer.data)
