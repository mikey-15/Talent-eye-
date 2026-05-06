
from rest_framework import serializers
from .models import User
from players.models import PlayerProfile

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'first_name', 'last_name')
        read_only_fields = ('id',)

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'role', 'first_name', 'last_name')

    def create(self, validated_data):
        first_name = validated_data.pop('first_name', '') or ''
        last_name = validated_data.pop('last_name', '') or ''
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email') or '',
            password=validated_data['password'],
            role=validated_data['role'],
            first_name=first_name,
            last_name=last_name,
        )

        # Automatically create player profile
        if user.role == 'PLAYER':
            PlayerProfile.objects.create(
                user=user,
                date_of_birth='2000-01-01',
                preferred_position='Unknown',
                dominant_foot='Right',
                location='Unknown'
            )

        return user
