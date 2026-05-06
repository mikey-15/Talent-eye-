from django.db import models
from accounts.models import User

class PlayerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    profile_image = models.ImageField(
        upload_to='profile_images/',
        null=True,
        blank=True
    )
    date_of_birth = models.DateField()
    height_cm = models.FloatField(null=True, blank=True)
    preferred_position = models.CharField(max_length=50)
    dominant_foot = models.CharField(max_length=10)
    location = models.CharField(max_length=100)

    def __str__(self):
        return self.user.username