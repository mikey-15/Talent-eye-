
from rest_framework.permissions import BasePermission

class IsPlayer(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'PLAYER'


class IsScout(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'SCOUT'


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'ADMIN'
