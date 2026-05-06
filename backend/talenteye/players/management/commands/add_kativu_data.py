from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from datetime import date
from players.models import PlayerProfile
from drills.models import Drill
from videos.models import DrillVideo
from metrics.models import MetricDefinition, MetricResult

User = get_user_model()


class Command(BaseCommand):
    help = 'Adds dummy player data for Kativu with good ratings'

    def handle(self, *args, **kwargs):
        # Create or get user
        user, created = User.objects.get_or_create(
            username='kativu',
            defaults={
                'email': 'kativu@talenteye.com',
                'first_name': 'Kativu',
                'last_name': 'Mazvihwa',
                'role': 'PLAYER'
            }
        )
        
        if created:
            user.set_password('kativu2026')
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Created user: {user.username}'))
        else:
            self.stdout.write(self.style.WARNING(f'User already exists: {user.username}'))

        # Create or get player profile
        player, created = PlayerProfile.objects.get_or_create(
            user=user,
            defaults={
                'date_of_birth': date(2003, 5, 15),
                'height_cm': 182.0,
                'preferred_position': 'Forward',
                'dominant_foot': 'Right',
                'location': 'Harare, Zimbabwe'
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created player profile for: {user.username}'))
        else:
            self.stdout.write(self.style.WARNING(f'Player profile already exists for: {user.username}'))

        # Create drills
        drills_data = [
            {
                'name': 'Speed Sprint Test',
                'description': 'Measure 40-meter sprint speed',
                'duration_seconds': 30,
                'required_view': 'side'
            },
            {
                'name': 'Agility Cone Drill',
                'description': 'Test agility through cone weaving',
                'duration_seconds': 45,
                'required_view': 'top'
            },
            {
                'name': 'Ball Control Challenge',
                'description': 'Dribbling through markers',
                'duration_seconds': 60,
                'required_view': 'front'
            },
            {
                'name': 'Shooting Accuracy',
                'description': 'Target shooting from various positions',
                'duration_seconds': 120,
                'required_view': 'side'
            },
            {
                'name': 'Passing Precision',
                'description': 'Short and long passing accuracy test',
                'duration_seconds': 90,
                'required_view': 'top'
            }
        ]

        drills = []
        for drill_data in drills_data:
            drill, created = Drill.objects.get_or_create(
                name=drill_data['name'],
                defaults=drill_data
            )
            drills.append(drill)
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created drill: {drill.name}'))

        # Create metric definitions
        metrics_data = [
            {'key': 'sprint_speed', 'name': 'Sprint Speed', 'unit': 'm/s', 'description': 'Maximum sprint speed'},
            {'key': 'acceleration', 'name': 'Acceleration', 'unit': 'm/s²', 'description': 'Initial acceleration rate'},
            {'key': 'agility_score', 'name': 'Agility Score', 'unit': 'points', 'description': 'Overall agility rating'},
            {'key': 'ball_control', 'name': 'Ball Control', 'unit': 'points', 'description': 'Ball handling ability'},
            {'key': 'shooting_accuracy', 'name': 'Shooting Accuracy', 'unit': '%', 'description': 'Shot accuracy percentage'},
            {'key': 'passing_accuracy', 'name': 'Passing Accuracy', 'unit': '%', 'description': 'Pass completion rate'},
            {'key': 'reaction_time', 'name': 'Reaction Time', 'unit': 'ms', 'description': 'Response time to stimuli'},
            {'key': 'endurance', 'name': 'Endurance', 'unit': 'points', 'description': 'Stamina and endurance level'},
            {'key': 'technical_skill', 'name': 'Technical Skill', 'unit': 'points', 'description': 'Overall technical ability'},
            {'key': 'first_touch', 'name': 'First Touch', 'unit': 'points', 'description': 'Quality of first touch'}
        ]

        metric_definitions = {}
        for metric_data in metrics_data:
            metric, created = MetricDefinition.objects.get_or_create(
                key=metric_data['key'],
                defaults=metric_data
            )
            metric_definitions[metric_data['key']] = metric
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created metric: {metric.name}'))

        # Create drill videos and metric results with good ratings
        video_metrics = [
            {
                'drill': drills[0],  # Speed Sprint Test
                'metrics': {
                    'sprint_speed': 8.5,
                    'acceleration': 4.2,
                    'endurance': 88.0
                }
            },
            {
                'drill': drills[1],  # Agility Cone Drill
                'metrics': {
                    'agility_score': 92.0,
                    'reaction_time': 185.0,
                    'technical_skill': 87.0
                }
            },
            {
                'drill': drills[2],  # Ball Control Challenge
                'metrics': {
                    'ball_control': 91.0,
                    'first_touch': 89.0,
                    'technical_skill': 90.0
                }
            },
            {
                'drill': drills[3],  # Shooting Accuracy
                'metrics': {
                    'shooting_accuracy': 82.0,
                    'technical_skill': 86.0,
                    'first_touch': 88.0
                }
            },
            {
                'drill': drills[4],  # Passing Precision
                'metrics': {
                    'passing_accuracy': 89.0,
                    'technical_skill': 88.0,
                    'first_touch': 90.0
                }
            }
        ]

        for idx, video_data in enumerate(video_metrics):
            # Create a drill video (without actual video file for dummy data)
            drill_video, created = DrillVideo.objects.get_or_create(
                player=player,
                drill=video_data['drill'],
                defaults={
                    'video': f'videos/kativu_{video_data["drill"].name.lower().replace(" ", "_")}.mp4',
                    'status': 'COMPLETED'
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created drill video for: {video_data["drill"].name}'))
                
                # Add metric results
                for metric_key, value in video_data['metrics'].items():
                    MetricResult.objects.create(
                        video=drill_video,
                        metric=metric_definitions[metric_key],
                        value=value,
                        confidence=0.95
                    )
                    self.stdout.write(self.style.SUCCESS(f'  Added metric: {metric_key} = {value}'))
            else:
                self.stdout.write(self.style.WARNING(f'Drill video already exists for: {video_data["drill"].name}'))

        self.stdout.write(self.style.SUCCESS('\n✅ Successfully added Kativu dummy data with excellent ratings!'))
        self.stdout.write(self.style.SUCCESS(f'Username: kativu'))
        self.stdout.write(self.style.SUCCESS(f'Password: kativu2026'))
        self.stdout.write(self.style.SUCCESS(f'Role: PLAYER'))
        self.stdout.write(self.style.SUCCESS(f'Dominant Foot: Right'))
        self.stdout.write(self.style.SUCCESS(f'Position: Forward'))
        self.stdout.write(self.style.SUCCESS(f'Location: Harare, Zimbabwe'))
