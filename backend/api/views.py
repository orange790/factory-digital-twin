"""
REST 接口（对应 PRD §8.2）
--------------------------------------------------------------
· 角色权限在后端强制校验（不依赖前端隐藏按钮）
· 关键操作统一写 OperationLog
"""
import csv
import io
from datetime import timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
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
    InspectionRoute,
    InspectionTask,
    MaintenanceRecord,
    OperationLog,
    ProductionLine,
    SceneConfig,
    SceneSnapshot,
    WorkOrder,
)
from .permissions import IsAdmin, IsOperatorOrAdmin, ReadOnlyOrAdmin, role_of
from .serializers import (
    AlarmRuleSerializer,
    AlarmSerializer,
    DeviceMetricSerializer,
    DeviceSerializer,
    DeviceStatusLogSerializer,
    EnergyRecordSerializer,
    InspectionPlanSerializer,
    InspectionPointSerializer,
    InspectionRouteSerializer,
    InspectionRouteWriteSerializer,
    InspectionTaskSerializer,
    LineSerializer,
    MaintenanceRecordSerializer,
    OperationLogSerializer,
    SceneConfigSerializer,
    SceneSnapshotSerializer,
    WorkOrderSerializer,
    AreaSerializer,
)


# ----------------------------------------------------------------- 认证
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(username=username, password=password)
        if not user:
            return Response(
                {"code": "AUTH_FAILED", "message": "账号或密码错误", "detail": {}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        token, _ = Token.objects.get_or_create(user=user)
        services.log_op(user, "LOGIN", "session", None, {"role": role_of(user)}, request)
        return Response({"access": token.key, "username": user.username, "role": role_of(user)})


class DemoLoginView(APIView):
    """一键演示账号：面试官免注册进入只读模式（PRD F-UI-12）"""

    permission_classes = [AllowAny]

    def post(self, request):
        user, _ = User.objects.get_or_create(username="demo", defaults={"is_active": True})
        DeviceProfile.objects.get_or_create(user=user, defaults={"role": "guest", "display_name": "访客演示"})
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"access": token.key, "username": "demo", "role": role_of(user)})


class MeView(APIView):
    def get(self, request):
        return Response({"username": request.user.username, "role": role_of(request.user)})


# ----------------------------------------------------------------- 概览
class OverviewStatsView(APIView):
    def get(self, request):
        devices = Device.objects.all()
        total = devices.count()
        online = devices.exclude(status="offline").count()
        by_status = list(devices.values("status").annotate(count=Count("id")))
        by_type = list(devices.values("device_type").annotate(count=Count("id")))
        overdue = sum(1 for d in devices.only("last_maintain_date", "maintain_cycle_days") if d.overdue_days > 0)
        return Response(
            {
                "total": total,
                "online": online,
                "offline": total - online,
                "online_rate": round(online / total * 100, 1) if total else 0,
                "fault": devices.filter(status="fault").count(),
                "stop": devices.filter(status="stop").count(),
                "active_alarms": Alarm.objects.filter(status="active").count(),
                "pending_orders": WorkOrder.objects.exclude(status="closed").count(),
                "overdue_maintain": overdue,
                "by_status": by_status,
                "by_type": by_type,
            }
        )


class AlarmTrendView(APIView):
    def get(self, request):
        rng = request.query_params.get("range", "24h")
        now = timezone.now()
        if rng == "30d":
            buckets, step, label = 30, timedelta(days=1), "day"
        elif rng == "7d":
            buckets, step, label = 7, timedelta(days=1), "day"
        else:
            buckets, step, label = 24, timedelta(hours=1), "hour"

        out = []
        for i in range(buckets - 1, -1, -1):
            end = now - i * step
            start = end - step
            qs = Alarm.objects.filter(created_at__gte=start, created_at__lt=end)
            local_end = timezone.localtime(end)
            out.append(
                {
                    "label": local_end.strftime("%m/%d") if label == "day" else local_end.strftime("%H:00"),
                    "warn": qs.filter(level="warn").count(),
                    "critical": qs.filter(level="critical").count(),
                }
            )
        return Response(out)


