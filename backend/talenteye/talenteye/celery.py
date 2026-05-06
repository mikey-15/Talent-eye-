import os
from celery import Celery

# Set default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'talenteye.settings')

# Use environment variable CELERY_BROKER_URL if provided, otherwise default to local Redis.
BROKER = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')

app = Celery('talenteye', broker=BROKER)

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django app configs.
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
