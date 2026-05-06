from django.shortcuts import render
# drills/views.py
from rest_framework.generics import ListAPIView
from .models import Drill
from .serializers import DrillSerializer

class DrillListView(ListAPIView):
    queryset = Drill.objects.all()
    serializer_class = DrillSerializer



