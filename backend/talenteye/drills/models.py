
from django.db import models

class Drill(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    duration_seconds = models.IntegerField()
    required_view = models.CharField(max_length=50)

    def __str__(self):
        return self.name
