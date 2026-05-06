from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('drills', '0001_initial'),
		('videos', '0002_add_result_fields'),
	]

	operations = [
		migrations.AlterField(
			model_name='drillvideo',
			name='drill',
			field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, to='drills.drill'),
		),
	]