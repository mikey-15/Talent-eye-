from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import DrillVideo
from .serializers import DrillVideoSerializer
from .tasks import process_drillvideo_file
from players.models import PlayerProfile
from accounts.permissions import IsPlayer
from rest_framework.permissions import IsAuthenticated

class UploadDrillVideoView(APIView):
    permission_classes = [IsAuthenticated, IsPlayer]

    def post(self, request):
        # Get or create player profile
        player, created = PlayerProfile.objects.get_or_create(
            user=request.user,
            defaults={
                'date_of_birth': '2000-01-01',
                'preferred_position': 'Unknown',
                'dominant_foot': 'Right',
                'location': 'Unknown'
            }
        )
        serializer = DrillVideoSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(player=player)

        # Trigger background processing (Celery task) and return job id
        try:
            process_drillvideo_file.delay(instance.id)
        except Exception:
            # If Celery isn't configured, fall back to synchronous processing
            process_drillvideo_file.run(drillvideo_id=instance.id)

        return Response({'id': instance.id, **serializer.data}, status=201)

class MyVideosView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Check if user is a player
        if request.user.role != 'PLAYER':
            return Response(
                {"error": "Only players can access their videos. Your role is: " + request.user.role},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get or create player profile
        player, created = PlayerProfile.objects.get_or_create(
            user=request.user,
            defaults={
                'date_of_birth': '2000-01-01',
                'preferred_position': 'Unknown',
                'dominant_foot': 'Right',
                'location': 'Unknown'
            }
        )
        
        videos = DrillVideo.objects.filter(player=player)
        serializer = DrillVideoSerializer(videos, many=True, context={'request': request})
        return Response(serializer.data)


class ProcessDrillVideoSyncView(APIView):
    """Manually trigger processing of a DrillVideo synchronously (no Celery required)."""
    permission_classes = [IsAuthenticated, IsPlayer]

    def post(self, request, video_id):
        try:
            video = DrillVideo.objects.get(pk=video_id)
        except DrillVideo.DoesNotExist:
            return Response({"detail": "Video not found"}, status=status.HTTP_404_NOT_FOUND)

        # Player can only process own video
        if video.player.user != request.user:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        # Run synchronously using the same logic as the Celery task
        result = process_drillvideo_file.run(drillvideo_id=video_id)
        return Response(result)


class DeleteDrillVideoView(APIView):
    """Delete a player's own drill video record (and DB row; media cleanup may vary by storage)."""
    permission_classes = [IsAuthenticated, IsPlayer]

    def delete(self, request, video_id):
        try:
            video = DrillVideo.objects.get(pk=video_id)
        except DrillVideo.DoesNotExist:
            return Response({"detail": "Video not found"}, status=status.HTTP_404_NOT_FOUND)

        if video.player.user != request.user:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        video.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
