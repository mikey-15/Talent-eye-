from django.db import models

from accounts.models import User
from players.models import PlayerProfile


class ScoutShortlistEntry(models.Model):
    """A scout's shortlist row for a player (server-side, survives new devices)."""

    scout = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="shortlist_entries"
    )
    player = models.ForeignKey(
        PlayerProfile, on_delete=models.CASCADE, related_name="shortlisted_by"
    )
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["scout", "player"], name="unique_scout_player_shortlist"
            )
        ]

    def __str__(self):
        return f"{self.scout.username} → {self.player.user.username}"


class ScoutWrittenReport(models.Model):
    """Narrative scouting report written by a scout about a player."""

    scout = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="written_scout_reports"
    )
    player = models.ForeignKey(
        PlayerProfile, on_delete=models.CASCADE, related_name="scout_written_reports"
    )
    title = models.CharField(max_length=200, blank=True, default="")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Report by {self.scout.username} on {self.player.user.username}"
