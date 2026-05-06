
from django.db import models

class MetricDefinition(models.Model):
    key = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    unit = models.CharField(max_length=20)
    description = models.TextField()

    def __str__(self):
        return self.name



class MetricResult(models.Model):
    video = models.ForeignKey('videos.DrillVideo', on_delete=models.CASCADE)
    metric = models.ForeignKey(MetricDefinition, on_delete=models.CASCADE)
    value = models.FloatField()
    confidence = models.FloatField(default=1.0)
