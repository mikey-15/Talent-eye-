from django.urls import path
from .views import DrillListView

urlpatterns = [
    path('', DrillListView.as_view()),
]
