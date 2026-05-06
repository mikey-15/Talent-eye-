from rest_framework import serializers
from .models import MetricResult

class MetricResultSerializer(serializers.ModelSerializer):
    metric_name = serializers.CharField(source='metric.name', read_only=True)
    unit = serializers.CharField(source='metric.unit', read_only=True)

    class Meta:
        model = MetricResult
        fields = ('metric_name', 'value', 'unit', 'confidence')