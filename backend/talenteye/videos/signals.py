# videos/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import DrillVideo
from analysis.mock_engine import analyze

@receiver(post_save, sender=DrillVideo)
def process_video(sender, instance, created, **kwargs):
    if created:
        instance.status = 'PROCESSING'
        instance.save()
        analyze(instance)
