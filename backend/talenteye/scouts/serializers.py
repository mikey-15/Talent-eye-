from rest_framework import serializers
from players.models import PlayerProfile

from .models import ScoutShortlistEntry, ScoutWrittenReport


class ScoutPlayerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    profile_image = serializers.SerializerMethodField()
    completed_videos_count = serializers.SerializerMethodField()
    overall_rating = serializers.SerializerMethodField()

    class Meta:
        model = PlayerProfile
        fields = (
            'id',
            'username',
            'date_of_birth',
            'height_cm',
            'preferred_position',
            'dominant_foot',
            'location',
            'profile_image',
            'completed_videos_count',
            'overall_rating',
        )

    def get_profile_image(self, obj):
        if not obj.profile_image:
            return None
        request = self.context.get('request')
        url = obj.profile_image.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_completed_videos_count(self, obj):
        return int(getattr(obj, 'completed_videos_count', 0) or 0)

    def get_overall_rating(self, obj):
        ratings = self.context.get('overall_ratings') or {}
        return ratings.get(obj.id)


class ScoutShortlistEntrySerializer(serializers.ModelSerializer):
    player = ScoutPlayerSerializer(read_only=True)

    class Meta:
        model = ScoutShortlistEntry
        fields = ("id", "player", "notes", "created_at", "updated_at")


class ScoutShortlistCreateSerializer(serializers.Serializer):
    player = serializers.PrimaryKeyRelatedField(queryset=PlayerProfile.objects.all())
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ScoutWrittenReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScoutWrittenReport
        fields = ("id", "title", "body", "created_at")
        read_only_fields = ("id", "created_at")