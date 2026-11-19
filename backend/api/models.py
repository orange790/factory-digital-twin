"""
业务数据模型（对应 PRD §7）
--------------------------------------------------------------
分层：组织 → 设备 → 指标/状态流水 → 告警 → 工单 → 巡检 → 维护/能耗 → 场景配置/审计
"""
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


# ----------------------------------------------------------------- 基础组织
class FactoryArea(models.Model):
    """车间 / 区域"""

    name = models.CharField(max_length=50)
    code = models.CharField(max_length=30, unique=True)
    sort = models.IntegerField(default=0)
    desc = models.TextField(blank=True)

    class Meta:
        ordering = ["sort", "id"]
        verbose_name = "车间"
        verbose_name_plural = "车间"

    def __str__(self):
        return f"{self.code} {self.name}"


class ProductionLine(models.Model):
    """产线"""

    area = models.ForeignKey(FactoryArea, on_delete=models.CASCADE, related_name="lines")
    name = models.CharField(max_length=50)
    code = models.CharField(max_length=30, unique=True)
    capacity_per_hour = models.IntegerField(default=0, help_text="设计节拍 件/小时")
    # 三维布局：产线在车间中的 Z 位置，前端据此生成导轨与设备带
    pos_z = models.FloatField(default=0)

    class Meta:
        ordering = ["area__sort", "code"]
        verbose_name = "产线"
        verbose_name_plural = "产线"

    def __str__(self):
        return f"{self.code} {self.name}"


# ----------------------------------------------------------------- 设备
class Device(models.Model):
    STATUS_CHOICES = [
        ("normal", "正常运行"),
        ("offline", "离线"),
        ("fault", "故障告警"),
        ("stop", "停机"),
    ]
    TYPE_CHOICES = [
        ("machine", "机床"),
        ("robot", "机械臂"),
        ("sensor", "传感器"),
        ("gauge", "检测仪"),
        ("agv", "AGV"),
    ]

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    device_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default="machine")
    area = models.ForeignKey(FactoryArea, on_delete=models.CASCADE, related_name="devices")
    line = models.ForeignKey(ProductionLine, null=True, blank=True, on_delete=models.SET_NULL, related_name="devices")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE,
        related_name="children", help_text="设备树父节点，如夹爪之于机械臂",
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="offline", db_index=True)
    is_critical = models.BooleanField(default=False, help_text="关键设备，告警优先")

    # 三维绑定
    glb_node_name = models.CharField(max_length=100, blank=True, help_text="GLB 节点名，如 DEV_M01")
    position_x = models.FloatField(default=0)
    position_y = models.FloatField(default=0)
    position_z = models.FloatField(default=0)
    camera_preset = models.CharField(max_length=50, blank=True)

    # 资产属性
    rated_power = models.FloatField(default=0, help_text="额定功率 kW")
    install_date = models.DateField(null=True, blank=True)
    maintain_cycle_days = models.IntegerField(default=90)
    last_maintain_date = models.DateField(null=True, blank=True)

    desc = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["area_id", "line_id", "code"]
        indexes = [models.Index(fields=["status", "area"])]
        verbose_name = "设备"
        verbose_name_plural = "设备"

    def __str__(self):
        return f"{self.code} {self.name}"

    def save(self, *args, **kwargs):
        if not self.glb_node_name:
            self.glb_node_name = f"DEV_{self.code}"
        super().save(*args, **kwargs)

    @property
    def overdue_days(self):
        """保养超期天数，0 表示正常"""
        if not self.last_maintain_date:
            return 0
        due = self.last_maintain_date + timedelta(days=self.maintain_cycle_days or 90)
        return max(0, (timezone.localdate() - due).days)


class DeviceStatusLog(models.Model):
    """状态变更流水，同时作为三维状态回放的数据源"""

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="status_logs")
    from_status = models.CharField(max_length=10, blank=True)
    to_status = models.CharField(max_length=10)
    reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "状态流水"
        verbose_name_plural = "状态流水"


class DeviceMetric(models.Model):
    """时序指标（演示用单表；生产可换 InfluxDB / TDengine）"""

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="metrics")
    metric_key = models.CharField(max_length=30)
    value = models.FloatField()
    unit = models.CharField(max_length=10, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["device", "metric_key", "created_at"])]
        verbose_name = "设备指标"
        verbose_name_plural = "设备指标"


