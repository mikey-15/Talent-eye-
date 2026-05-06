from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import PlayerProfileSerializer
from .models import PlayerProfile
from accounts.permissions import IsPlayer
from rest_framework.permissions import IsAuthenticated
from videos.models import DrillVideo
from metrics.models import MetricResult
from .performance_rating import calculate_overall_rating

class PlayerProfileView(APIView):
    permission_classes = [IsAuthenticated, IsPlayer]

    def get(self, request):
        # Get or create player profile
        profile, created = PlayerProfile.objects.get_or_create(
            user=request.user,
            defaults={
                'date_of_birth': '2000-01-01',
                'preferred_position': 'Unknown',
                'dominant_foot': 'Right',
                'location': 'Unknown'
            }
        )
        serializer = PlayerProfileSerializer(profile)
        return Response(serializer.data)

    def put(self, request):
        # Get or create player profile
        profile, created = PlayerProfile.objects.get_or_create(
            user=request.user,
            defaults={
                'date_of_birth': '2000-01-01',
                'preferred_position': 'Unknown',
                'dominant_foot': 'Right',
                'location': 'Unknown'
            }
        )
        serializer = PlayerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PlayerPerformanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, player_id):
        try:
            player = PlayerProfile.objects.get(id=player_id)
        except PlayerProfile.DoesNotExist:
            return Response({"detail": "Player not found"}, status=404)

        # Get all completed videos for this player
        videos = DrillVideo.objects.filter(player=player, status='COMPLETED')

        if not videos.exists():
            return Response({
                "player": PlayerProfileSerializer(player).data,
                "performance_summary": {
                    "total_videos": 0,
                    "overall_rating": 0,
                    "metrics_summary": {},
                    "drills_completed": []
                }
            })

        # Get all metrics for these videos
        metrics = MetricResult.objects.filter(video__in=videos).select_related('metric', 'video__drill')

        # Calculate overall statistics
        metrics_summary = {}
        drill_performance = []

        # Group metrics by type
        for metric_result in metrics:
            metric_key = metric_result.metric.key
            if metric_key not in metrics_summary:
                metrics_summary[metric_key] = {
                    'name': metric_result.metric.name,
                    'unit': metric_result.metric.unit,
                    'values': [],
                    'average': 0,
                    'best': 0,
                    'count': 0
                }
            metrics_summary[metric_key]['values'].append(metric_result.value)
            metrics_summary[metric_key]['count'] += 1

        # Calculate averages and best scores
        for key, data in metrics_summary.items():
            if data['values']:
                data['average'] = round(sum(data['values']) / len(data['values']), 2)
                data['best'] = round(max(data['values']), 2)
                # Remove raw values from response
                del data['values']

        # Group by drill
        drill_groups = {}
        for metric_result in metrics:
            video = metric_result.video
            drill = video.drill if video else None
            drill_name = drill.name if drill else 'Unspecified drill'

            # Use a stable key that distinguishes unnamed drills by video id
            drill_key = drill.id if drill else f"video-{video.id}"

            if drill_key not in drill_groups:
                video_url = None
                annotated_url = None
                if video.video:
                    video_url = request.build_absolute_uri(video.video.url)
                if video.annotated_video:
                    annotated_url = request.build_absolute_uri(video.annotated_video.url)
                drill_groups[drill_key] = {
                    'drill_name': drill_name,
                    'drill_id': drill.id if drill else None,
                    'video_id': video.id if video else None,
                    'uploaded_at': video.uploaded_at.isoformat() if video.uploaded_at else None,
                    'video_url': video_url,
                    'annotated_video_url': annotated_url,
                    'metrics': {}
                }

            drill_groups[drill_key]['metrics'][metric_result.metric.key] = {
                'name': metric_result.metric.name,
                'value': metric_result.value,
                'unit': metric_result.metric.unit
            }

        drill_performance = list(drill_groups.values())

        # Calculate overall rating (weighted average of key metrics)
        overall_rating = calculate_overall_rating(metrics_summary)

        response_data = {
            "player": PlayerProfileSerializer(player).data,
            "performance_summary": {
                "total_videos": videos.count(),
                "overall_rating": overall_rating,
                "metrics_summary": metrics_summary,
                "drills_completed": drill_performance
            }
        }

        return Response(response_data)

