"""
业务服务层
--------------------------------------------------------------
把"改状态 / 生告警 / 关工单"这类跨模型的动作收在一处，
保证 HTTP 接口、MQTT 订阅进程、模拟器脚本走的是同一套事务逻辑。
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import (
    Alarm,
    AlarmRule,
    Device,
    DeviceStatusLog,
    InspectionRecord,
    InspectionTask,
    OperationLog,
    WorkOrder,
)


def client_ip(request):
    if not request:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


def log_op(operator, action, target, before=None, after=None, request=None):
    OperationLog.objects.create(
        operator=getattr(operator, "username", str(operator or "system")),
        action=action,
        target=target,
        before=before,
        after=after,
        ip=client_ip(request),
    )


@transaction.atomic
def change_device_status(device: Device, to_status: str, reason: str = "") -> Device:
    """状态变更 + 写流水（三维状态回放的数据源）"""
    if device.status == to_status:
        return device
    from_status = device.status
    device.status = to_status
    device.save(update_fields=["status", "updated_at"])
    DeviceStatusLog.objects.create(
        device=device, from_status=from_status, to_status=to_status, reason=reason
    )
    return device


ALARM_CODE_BY_METRIC = {
    "temperature": "TEMP_HIGH",
    "vibration": "VIB_HIGH",
    "current": "CURRENT_HIGH",
    "battery": "BATTERY_LOW",
}


@transaction.atomic
def raise_alarm(device, metric_key, value, threshold, level, content=None):
    """
    生成告警，并做 5 分钟同设备同类型去重（PRD F-BE-04）
    返回 (alarm, created)
    """
    code = ALARM_CODE_BY_METRIC.get(metric_key, "THRESHOLD")
    since = timezone.now() - timedelta(minutes=5)
    dup = (
        Alarm.objects.filter(
            device=device, code=code, status__in=["active", "acked"], created_at__gte=since
        )
        .order_by("-created_at")
        .first()
    )
    if dup:
        dup.trigger_value = value
        dup.save(update_fields=["trigger_value"])
        return dup, False

    alarm = Alarm.objects.create(
        device=device,
        level=level,
        code=code,
        content=content or f"{device.name} {metric_key} 异常（{value}）",
        trigger_value=value,
        threshold=threshold,
    )
    return alarm, True


def evaluate_rules(device: Device, metrics: dict):
    """
    按 AlarmRule 判定指标；命中则生成告警并把设备置为 fault。
    metrics: {"temperature": 68.4, ...}（取最新一条）
    """
    if device.status in ("fault", "stop"):
        return None
    rules = AlarmRule.objects.filter(device_type=device.device_type, enabled=True)
    for rule in rules:
        value = metrics.get(rule.metric_key)
        if value is None:
            continue
        if rule.hit(value):
            unit = {"temperature": "°C", "vibration": "mm/s", "current": "A", "battery": "%"}.get(
                rule.metric_key, ""
            )
            content = f"{device.name} {rule.metric_key} {value}{unit} 超阈值 {rule.threshold}{unit}"
            alarm, created = raise_alarm(
                device, rule.metric_key, value, rule.threshold, rule.level, content
            )
            change_device_status(device, "fault", content)
            return alarm
    return None


@transaction.atomic
def transition_work_order(order: WorkOrder, to_status: str, operator, **extra):
    """工单状态机：非法流转抛 ValueError（视图层转 400）"""
    if not order.can_transition(to_status):
        raise ValueError(f"非法流转：{order.status} → {to_status}")

    from_status = order.status
    order.status = to_status
    if extra.get("assignee") is not None:
        order.assignee = extra["assignee"]
    if extra.get("result") is not None:
        order.result = extra["result"]
    order.save()

    if to_status == "closed":
        order.closed_at = timezone.now()
        order.save(update_fields=["closed_at"])
        # 关闭工单 → 自动关闭关联告警 → 设备恢复 normal
        qs = Alarm.objects.filter(device=order.device).exclude(status="closed") if order.device else None
        if order.alarm and order.alarm.status != "closed":
            order.alarm.status = "closed"
            order.alarm.closed_at = order.closed_at
            if not order.alarm.ack_by:
                order.alarm.ack_by = getattr(operator, "username", "system")
            order.alarm.save()
        if qs:
            qs.update(status="closed", closed_at=order.closed_at)
        if order.device and order.device.status == "fault":
            change_device_status(order.device, "normal", f"工单 {order.order_no} 闭环")

    log_op(
        operator,
        "WORKORDER_TRANSITION",
        f"WorkOrder#{order.order_no}",
        {"status": from_status},
        {"status": to_status},
    )
    return order


@transaction.atomic
def submit_inspection(task: InspectionTask, items, operator, executor=""):
    """
    提交巡检结果：写记录，异常项自动生成工单（PRD F-BE-06）
    items: [{"point_id": 1, "is_abnormal": true, "result": {...}, "remark": "..."}]
    """
    abnormal = 0
    for item in items:
        record = InspectionRecord.objects.create(
            task=task,
            point_id=item["point_id"],
            is_abnormal=bool(item.get("is_abnormal")),
            result=item.get("result") or {},
            remark=item.get("remark", ""),
        )
        if record.is_abnormal:
            abnormal += 1
            point = record.point
            WorkOrder.objects.create(
                order_no=next_order_no(),
                title=f"巡检异常：{point.name} {record.remark}"[:120],
                order_type="inspection",
                device=point.device,
                priority="mid",
                content=record.remark,
            )

    task.status = "abnormal" if abnormal else "done"
    task.executor = executor or getattr(operator, "username", "")
    task.started_at = task.started_at or timezone.now()
    task.finished_at = timezone.now()
    task.save()
    log_op(operator, "INSPECTION_SUBMIT", f"Task#{task.id}", None, {"status": task.status, "abnormal": abnormal})
    return task, abnormal


def next_order_no():
    today = timezone.localdate().strftime("%Y%m%d")
    prefix = f"WO{today}"
    last = WorkOrder.objects.filter(order_no__startswith=prefix).order_by("-order_no").first()
    seq = int(last.order_no[-3:]) + 1 if last else 1
    return f"{prefix}{seq:03d}"
