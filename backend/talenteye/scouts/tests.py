from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse
import uuid

from accounts.models import User
from players.models import PlayerProfile
from metrics.models import MetricDefinition, MetricResult
from videos.models import DrillVideo
from django.db.models.signals import post_save
from videos.signals import process_video


class ScoutExportReportTests(TestCase):
    def setUp(self):
        # Ensure a clean slate even when reusing the test DB with --keepdb
        MetricResult.objects.all().delete()
        DrillVideo.objects.all().delete()
        MetricDefinition.objects.all().delete()

        # Disable processing signal to avoid side effects during tests
        post_save.disconnect(process_video, sender=DrillVideo)

        self.client = APIClient()

        self.scout = User.objects.create_user(
            username='scout1', password='testpass', role='SCOUT'
        )
        self.player_user = User.objects.create_user(
            username='player1', password='testpass', role='PLAYER'
        )
        self.player_profile = PlayerProfile.objects.create(
            user=self.player_user,
            date_of_birth='2000-01-01',
            preferred_position='Forward',
            dominant_foot='Right',
            location='Test City'
        )

        unique_key = f"sprint_speed_{uuid.uuid4().hex[:8]}"
        self.metric_def = MetricDefinition.objects.create(
            key=unique_key,
            name='Sprint Speed',
            unit='m/s',
            description='Speed metric'
        )

        video = DrillVideo.objects.create(
            player=self.player_profile,
            drill=None,
            video='videos/test.mp4',
            status='COMPLETED'
        )

        MetricResult.objects.create(
            video=video,
            metric=self.metric_def,
            value=8.2,
            confidence=0.9
        )
        MetricResult.objects.create(
            video=video,
            metric=self.metric_def,
            value=8.5,
            confidence=0.95
        )

    def tearDown(self):
        # Reconnect the signal after tests
        post_save.connect(process_video, sender=DrillVideo)

    def test_scout_can_export_csv_report(self):
        self.client.force_authenticate(self.scout)
        url = reverse('scout-player-report-export', kwargs={'player_id': self.player_profile.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv')
        content = response.content.decode('utf-8')
        self.assertIn(self.metric_def.key, content)
        self.assertIn('Sprint Speed', content)
        self.assertIn('8.35', content)  # average of 8.2 and 8.5

    def test_non_scout_cannot_export(self):
        self.client.force_authenticate(self.player_user)
        url = reverse('scout-player-report-export', kwargs={'player_id': self.player_profile.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)
