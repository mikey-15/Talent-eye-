
from django.db import models
from players.models import PlayerProfile
from drills.models import Drill

class DrillVideo(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    )

    player = models.ForeignKey(PlayerProfile, on_delete=models.CASCADE)
    drill = models.ForeignKey(Drill, on_delete=models.SET_NULL, null=True, blank=True)
    video = models.FileField(upload_to='videos/')
    thumbnail = models.FileField(upload_to='thumbnails/', null=True, blank=True)
    annotated_video = models.FileField(upload_to='annotated/', null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    # Processing/result fields
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    result_json = models.FileField(upload_to='results/', null=True, blank=True)
    result_payload = models.JSONField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.player.user.username} - {self.drill.name}"
