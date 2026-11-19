from rest_framework.permissions import SAFE_METHODS, BasePermission


def role_of(user):
    if not user or not user.is_authenticated:
        return "guest"
    if user.is_superuser:
        return "admin"
    profile = getattr(user, "profile", None)
    return profile.role if profile else "operator"


class IsAdmin(BasePermission):
    message = "仅管理员可操作"

    def has_permission(self, request, view):
        return role_of(request.user) == "admin"


class IsOperatorOrAdmin(BasePermission):
    message = "访客账号为只读，无法执行该操作"

    def has_permission(self, request, view):
        return role_of(request.user) in ("operator", "admin")


class ReadOnlyOrAdmin(BasePermission):
    """列表/详情所有人可读，写操作仅管理员（设备台账、场景配置）"""

    message = "只有管理员可以修改该资源"

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return role_of(request.user) == "admin"
