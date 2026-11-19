from django.contrib import admin

from .models import (
    Alarm,
    AlarmRule,
    Device,
    DeviceMetric,
    DeviceProfile,
    DeviceStatusLog,
    EnergyRecord,
    FactoryArea,
    InspectionPlan,
    InspectionPoint,
    InspectionRecord,
    InspectionRoute,
    InspectionTask,
    MaintenanceRecord,
    OperationLog,
    ProductionLine,
    RoutePoint,
    SceneConfig,
    SceneSnapshot,
    WorkOrder,
)


@admin.register(FactoryArea)
class AreaAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "sort")
    search_fields = ("code", "name")


@admin.register(ProductionLine)
class LineAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "area", "capacity_per_hour", "pos_z")
    list_filter = ("area",)


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "device_type", "area", "line", "status", "is_critical", "rated_power")
    list_filter = ("status", "device_type", "area", "is_critical")
    search_fields = ("code", "name")
    list_editable = ("status", "is_critical")


@admin.register(Alarm)
class AlarmAdmin(admin.ModelAdmin):
    list_display = ("id", "device", "level", "code", "status", "trigger_value", "threshold", "created_at")
    list_filter = ("level", "status")
    search_fields = ("device__code", "content")


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ("order_no", "title", "order_type", "device", "status", "assignee", "priority", "created_at")
    list_filter = ("status", "order_type", "priority")
    search_fields = ("order_no", "title")


@admin.register(AlarmRule)
class AlarmRuleAdmin(admin.ModelAdmin):
    list_display = ("device_type", "metric_key", "operator", "threshold", "level", "enabled")


@admin.register(InspectionPoint)
class PointAdmin(admin.ModelAdmin):
    list_display = ("name", "device", "position_x", "position_z")


@admin.register(InspectionRoute)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("name", "loop")


@admin.register(InspectionTask)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("id", "route", "status", "executor", "created_at", "finished_at")
    list_filter = ("status",)


@admin.register(MaintenanceRecord)
class MaintainAdmin(admin.ModelAdmin):
    list_display = ("device", "mtype", "operator", "cost", "created_at")


@admin.register(SceneConfig)
class SceneConfigAdmin(admin.ModelAdmin):
    list_display = ("bg_color", "updated_at")


@admin.register(OperationLog)
class LogAdmin(admin.ModelAdmin):
    list_display = ("operator", "action", "target", "ip", "created_at")
    list_filter = ("action",)


admin.site.register([DeviceStatusLog, DeviceMetric, EnergyRecord, InspectionPlan, InspectionRecord, RoutePoint, SceneSnapshot, DeviceProfile])
admin.site.site_header = "FT-Twin 数字孪生运维平台"
admin.site.site_title = "FT-Twin Admin"
