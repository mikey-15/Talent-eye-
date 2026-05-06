from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('videos', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='drillvideo',
            name='started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='drillvideo',
            name='finished_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='drillvideo',
            name='result_json',
            field=models.FileField(blank=True, null=True, upload_to='results/'),
        ),
        migrations.AddField(
            model_name='drillvideo',
            name='error_message',
            field=models.TextField(blank=True, null=True),
        ),
    ]