# ----------------------------------------------------------------- 设备
class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.select_related("area", "line").all()
    serializer_class = DeviceSerializer
    permission_classes = [ReadOnlyOrAdmin]
    search_fields = ["code", "name"]
    ordering_fields = ["code", "created_at", "status"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("area_code"):
            qs = qs.filter(area__code=p["area_code"])
        if p.get("line_id"):
            qs = qs.filter(line_id=p["line_id"])
        if p.get("device_type"):
            qs = qs.filter(device_type=p["device_type"])
        if p.get("is_critical"):
            qs = qs.filter(is_critical=True)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        services.log_op(self.request.user, "DEVICE_CREATE", f"Device#{obj.code}", None, {"code": obj.code}, self.request)

    def perform_update(self, serializer):
        before = {"code": serializer.instance.code, "status": serializer.instance.status}
        obj = serializer.save()
        services.log_op(self.request.user, "DEVICE_UPDATE", f"Device#{obj.code}", before, {"code": obj.code}, self.request)

    def perform_destroy(self, instance):
        services.log_op(self.request.user, "DEVICE_DELETE", f"Device#{instance.code}", {"code": instance.code}, None, self.request)
        instance.delete()

    @action(detail=False, methods=["get"])
    def tree(self, request):
        """区域 → 产线 → 设备 三级树（前端与三维双向联动）"""
        data = []
        for area in FactoryArea.objects.prefetch_related("lines__devices", "devices").all():
            lines = []
            for line in area.lines.all():
                lines.append(
                    {
                        **LineSerializer(line).data,
                        "devices": [
                            {"id": d.id, "code": d.code, "name": d.name, "status": d.status,
                             "device_type": d.device_type, "is_critical": d.is_critical}
                            for d in line.devices.all()
                        ],
                    }
                )
            data.append(
                {
                    "id": area.id,
                    "name": area.name,
                    "code": area.code,
                    "lines": lines,
                    "devices": [
                        {"id": d.id, "code": d.code, "name": d.name, "status": d.status,
                         "device_type": d.device_type}
                        for d in area.devices.filter(line__isnull=True)
                    ],
                }
            )
        return Response(data)

    @action(detail=False, methods=["get"], url_path="status")
    def status_map(self, request):
        """轮询兜底接口：只回 code + status，体积最小"""
        return Response(list(Device.objects.values("id", "code", "status")))

    @action(detail=False, methods=["get"], url_path="status-logs")
    def status_logs(self, request):
        qs = DeviceStatusLog.objects.select_related("device").all()[:2000]
        return Response(DeviceStatusLogSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="live")
    def live(self, request):
        """轻量实时快照：设备最新指标 + 计数，供前端 3s 轮询兜底（无 MQTT 时）"""
        since = timezone.now() - timedelta(minutes=30)
        rows = (
            DeviceMetric.objects.filter(created_at__gte=since)
            .values("device__code", "metric_key", "value")
            .order_by("-created_at")
        )
        latest, seen = {}, set()
        for r in rows:
            k = (r["device__code"], r["metric_key"])
            if k in seen:
                continue
            seen.add(k)
            latest.setdefault(r["device__code"], {})[r["metric_key"]] = round(r["value"], 2)

        items = [
            {"code": d.code, "status": d.status, **latest.get(d.code, {})}
            for d in Device.objects.all().only("code", "status")
        ]
        return Response(
            {
                "items": items,
                "counters": {
                    "total": len(items),
                    "online": sum(1 for i in items if i["status"] != "offline"),
                    "fault": sum(1 for i in items if i["status"] == "fault"),
                    "stop": sum(1 for i in items if i["status"] == "stop"),
                    "active_alarms": Alarm.objects.filter(status="active").count(),
                    "pending_orders": WorkOrder.objects.filter(status="pending").count(),
                },
                "ts": int(timezone.now().timestamp() * 1000),
            }
        )

    @action(detail=True, methods=["get"])
    def metrics(self, request, pk=None):
        device = self.get_object()
        key = request.query_params.get("key", "temperature")
        rng = request.query_params.get("range", "1h")
        span = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}.get(rng, 1)
        since = timezone.now() - timedelta(hours=span)
        qs = device.metrics.filter(metric_key=key, created_at__gte=since).order_by("created_at")
        history = [{"t": int(m.created_at.timestamp() * 1000), "value": m.value} for m in qs]
        return Response({"key": key, "history": history})

    @action(detail=True, methods=["post"])
    def command(self, request, pk=None):
        """指令下发：start / stop / reset（走 MQTT，同时落库与审计）"""
        device = self.get_object()
        cmd = request.data.get("cmd")
        if cmd not in ("start", "stop", "reset"):
            return Response({"code": "BAD_CMD", "message": "非法指令"}, status=400)
        target = {"start": "normal", "stop": "stop", "reset": "normal"}[cmd]
        services.change_device_status(device, target, f"平台下发指令 {cmd}")
        services.log_op(request.user, "DEVICE_COMMAND", f"Device#{device.code}", None, {"cmd": cmd}, request)
        published = False
        try:  # Broker 不通不影响主流程（可用性优先）
            from .mqtt import publish_command

            published = publish_command(device.code, cmd, request.user.username)
        except Exception:  # noqa: BLE001
            published = False
        return Response({"ok": True, "code": device.code, "status": target, "published": published})


class MaintenanceViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRecord.objects.select_related("device").all()
    serializer_class = MaintenanceRecordSerializer
    permission_classes = [IsOperatorOrAdmin]
    filterset_fields = ["device"]

    def get_queryset(self):
        qs = super().get_queryset()
        device = self.request.query_params.get("device")
        return qs.filter(device_id=device) if device else qs

    def perform_create(self, serializer):
        rec = serializer.save()
        if rec.device:
            rec.device.last_maintain_date = timezone.localdate()
            rec.device.save(update_fields=["last_maintain_date"])
        services.log_op(self.request.user, "MAINTAIN_ADD", f"Device#{rec.device.code}", None, {"mtype": rec.mtype}, self.request)


# ----------------------------------------------------------------- 告警
class AlarmViewSet(viewsets.ModelViewSet):
    queryset = Alarm.objects.select_related("device__area").all()
    serializer_class = AlarmSerializer
    permission_classes = [ReadOnlyOrAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        for key in ("level", "status", "code"):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        if p.get("device_code"):
            qs = qs.filter(device__code=p["device_code"])
        if p.get("area_code"):
            qs = qs.filter(device__area__code=p["area_code"])
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsOperatorOrAdmin])
    def ack(self, request, pk=None):
        alarm = self.get_object()
        if alarm.status != "active":
            return Response({"code": "INVALID_STATE", "message": "仅未处理告警可确认"}, status=400)
        alarm.status = "acked"
        alarm.ack_by = request.user.username
        alarm.ack_at = timezone.now()
        alarm.save()
        services.log_op(request.user, "ALARM_ACK", f"Alarm#{alarm.id}", {"status": "active"}, {"status": "acked"}, request)
        return Response(AlarmSerializer(alarm).data)

    @action(detail=True, methods=["post"], permission_classes=[IsOperatorOrAdmin])
    def close(self, request, pk=None):
        alarm = self.get_object()
        alarm.status = "closed"
        alarm.closed_at = timezone.now()
        if not alarm.ack_by:
            alarm.ack_by = request.user.username
            alarm.ack_at = alarm.closed_at
        alarm.save()
        if alarm.device.status == "fault":
            services.change_device_status(alarm.device, "normal", "告警关闭自动恢复")
        services.log_op(request.user, "ALARM_CLOSE", f"Alarm#{alarm.id}", {"status": "acked"}, {"status": "closed"}, request)
        return Response(AlarmSerializer(alarm).data)

    @action(detail=False, methods=["post"], url_path="batch_ack", permission_classes=[IsOperatorOrAdmin])
    def batch_ack(self, request):
        ids = request.data.get("ids", [])
        qs = Alarm.objects.filter(id__in=ids, status="active")
        now = timezone.now()
        qs.update(status="acked", ack_by=request.user.username, ack_at=now)
        services.log_op(request.user, "ALARM_BATCH_ACK", f"Alarm#{len(ids)}", None, {"count": qs.count()}, request)
        return Response({"ok": True, "count": qs.count()})


