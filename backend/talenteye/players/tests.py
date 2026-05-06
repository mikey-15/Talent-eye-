from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse

from accounts.models import User
from players.models import PlayerProfile
from videos.models import DrillVideo
from metrics.models import MetricDefinition, MetricResult


class PlayerPerformanceViewTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.user = User.objects.create_user(
			username='player1', password='testpass', role='PLAYER'
		)
		self.profile = PlayerProfile.objects.create(
			user=self.user,
			date_of_birth='2000-01-01',
			preferred_position='Midfielder',
			dominant_foot='Right',
			location='Test City'
		)
		self.client.force_authenticate(user=self.user)

	def test_performance_view_handles_missing_drill(self):
		# Create a video without a drill
		video = DrillVideo.objects.create(
			player=self.profile,
			drill=None,
			video='videos/test.mp4',
			status='COMPLETED'
		)

		metric_def = MetricDefinition.objects.create(
			key='agility_score',
			name='Agility Score',
			unit='points',
			description='Agility metric'
		)
		MetricResult.objects.create(
			video=video,
			metric=metric_def,
			value=75.0,
			confidence=0.9
		)

		url = reverse('player-performance', kwargs={'player_id': self.profile.id})
		response = self.client.get(url)

		self.assertEqual(response.status_code, 200)
		drills_completed = response.data['performance_summary']['drills_completed']
		self.assertEqual(len(drills_completed), 1)
		self.assertEqual(drills_completed[0]['drill_name'], 'Unspecified drill')
