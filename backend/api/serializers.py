from rest_framework import serializers

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


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = FactoryArea
        fields = ["id", "name", "code", "sort", "desc"]


class LineSerializer(serializers.ModelSerializer):
    area_code = serializers.CharField(source="area.code", read_only=True)
    # 前端三维场景与平面图按 z / capacity 取值，这里做别名映射
    z = serializers.FloatField(source="pos_z", read_only=True)
    capacity = serializers.IntegerField(source="capacity_per_hour", read_only=True)

    class Meta:
        model = ProductionLine
        fields = [
            "id", "area", "area_id", "area_code", "name", "code",
            "capacity_per_hour", "capacity", "pos_z", "z",
        ]


class DeviceSerializer(serializers.ModelSerializer):
    area_code = serializers.CharField(source="area.code", read_only=True)
    area_name = serializers.CharField(source="area.name", read_only=True)
    line_code = serializers.CharField(source="line.code", read_only=True, default="")
    overdue_days = serializers.IntegerField(read_only=True)

    class Meta:
        model = Device
        fields = [
            "id", "code", "name", "device_type", "area", "area_id", "area_code", "area_name",
            "line", "line_id", "line_code", "parent", "status", "is_critical",
            "glb_node_name", "position_x", "position_y", "position_z", "camera_preset",
            "rated_power", "install_date", "maintain_cycle_days", "last_maintain_date",
            "desc", "overdue_days", "created_at", "updated_at",
        ]
        read_only_fields = ["glb_node_name", "created_at", "updated_at", "overdue_days"]

    def validate_code(self, value):
        if not value.isalnum():
            raise serializers.ValidationError("设备编码只能包含字母与数字")
        return value

    def validate_position_x(self, value):
        if not -60 <= value <= 60:
            raise serializers.ValidationError("X 坐标超出车间范围（-60 ~ 60）")
        return value


class DeviceMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["id", "code", "name", "status", "device_type", "is_critical"]


class DeviceStatusLogSerializer(serializers.ModelSerializer):
    device_code = serializers.CharField(source="device.code", read_only=True)

    class Meta:
        model = DeviceStatusLog
        fields = ["id", "device", "device_code", "from_status", "to_status", "reason", "created_at"]


class DeviceMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceMetric
        fields = ["id", "device", "metric_key", "value", "unit", "created_at"]


class AlarmSerializer(serializers.ModelSerializer):
    device_code = serializers.CharField(source="device.code", read_only=True)
    device_name = serializers.CharField(source="device.name", read_only=True)
    area_code = serializers.CharField(source="device.area.code", read_only=True)
    device_id = serializers.IntegerField(source="device.id", read_only=True)

    class Meta:
        model = Alarm
        fields = [
            "id", "device", "device_id", "device_code", "device_name", "area_code",
            "level", "status", "code", "content", "trigger_value", "threshold",
            "ack_by", "ack_at", "closed_at", "created_at",
        ]
        read_only_fields = ["status", "ack_by", "ack_at", "closed_at", "created_at"]


class AlarmRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlarmRule
        fields = ["id", "device_type", "metric_key", "operator", "threshold", "level", "enabled"]


class WorkOrderSerializer(serializers.ModelSerializer):
    device_code = serializers.CharField(source="device.code", read_only=True, default="")
    device_name = serializers.CharField(source="device.name", read_only=True, default="")

    class Meta:
        model = WorkOrder
        fields = [
            "id", "order_no", "title", "order_type", "device", "device_id", "device_code",
            "device_name", "alarm", "alarm_id", "status", "assignee", "priority",
            "content", "result", "created_at", "updated_at", "closed_at",
        ]
        read_only_fields = ["order_no", "status", "created_at", "updated_at", "closed_at"]


class InspectionPointSerializer(serializers.ModelSerializer):
    device_code = serializers.CharField(source="device.code", read_only=True, default="")

    class Meta:
        model = InspectionPoint
        fields = ["id", "name", "device", "device_id", "device_code", "position_x", "position_y", "position_z", "check_items"]

    def validate_check_items(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("check_items 必须是字符串数组")
        return value


class RoutePointSerializer(serializers.ModelSerializer):
    point_detail = InspectionPointSerializer(source="point", read_only=True)

    class Meta:
        model = RoutePoint
        fields = ["id", "route", "point", "point_detail", "order"]


class InspectionRouteSerializer(serializers.ModelSerializer):
    points = serializers.SerializerMethodField()

    class Meta:
        model = InspectionRoute
        fields = ["id", "name", "loop", "points"]

    def get_points(self, obj):
        rps = obj.routepoint_set.select_related("point__device").order_by("order")
        return [InspectionPointSerializer(rp.point).data for rp in rps]


class InspectionRouteWriteSerializer(serializers.ModelSerializer):
    point_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)

    class Meta:
        model = InspectionRoute
        fields = ["id", "name", "loop", "point_ids"]

    def create(self, validated):
        point_ids = validated.pop("point_ids", [])
        route = InspectionRoute.objects.create(**validated)
        for i, pid in enumerate(point_ids):
            RoutePoint.objects.create(route=route, point_id=pid, order=i)
        return route


class InspectionPlanSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source="route.name", read_only=True)

    class Meta:
        model = InspectionPlan
        fields = ["id", "name", "route", "route_id", "route_name", "cycle", "cron", "assignee", "enabled"]


class InspectionTaskSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source="route.name", read_only=True)
    point_count = serializers.SerializerMethodField()
    record_count = serializers.SerializerMethodField()

    class Meta:
        model = InspectionTask
        fields = ["id", "plan", "route", "route_id", "route_name", "status", "executor",
                  "started_at", "finished_at", "created_at", "point_count", "record_count"]

    def get_point_count(self, obj):
        return obj.route.points.count()

    def get_record_count(self, obj):
        return obj.records.count()


class InspectionRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionRecord
        fields = ["id", "task", "point", "is_abnormal", "result", "remark", "created_at"]


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    device_code = serializers.CharField(source="device.code", read_only=True)

    class Meta:
        model = MaintenanceRecord
        fields = ["id", "device", "device_id", "device_code", "mtype", "operator", "cost",
                  "content", "attachment", "created_at"]
        read_only_fields = ["created_at"]


class EnergyRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnergyRecord
        fields = ["id", "device", "kwh", "recorded_at"]


class SceneConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SceneConfig
        fields = ["model_file", "status_colors", "layer_visible", "camera_presets", "bg_color", "updated_at"]
        read_only_fields = ["updated_at"]


class SceneSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = SceneSnapshot
        fields = ["id", "name", "camera_position", "camera_target", "layer_visible", "created_at"]
        read_only_fields = ["created_at"]


class OperationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperationLog
        fields = ["id", "operator", "action", "target", "before", "after", "ip", "created_at"]


class DeviceProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceProfile
        fields = ["role", "display_name"]
