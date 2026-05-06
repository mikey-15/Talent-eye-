
from rest_framework import serializers
from .models import DrillVideo


class DrillVideoSerializer(serializers.ModelSerializer):
    result_json_url = serializers.SerializerMethodField()
    result_payload = serializers.JSONField(read_only=True)
    thumbnail_url = serializers.SerializerMethodField()
    annotated_video_url = serializers.SerializerMethodField()

    class Meta:
        model = DrillVideo
        fields = '__all__'
        read_only_fields = (
            'player', 'status', 'uploaded_at', 'started_at', 'finished_at', 'result_json', 'result_payload', 'error_message', 'annotated_video'
        )

    def get_result_json_url(self, obj):
        if not obj.result_json:
            return None
        request = self.context.get('request') if self.context else None
        url = obj.result_json.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        request = self.context.get('request') if self.context else None
        url = obj.thumbnail.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_annotated_video_url(self, obj):
        if not obj.annotated_video:
            return None
        request = self.context.get('request') if self.context else None
        url = obj.annotated_video.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def validate(self, attrs):
        # allow drill to be optional; nothing extra to validate here
        return attrs