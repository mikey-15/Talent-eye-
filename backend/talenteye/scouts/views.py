import csv
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.permissions import IsScout
from players.models import PlayerProfile
from players.performance_rating import bulk_overall_ratings_by_player_id
from .models import ScoutShortlistEntry, ScoutWrittenReport
from .serializers import (
    ScoutPlayerSerializer,
    ScoutShortlistCreateSerializer,
    ScoutShortlistEntrySerializer,
    ScoutWrittenReportSerializer,
)
from metrics.models import MetricResult
from metrics.serializers import MetricResultSerializer

class ScoutPlayerListView(APIView):
    permission_classes = [IsScout]

    def get(self, request):
        players = (
            PlayerProfile.objects.select_related("user")
            .annotate(
                completed_videos_count=Count(
                    "drillvideo",
                    filter=Q(drillvideo__status="COMPLETED"),
                )
            )
            .order_by("user__username")
        )
        ids = list(players.values_list("id", flat=True))
        ratings = bulk_overall_ratings_by_player_id(ids)
        serializer = ScoutPlayerSerializer(
            players,
            many=True,
            context={"request": request, "overall_ratings": ratings},
        )
        return Response(serializer.data)





class ScoutPlayerMetricsView(APIView):
    permission_classes = [IsScout]

    def get(self, request, player_id):
        metrics = MetricResult.objects.filter(video__player__id=player_id)
        serializer = MetricResultSerializer(metrics, many=True)
        return Response(serializer.data)


class ScoutPlayerReportExportView(APIView):
    permission_classes = [IsScout]

    def get(self, request, player_id):
        try:
            player = PlayerProfile.objects.select_related('user').get(id=player_id)
        except PlayerProfile.DoesNotExist:
            return Response({"detail": "Player not found"}, status=404)

        metrics = (
            MetricResult.objects
            .filter(video__player_id=player_id, video__status='COMPLETED')
            .select_related('metric', 'video')
        )

        # Aggregate metrics
        summary = {}
        for m in metrics:
            key = m.metric.key
            if key not in summary:
                summary[key] = {
                    'metric_name': m.metric.name,
                    'unit': m.metric.unit,
                    'values': []
                }
            summary[key]['values'].append(m.value)

        # Prepare CSV response
        response = HttpResponse(content_type='text/csv')
        filename = f"player_{player.id}_report.csv"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        writer.writerow([
            'player_id', 'username', 'preferred_position',
            'metric_key', 'metric_name', 'unit', 'average', 'best', 'count'
        ])

        for key, data in summary.items():
            values = data['values']
            avg = round(sum(values) / len(values), 2) if values else 0
            best = round(max(values), 2) if values else 0
            writer.writerow([
                player.id,
                player.user.username,
                player.preferred_position,
                key,
                data['metric_name'],
                data['unit'],
                avg,
                best,
                len(values)
            ])

        # If no metrics, still return header row only
        return response


class ScoutShortlistListCreateView(APIView):
    permission_classes = [IsScout]

    def get(self, request):
        qs = (
            ScoutShortlistEntry.objects.filter(scout=request.user)
            .select_related("player__user")
            .order_by("-updated_at")
        )
        entries = list(qs)
        player_ids = [e.player_id for e in entries]
        ratings = bulk_overall_ratings_by_player_id(player_ids)
        enriched = (
            PlayerProfile.objects.filter(id__in=player_ids)
            .select_related("user")
            .annotate(
                completed_videos_count=Count(
                    "drillvideo",
                    filter=Q(drillvideo__status="COMPLETED"),
                )
            )
        )
        pmap = {p.id: p for p in enriched}
        for e in entries:
            if e.player_id in pmap:
                e.player = pmap[e.player_id]
        return Response(
            ScoutShortlistEntrySerializer(
                entries,
                many=True,
                context={
                    "request": request,
                    "overall_ratings": ratings,
                },
            ).data
        )

    def post(self, request):
        ser = ScoutShortlistCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        player = ser.validated_data["player"]
        notes = ser.validated_data.get("notes") or ""
        obj, created = ScoutShortlistEntry.objects.get_or_create(
            scout=request.user,
            player=player,
            defaults={"notes": notes},
        )
        if not created and "notes" in request.data:
            obj.notes = request.data.get("notes") or ""
            obj.save(update_fields=["notes", "updated_at"])
        out = ScoutShortlistEntrySerializer(obj, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ScoutShortlistDetailView(APIView):
    permission_classes = [IsScout]

    def patch(self, request, player_id):
        try:
            entry = ScoutShortlistEntry.objects.get(scout=request.user, player_id=player_id)
        except ScoutShortlistEntry.DoesNotExist:
            return Response({"detail": "Not on shortlist"}, status=status.HTTP_404_NOT_FOUND)
        notes = request.data.get("notes")
        if notes is not None:
            entry.notes = notes
            entry.save(update_fields=["notes", "updated_at"])
        return Response(
            ScoutShortlistEntrySerializer(entry, context={"request": request}).data
        )

    def delete(self, request, player_id):
        deleted, _ = ScoutShortlistEntry.objects.filter(
            scout=request.user, player_id=player_id
        ).delete()
        if not deleted:
            return Response({"detail": "Not on shortlist"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScoutPlayerWrittenReportsView(APIView):
    permission_classes = [IsScout]

    def get(self, request, player_id):
        if not PlayerProfile.objects.filter(id=player_id).exists():
            return Response({"detail": "Player not found"}, status=status.HTTP_404_NOT_FOUND)
        reports = ScoutWrittenReport.objects.filter(
            scout=request.user, player_id=player_id
        ).order_by("-created_at")
        return Response(ScoutWrittenReportSerializer(reports, many=True).data)

    def post(self, request, player_id):
        try:
            PlayerProfile.objects.get(id=player_id)
        except PlayerProfile.DoesNotExist:
            return Response({"detail": "Player not found"}, status=status.HTTP_404_NOT_FOUND)
        body = (request.data.get("body") or "").strip()
        if not body:
            return Response({"detail": "body is required"}, status=status.HTTP_400_BAD_REQUEST)
        title = (request.data.get("title") or "")[:200]
        report = ScoutWrittenReport.objects.create(
            scout=request.user,
            player_id=player_id,
            title=title,
            body=body,
        )
        return Response(
            ScoutWrittenReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )
