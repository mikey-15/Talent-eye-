
from rest_framework import serializers
from .models import PlayerProfile

class PlayerProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = PlayerProfile
        fields = '__all__'
