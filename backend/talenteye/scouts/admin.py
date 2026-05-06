from django.contrib import admin

from .models import ScoutShortlistEntry, ScoutWrittenReport


@admin.register(ScoutShortlistEntry)
class ScoutShortlistEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "scout", "player", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("scout__username", "player__user__username")


@admin.register(ScoutWrittenReport)
class ScoutWrittenReportAdmin(admin.ModelAdmin):
    list_display = ("id", "scout", "player", "title", "created_at")
    search_fields = ("scout__username", "player__user__username", "body")