# ----------------------------------------------------------------- 告警
class Alarm(models.Model):
    LEVEL_CHOICES = [("warn", "警告"), ("critical", "紧急")]
    STATUS_CHOICES = [("active", "未处理"), ("acked", "已确认"), ("closed", "已关闭")]

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="alarms")
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active", db_index=True)
    code = models.CharField(max_length=30, help_text="告警类型码，如 TEMP_HIGH")
    content = models.CharField(max_length=300)
    trigger_value = models.FloatField(null=True)
    threshold = models.FloatField(null=True)

    ack_by = models.CharField(max_length=50, blank=True)
    ack_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "告警"
        verbose_name_plural = "告警"

    def __str__(self):
        return f"[{self.level}] {self.device.code} {self.content}"


class AlarmRule(models.Model):
    """阈值规则，可在配置页维护（配置化，不改代码）"""

    device_type = models.CharField(max_length=30)
    metric_key = models.CharField(max_length=30)
    operator = models.CharField(max_length=5, choices=[(">", ">"), ("<", "<")], default=">")
    threshold = models.FloatField()
    level = models.CharField(max_length=10, choices=Alarm.LEVEL_CHOICES, default="warn")
    enabled = models.BooleanField(default=True)

    class Meta:
        verbose_name = "告警规则"
        verbose_name_plural = "告警规则"

    def hit(self, value):
        return value > self.threshold if self.operator == ">" else value < self.threshold


# ----------------------------------------------------------------- 工单
class WorkOrder(models.Model):
    STATUS_CHOICES = [
        ("pending", "待处理"),
        ("assigned", "已指派"),
        ("processing", "处理中"),
        ("closed", "已闭环"),
    ]
    ORDER_TYPE = [("fault", "故障处理"), ("inspection", "巡检异常"), ("maintain", "计划保养")]
    PRIORITY = [("low", "低"), ("mid", "中"), ("high", "高")]

    order_no = models.CharField(max_length=30, unique=True)
    title = models.CharField(max_length=120)
    order_type = models.CharField(max_length=15, choices=ORDER_TYPE, default="fault")
    device = models.ForeignKey(Device, null=True, blank=True, on_delete=models.SET_NULL)
    alarm = models.OneToOneField(Alarm, null=True, blank=True, on_delete=models.SET_NULL)

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="pending", db_index=True)
    assignee = models.CharField(max_length=50, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY, default="mid")
    content = models.TextField(blank=True)
    result = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # 状态机：非法流转在 serializer/service 层拒绝，返回 400
    FLOW = {
        "pending": ["assigned", "processing"],
        "assigned": ["processing"],
        "processing": ["closed"],
        "closed": [],
    }

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "工单"
        verbose_name_plural = "工单"

    def can_transition(self, to_status):
        return to_status in self.FLOW.get(self.status, [])

    def __str__(self):
        return f"{self.order_no} {self.title}"


# ----------------------------------------------------------------- 巡检
class InspectionPoint(models.Model):
    """巡检点位：三维打点的结果"""

    name = models.CharField(max_length=80)
    device = models.ForeignKey(Device, null=True, blank=True, on_delete=models.SET_NULL)
    position_x = models.FloatField()
    position_y = models.FloatField(default=0)
    position_z = models.FloatField()
    check_items = models.JSONField(default=list, help_text='["温度正常","无异响","无漏液"]')

    class Meta:
        ordering = ["id"]
        verbose_name = "巡检点位"
        verbose_name_plural = "巡检点位"

    def __str__(self):
        return self.name


class InspectionRoute(models.Model):
    """巡检路线：点位有序集合"""

    name = models.CharField(max_length=80)
    points = models.ManyToManyField(InspectionPoint, through="RoutePoint", related_name="routes")
    loop = models.BooleanField(default=True, help_text="是否循环巡检")

    class Meta:
        ordering = ["id"]
        verbose_name = "巡检路线"
        verbose_name_plural = "巡检路线"

    def __str__(self):
        return self.name


class RoutePoint(models.Model):
    route = models.ForeignKey(InspectionRoute, on_delete=models.CASCADE)
    point = models.ForeignKey(InspectionPoint, on_delete=models.CASCADE)
    order = models.IntegerField()

    class Meta:
        ordering = ["order"]
        unique_together = [("route", "point")]


