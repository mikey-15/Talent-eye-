
import random
from metrics.models import MetricDefinition, MetricResult

def analyze(video):
    for metric in MetricDefinition.objects.all():
        MetricResult.objects.create(
            video=video,
            metric=metric,
            value=round(random.uniform(0.5, 5.0), 2),
            confidence=round(random.uniform(0.7, 0.95), 2)
        )

    video.status = 'COMPLETED'
    video.save()
