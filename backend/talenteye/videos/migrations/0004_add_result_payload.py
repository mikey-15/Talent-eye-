from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('videos', '0003_make_drill_optional'),
	]

	operations = [
		migrations.AddField(
			model_name='drillvideo',
			name='result_payload',
			field=models.JSONField(blank=True, null=True),
		),
	]