class InspectionPlan(models.Model):
    CYCLE = [("daily", "每日"), ("weekly", "每周"), ("custom", "自定义")]

    name = models.CharField(max_length=80)
    route = models.ForeignKey(InspectionRoute, on_delete=models.CASCADE, related_name="plans")
    cycle = models.CharField(max_length=20, choices=CYCLE, default="daily")
    cron = models.CharField(max_length=50, blank=True, help_text="custom 时使用，如 0 8 * * 1")
    assignee = models.CharField(max_length=50, blank=True)
    enabled = models.BooleanField(default=True)

    class Meta:
        verbose_name = "巡检计划"
        verbose_name_plural = "巡检计划"

    def __str__(self):
        return self.name


class InspectionTask(models.Model):
    STATUS = [("pending", "待执行"), ("doing", "执行中"), ("done", "已完成"), ("abnormal", "有异常")]

    plan = models.ForeignKey(InspectionPlan, null=True, blank=True, on_delete=models.SET_NULL)
    route = models.ForeignKey(InspectionRoute, on_delete=models.CASCADE, related_name="tasks")
    status = models.CharField(max_length=10, choices=STATUS, default="pending")
    executor = models.CharField(max_length=50, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "巡检任务"
        verbose_name_plural = "巡检任务"


class InspectionRecord(models.Model):
    task = models.ForeignKey(InspectionTask, on_delete=models.CASCADE, related_name="records")
    point = models.ForeignKey(InspectionPoint, on_delete=models.CASCADE)
    is_abnormal = models.BooleanField(default=False)
    result = models.JSONField(default=dict)
    remark = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "巡检记录"
        verbose_name_plural = "巡检记录"


# ----------------------------------------------------------------- 维护 / 能耗
class MaintenanceRecord(models.Model):
    MTYPE = [("care", "保养"), ("repair", "维修"), ("replace", "更换")]

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="maintains")
    mtype = models.CharField(max_length=15, choices=MTYPE, default="care")
    operator = models.CharField(max_length=50)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    content = models.TextField(blank=True)
    attachment = models.FileField(upload_to="maintain/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "维护记录"
        verbose_name_plural = "维护记录"


class EnergyRecord(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="energy")
    kwh = models.FloatField()
    recorded_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-recorded_at"]
        verbose_name = "能耗记录"
        verbose_name_plural = "能耗记录"


# ----------------------------------------------------------------- 场景 / 审计
class SceneConfig(models.Model):
    """全局场景配置（单例）"""

    model_file = models.FileField(upload_to="scene/", blank=True, null=True)
    status_colors = models.JSONField(default=dict)
    layer_visible = models.JSONField(default=dict)
    camera_presets = models.JSONField(default=list)
    bg_color = models.CharField(max_length=20, default="#080A0F")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "场景配置"
        verbose_name_plural = "场景配置"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                "status_colors": {"normal": "#3FB950", "offline": "#8B949E", "fault": "#F85149", "stop": "#D29922"},
                "layer_visible": {"building": True, "device": True, "label": True, "effect": True, "helper": False},
                "camera_presets": [
                    {"name": "overview", "label": "总览", "camPos": [52, 56, 76], "target": [0, 0, 0]},
                    {"name": "line_A1", "label": "产线 A1", "camPos": [-42, 9.5, -20], "target": [12, 1, -20]},
                    {"name": "line_B1", "label": "产线 B1", "camPos": [-42, 9.5, -4], "target": [12, 1, -4]},
                    {"name": "line_C1", "label": "产线 C1", "camPos": [-42, 9.5, 12], "target": [12, 1, 12]},
                    {"name": "top", "label": "俯视", "camPos": [0, 82, 0.6], "target": [0, 0, 0]},
                ],
            },
        )
        return obj


class SceneSnapshot(models.Model):
    name = models.CharField(max_length=60, unique=True)
    camera_position = models.JSONField()
    camera_target = models.JSONField()
    layer_visible = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "场景快照"
        verbose_name_plural = "场景快照"


class OperationLog(models.Model):
    operator = models.CharField(max_length=50)
    action = models.CharField(max_length=50)
    target = models.CharField(max_length=100)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "操作日志"
        verbose_name_plural = "操作日志"


class DeviceProfile(models.Model):
    """扩展 auth.User：角色与展示名（避免污染 User 表）"""

    ROLES = [("guest", "访客"), ("operator", "运维人员"), ("admin", "管理员")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLES, default="operator")
    display_name = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return f"{self.user.username}:{self.role}"