class AlarmRuleViewSet(viewsets.ModelViewSet):
    queryset = AlarmRule.objects.all()
    serializer_class = AlarmRuleSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        device_type = self.request.query_params.get("device_type")
        return qs.filter(device_type=device_type) if device_type else qs


# ----------------------------------------------------------------- 工单
class WorkOrderViewSet(viewsets.ModelViewSet):
    queryset = WorkOrder.objects.select_related("device", "alarm").all()
    serializer_class = WorkOrderSerializer
    permission_classes = [IsOperatorOrAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        for key in ("status", "order_type", "priority"):
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        if p.get("device_code"):
            qs = qs.filter(device__code=p["device_code"])
        return qs

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [IsOperatorOrAdmin()]

    def perform_create(self, serializer):
        order = serializer.save(order_no=services.next_order_no())
        if order.alarm and order.alarm.status == "active":
            order.alarm.status = "acked"
            order.alarm.ack_by = self.request.user.username
            order.alarm.ack_at = timezone.now()
            order.alarm.save()
        services.log_op(self.request.user, "WORKORDER_CREATE", f"WorkOrder#{order.order_no}", None, {"status": "pending"}, self.request)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        order = self.get_object()
        to_status = request.data.get("to_status") or request.data.get("to")
        try:
            services.transition_work_order(
                order, to_status, request.user,
                assignee=request.data.get("assignee"),
                result=request.data.get("result"),
            )
        except ValueError as exc:
            return Response({"code": "INVALID_TRANSITION", "message": str(exc)}, status=400)
        return Response(WorkOrderSerializer(order).data)


# ----------------------------------------------------------------- 巡检
class InspectionPointViewSet(viewsets.ModelViewSet):
    queryset = InspectionPoint.objects.select_related("device").all()
    serializer_class = InspectionPointSerializer
    permission_classes = [IsOperatorOrAdmin]


class InspectionRouteViewSet(viewsets.ModelViewSet):
    queryset = InspectionRoute.objects.all()
    permission_classes = [IsOperatorOrAdmin]

    def get_serializer_class(self):
        return InspectionRouteWriteSerializer if self.request.method in ("POST", "PUT", "PATCH") else InspectionRouteSerializer

    def list(self, request, *args, **kwargs):
        return Response(InspectionRouteSerializer(self.get_queryset(), many=True).data)


class InspectionPlanViewSet(viewsets.ModelViewSet):
    queryset = InspectionPlan.objects.select_related("route").all()
    serializer_class = InspectionPlanSerializer
    permission_classes = [IsOperatorOrAdmin]


class InspectionTaskViewSet(viewsets.ModelViewSet):
    queryset = InspectionTask.objects.select_related("route", "plan").all()
    serializer_class = InspectionTaskSerializer
    permission_classes = [IsOperatorOrAdmin]

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        task = self.get_object()
        items = request.data.get("items", [])
        if not items:
            return Response({"code": "EMPTY", "message": "没有巡检记录"}, status=400)
        # 校验点位必须属于该任务路线，避免外键异常直接 500
        valid_ids = set(task.route.points.values_list("id", flat=True)) if task.route_id else set(
            InspectionPoint.objects.values_list("id", flat=True)
        )
        bad = [i.get("point_id") for i in items if i.get("point_id") not in valid_ids]
        if bad:
            return Response(
                {"code": "INVALID_POINT", "message": f"点位不属于该巡检路线：{bad[:5]}"}, status=400
            )
        task, abnormal = services.submit_inspection(task, items, request.user, request.data.get("executor", ""))
        data = InspectionTaskSerializer(task).data
        data["abnormal"] = abnormal
        return Response(data)


# ----------------------------------------------------------------- 能耗 / 报表
class EnergySummaryView(APIView):
    def get(self, request):
        group = request.query_params.get("group", "line")
        rng = request.query_params.get("range", "7d")
        days = {"24h": 1, "7d": 7, "30d": 30}.get(rng, 7)
        since = timezone.now() - timedelta(days=days)
        qs = EnergyRecord.objects.filter(recorded_at__gte=since).select_related("device__line", "device__area")

        def key_of(rec):
            d = rec.device
            if group == "area":
                return d.area.code
            if group == "device":
                return d.code
            return d.line.code if d.line else "其他"

        agg = {}
        for rec in qs:
            k = key_of(rec)
            agg[k] = agg.get(k, 0) + rec.kwh
        groups = [{"name": k, "total": round(v, 1)} for k, v in sorted(agg.items(), key=lambda x: -x[1])]
        return Response({"groups": groups, "total": round(sum(agg.values()), 1)})


class AlarmReportView(APIView):
    def get(self, request):
        rng = request.query_params.get("range", "7d")
        days = {"24h": 1, "7d": 7, "30d": 30}.get(rng, 7)
        since = timezone.now() - timedelta(days=days)
        qs = Alarm.objects.filter(created_at__gte=since).select_related("device")
        total = qs.count()
        closed = qs.filter(status="closed", closed_at__isnull=False)
        avg = 0
        if closed.exists():
            deltas = [(a.closed_at - a.created_at).total_seconds() / 60 for a in closed]
            avg = round(sum(deltas) / len(deltas), 1)
        by_device = list(
            qs.values("device__code", "device__name").annotate(
                total=Count("id"),
                critical=Count("id", filter=Q(level="critical")),
                warn=Count("id", filter=Q(level="warn")),
            ).order_by("-total")[:15]
        )
        devices = Device.objects.count()
        availability = round(Device.objects.exclude(status="offline").count() / devices * 100, 2) if devices else 0
        return Response(
            {
                "range": rng,
                "total": total,
                "critical": qs.filter(level="critical").count(),
                "warn": qs.filter(level="warn").count(),
                "avg_close_minutes": avg,
                "availability": availability,
                "by_device": [
                    {"device_code": r["device__code"], "device_name": r["device__name"],
                     "total": r["total"], "critical": r["critical"], "warn": r["warn"]}
                    for r in by_device
                ],
                "rows": AlarmSerializer(qs[:500], many=True).data,
            }
        )


class AlarmExportView(APIView):
    """CSV 导出（带 BOM，Excel 直接打开不乱码）"""

    def get(self, request):
        rng = request.query_params.get("range", "7d")
        days = {"24h": 1, "7d": 7, "30d": 30}.get(rng, 7)
        qs = Alarm.objects.filter(created_at__gte=timezone.now() - timedelta(days=days)).select_related("device")[:5000]
        buf = io.StringIO()
        buf.write("\ufeff")
        writer = csv.writer(buf)
        writer.writerow(["时间", "设备编码", "设备名称", "等级", "类型码", "内容", "状态", "处理人"])
        for a in qs:
            writer.writerow([a.created_at.strftime("%Y-%m-%d %H:%M"), a.device.code, a.device.name,
                             a.get_level_display(), a.code, a.content, a.get_status_display(), a.ack_by])
        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="alarm_report_{rng}.csv"'
        return resp


# ----------------------------------------------------------------- 场景 / 日志
class SceneConfigView(APIView):
    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "GET" else [IsAdmin()]

    def get(self, request):
        cfg = SceneConfig.load()
        return Response(SceneConfigSerializer(cfg).data)

    def put(self, request):
        cfg = SceneConfig.load()
        before = {"bg_color": cfg.bg_color, "status_colors": cfg.status_colors}
        serializer = SceneConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        services.log_op(request.user, "SCENE_CONFIG_UPDATE", "SceneConfig", before, request.data, request)
        return Response(serializer.data)


class SceneSnapshotViewSet(viewsets.ModelViewSet):
    queryset = SceneSnapshot.objects.all()
    serializer_class = SceneSnapshotSerializer
    permission_classes = [IsAuthenticated]


class OperationLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OperationLog.objects.all()
    serializer_class = OperationLogSerializer
    permission_classes = [IsAdmin]


class LineViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProductionLine.objects.select_related("area").all()
    serializer_class = LineSerializer
    permission_classes = [IsAuthenticated]


class AreaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FactoryArea.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = AreaSerializer
