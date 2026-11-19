"""
python manage.py seed_demo
--------------------------------------------------------------
一键生成演示数据：3 车间 / 6 产线 / 200 台设备 / 告警规则 / 巡检路线 / 工单
坐标规则与前端三维一致：产线 z 固定，工位沿 x 每 5m 一个。
"""
import random
from contextlib import contextmanager
from datetime import date, datetime, timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
    Alarm,
    AlarmRule,
    Device,
    DeviceProfile,
    DeviceMetric,
    DeviceStatusLog,
    EnergyRecord,
    FactoryArea,
    InspectionPlan,
    InspectionPoint,
    InspectionRoute,
    InspectionTask,
    MaintenanceRecord,
    ProductionLine,
    RoutePoint,
    SceneConfig,
    WorkOrder,
)

AREAS = [
    ("A", "机加工车间", 1),
    ("B", "装配车间", 2),
    ("C", "检测包装车间", 3),
]

LINES = [
    ("A1", "机加工一线", "A", -20, 480),
    ("A2", "机加工二线", "A", -12, 460),
    ("B1", "装配一线", "B", -4, 320),
    ("B2", "装配二线", "B", 4, 300),
    ("C1", "检测一线", "C", 12, 560),
    ("C2", "检测二线", "C", 20, 540),
]

MACHINE_KINDS = [
    ("CNC加工中心", 22, 58),
    ("数控冲床", 18, 54),
    ("注塑成型机", 30, 62),
]

STATIONS = 12
X0 = -32
PITCH = 5
ROBOT_STATIONS = [1, 4, 7, 10]
GAUGE_STATIONS = [0, 3, 6, 9]

RULES = [
    ("machine", "temperature", ">", 68, "critical"),
    ("machine", "temperature", ">", 64, "warn"),
    ("machine", "current", ">", 15, "warn"),
    ("robot", "temperature", ">", 60, "warn"),
    ("robot", "current", ">", 11, "warn"),
    ("sensor", "vibration", ">", 8, "warn"),
    ("sensor", "temperature", ">", 70, "critical"),
    ("gauge", "temperature", ">", 55, "warn"),
    ("agv", "battery", "<", 15, "warn"),
]


@contextmanager
def keep_time(model, field="created_at"):
    """临时关闭 auto_now_add，使 bulk_create 能写入指定的历史时间。"""
    f = model._meta.get_field(field)
    old = f.auto_now_add
    f.auto_now_add = False
    try:
        yield
    finally:
        f.auto_now_add = old


class Command(BaseCommand):
    help = "生成演示数据（幂等：会先清空业务表）"

    def add_arguments(self, parser):
        parser.add_argument("--devices", type=int, default=200, help="设备总数目标（默认 200）")

    def handle(self, *args, **options):
        random.seed(20261119)
        self._flush()
        areas = self._areas()
        lines = self._lines(areas)
        self._users()
        self._rules()
        devices = self._devices(areas, lines)
        self._maintains(devices)
        points, routes = self._inspection(devices)
        self._plans_tasks(routes)
        self._orders(devices)
        self._alarms(devices)
        self._energy(devices)
        self._metrics(devices)
        self._status_logs(devices)
        SceneConfig.load()
        self.stdout.write(
            self.style.SUCCESS(
                f"演示数据完成：{len(devices)} 台设备 / {Alarm.objects.count()} 条告警 / "
                f"{DeviceMetric.objects.count()} 条指标 / {DeviceStatusLog.objects.count()} 条状态流水 / "
                f"{EnergyRecord.objects.count()} 条能耗 / {WorkOrder.objects.count()} 个工单 / "
                f"{len(routes)} 条巡检路线"
            )
        )

    # ------------------------------------------------------------------
    def _flush(self):
        for model in (
            WorkOrder, Alarm, MaintenanceRecord, EnergyRecord, InspectionTask,
            InspectionPlan, RoutePoint, InspectionRoute, InspectionPoint, Device,
            AlarmRule, ProductionLine, FactoryArea,
        ):
            model.objects.all().delete()

    def _areas(self):
        out = {}
        for code, name, sort in AREAS:
            out[code] = FactoryArea.objects.create(code=code, name=name, sort=sort)
        return out

    def _lines(self, areas):
        out = {}
        for code, name, area_code, z, cap in LINES:
            out[code] = ProductionLine.objects.create(
                code=code, name=name, area=areas[area_code], pos_z=z, capacity_per_hour=cap
            )
        return out

    def _users(self):
        specs = [
            ("admin", "admin123", "admin", "管理员", True),
            ("operator", "operator123", "operator", "运维人员", False),
            ("demo", "demo", "guest", "访客演示", False),
        ]
        for username, password, role, display, is_super in specs:
            user, created = User.objects.get_or_create(username=username)
            if created:
                user.set_password(password)
                user.is_superuser = is_super
                user.is_staff = is_super
                user.save()
            DeviceProfile.objects.update_or_create(user=user, defaults={"role": role, "display_name": display})

    def _rules(self):
        for device_type, metric, op, threshold, level in RULES:
            AlarmRule.objects.create(
                device_type=device_type, metric_key=metric, operator=op, threshold=threshold, level=level
            )

    def _devices(self, areas, lines):
        devices = []
        seq = {"m": 0, "s": 0, "r": 0, "g": 0}
        today = date.today()

        for li, (line_code, _, area_code, z, _cap) in enumerate(LINES):
            line = lines[line_code]
            area = areas[area_code]
            for s in range(STATIONS):
                x = X0 + s * PITCH
                kind_name, rated, base_temp = MACHINE_KINDS[(li + s) % 3]
                seq["m"] += 1
                code = f"M{seq['m']:02d}"
                devices.append(
                    Device.objects.create(
                        code=code,
                        name=f"{kind_name}-{line_code}{s + 1:02d}",
                        device_type="machine",
                        area=area,
                        line=line,
                        status="normal",
                        is_critical=s in (0, 11),
                        glb_node_name=f"DEV_{code}",
                        position_x=x,
                        position_z=z,
                        camera_preset=f"line_{line_code}",
                        rated_power=rated,
                        install_date=today - timedelta(days=random.randint(120, 900)),
                        maintain_cycle_days=random.choice([30, 60, 90]),
                        last_maintain_date=today - timedelta(days=random.randint(0, 100)),
                    )
                )

                seq["s"] += 1
                scode = f"S{seq['s']:02d}"
                devices.append(
                    Device.objects.create(
                        code=scode,
                        name=f"温振传感器-{line_code}{s + 1:02d}",
                        device_type="sensor",
                        area=area,
                        line=line,
                        status="normal",
                        glb_node_name=f"DEV_{scode}",
                        position_x=x,
                        position_y=2.35,
                        position_z=z,
                        rated_power=0.5,
                        maintain_cycle_days=180,
                        last_maintain_date=today - timedelta(days=random.randint(0, 150)),
                    )
                )

                if s in ROBOT_STATIONS:
                    seq["r"] += 1
                    rcode = f"R{seq['r']:02d}"
                    devices.append(
                        Device.objects.create(
                            code=rcode,
                            name=f"六轴机械臂-{line_code}{s + 1:02d}",
                            device_type="robot",
                            area=area,
                            line=line,
                            status="normal",
                            glb_node_name=f"DEV_{rcode}",
                            position_x=x + 1.7,
                            position_z=z + 1.1,
                            rated_power=7.5,
                            maintain_cycle_days=90,
                            last_maintain_date=today - timedelta(days=random.randint(0, 90)),
                        )
                    )

                if s in GAUGE_STATIONS:
                    seq["g"] += 1
                    gcode = f"G{seq['g']:02d}"
                    devices.append(
                        Device.objects.create(
                            code=gcode,
                            name=f"视觉检测仪-{line_code}{s + 1:02d}",
                            device_type="gauge",
                            area=area,
                            line=line,
                            status="normal",
                            glb_node_name=f"DEV_{gcode}",
                            position_x=x - 1.5,
                            position_z=z - 1.4,
                            rated_power=1.2,
                            maintain_cycle_days=60,
                            last_maintain_date=today - timedelta(days=random.randint(0, 80)),
                        )
                    )

        # AGV
        for i in range(8):
            code = f"V{i + 1:02d}"
            area = areas["A" if i < 3 else "B" if i < 6 else "C"]
            devices.append(
                Device.objects.create(
                    code=code,
                    name=f"搬运AGV-{i + 1:02d}",
                    device_type="agv",
                    area=area,
                    status="normal",
                    glb_node_name=f"DEV_{code}",
                    position_x=-28 + i * 7,
                    position_z=-8 if i % 2 == 0 else 8,
                    rated_power=3,
                    maintain_cycle_days=45,
                )
            )

        # 初始少量故障/停机/离线
        for code in ("M07", "M31", "R05", "S44", "G12"):
            self._set(devices, code, "fault")
        for code in ("M18", "M52", "V03"):
            self._set(devices, code, "stop")
        for code in ("M63", "S09", "S58", "G21", "R17", "V06"):
            self._set(devices, code, "offline")
        return devices

    @staticmethod
    def _set(devices, code, status):
        for d in devices:
            if d.code == code:
                d.status = status
                d.save(update_fields=["status"])

    def _maintains(self, devices):
        by_code = {d.code: d for d in devices}
        rows = [
            ("M01", "care", "张伟", 320, "季度保养：导轨润滑、皮带张紧"),
            ("M07", "repair", "李强", 1860, "更换主轴轴承"),
            ("R05", "replace", "王芳", 4200, "更换 J2 轴减速机"),
        ]
        for code, mtype, operator, cost, content in rows:
            if code in by_code:
                MaintenanceRecord.objects.create(
                    device=by_code[code], mtype=mtype, operator=operator, cost=cost, content=content
                )

    def _inspection(self, devices):
        by_code = {d.code: d for d in devices}
        spec = [
            ("巡检点-A1-01", "M01", -32, -20),
            ("巡检点-A1-12", "M12", 23, -20),
            ("巡检点-A2-06", "M18", -7, -12),
            ("巡检点-B1-04", "M27", -17, -4),
            ("巡检点-C1-08", "M51", 3, 12),
            ("巡检点-C2-02", "M56", -27, 20),
        ]
        points = []
        for name, code, x, z in spec:
            points.append(
                InspectionPoint.objects.create(
                    name=name,
                    device=by_code.get(code),
                    position_x=x,
                    position_z=z,
                    check_items=["温度正常", "无异响", "无漏液", "安全防护到位"],
                )
            )
        r1 = InspectionRoute.objects.create(name="A 区日常巡检线", loop=True)
        r2 = InspectionRoute.objects.create(name="C 区夜班巡检线", loop=False)
        for i, p in enumerate(points[:4]):
            RoutePoint.objects.create(route=r1, point=p, order=i)
        for i, p in enumerate(points[4:]):
            RoutePoint.objects.create(route=r2, point=p, order=i)
        return points, [r1, r2]

    def _plans_tasks(self, routes):
        p1 = InspectionPlan.objects.create(name="机加工车间日常巡检", route=routes[0], cycle="daily", assignee="张伟")
        p2 = InspectionPlan.objects.create(name="检测车间夜班巡检", route=routes[1], cycle="daily", assignee="李强")
        InspectionTask.objects.create(plan=p1, route=routes[0], status="pending")
        InspectionTask.objects.create(plan=p2, route=routes[1], status="doing", executor="李强", started_at=timezone.now())

    def _orders(self, devices):
        by_code = {d.code: d for d in devices}
        rows = [
            ("M07", "processing", "fault", "M07 主轴温度持续超限", "high", 5),
            ("M31", "pending", "fault", "M31 加工尺寸偏差超标", "high", 2),
            ("R05", "assigned", "fault", "R05 关节异响排查", "mid", 8),
            ("S44", "pending", "fault", "S44 振动传感器数据跳变", "mid", 1),
            ("M18", "processing", "maintain", "M18 季度保养（润滑+紧固）", "low", 26),
            ("V03", "closed", "fault", "V03 电量异常下降", "mid", 52),
        ]
        for code, status, otype, title, priority, hours in rows:
            device = by_code.get(code)
            WorkOrder.objects.create(
                order_no=f"WO{timezone.localdate():%Y%m%d}{WorkOrder.objects.count() + 1:03d}",
                title=title,
                order_type=otype,
                device=device,
                status=status,
                assignee="" if status == "pending" else "张伟",
                priority=priority,
                content="按 SOP 处理并填写处理结果",
                result="已更换部件并复测" if status == "closed" else "",
                closed_at=timezone.now() if status == "closed" else None,
            )

    # ------------------------------------------------------------------
    def _alarms(self, devices):
        """7 天告警历史：活跃 + 已确认 + 已关闭，供趋势图与告警报表使用。"""
        by_code = {d.code: d for d in devices}
        now = timezone.now()

        # 1) 当前活跃告警：与处于 fault 状态的设备一一对应
        active_specs = [
            ("M07", "critical", "TEMP_HIGH", "主轴温度持续超限", 72.4, 68.0),
            ("M31", "warn", "DIM_DEVIATION", "加工尺寸偏差超标", 0.12, 0.05),
            ("R05", "warn", "VIB_HIGH", "关节振动值偏高", 9.6, 8.0),
            ("S44", "warn", "VIB_HIGH", "振动传感器数据跳变", 8.9, 8.0),
            ("G12", "warn", "TEMP_HIGH", "检测台温度偏高", 58.3, 55.0),
        ]
        for code, level, acode, content, value, thr in active_specs:
            dev = by_code.get(code)
            if not dev:
                continue
            a = Alarm.objects.create(
                device=dev, level=level, status="active", code=acode,
                content=f"{code} {content}", trigger_value=value, threshold=thr,
            )
            Alarm.objects.filter(pk=a.pk).update(created_at=now - timedelta(minutes=random.randint(8, 90)))

        # 2) 历史告警：近 7 天，已关闭 / 已确认混合
        candidates = [d for d in devices if d.status != "fault"]
        history = [
            ("machine", "TEMP_HIGH", "主轴温度超限", "critical", 66.0, 64.0),
            ("machine", "CURRENT_HIGH", "主轴电流超限", "warn", 15.8, 15.0),
            ("sensor", "VIB_HIGH", "振动值偏高", "warn", 8.6, 8.0),
            ("robot", "CURRENT_HIGH", "关节电流偏高", "warn", 11.4, 11.0),
            ("gauge", "TEMP_HIGH", "检测台温度偏高", "warn", 56.2, 55.0),
            ("agv", "BATTERY_LOW", "电量低", "warn", 13.0, 15.0),
        ]
        for day in range(6, -1, -1):
            for _ in range(random.randint(7, 13)):
                dev = random.choice(candidates)
                pool = [h for h in history if h[0] == dev.device_type] or history
                _, acode, text, level, value, thr = random.choice(pool)
                # 落在 [day, day+1) 天区间内，保证最近 24h 也有数据
                mins = random.randint(day * 1440 + 5, (day + 1) * 1440 - 5)
                ts = now - timedelta(minutes=mins)
                if random.random() < 0.72:
                    status = "closed"
                    close_ts = ts + timedelta(minutes=random.randint(6, 180))
                    ack_by, ack_at = random.choice(["张伟", "李强", "王敏"]), ts + timedelta(minutes=random.randint(1, 25))
                else:
                    status = "acked"
                    close_ts = None
                    ack_by, ack_at = random.choice(["张伟", "李强"]), ts + timedelta(minutes=random.randint(1, 25))
                a = Alarm.objects.create(
                    device=dev, level=level, status=status, code=acode,
                    content=f"{dev.code} {text}", trigger_value=round(value, 1), threshold=thr,
                    ack_by=ack_by, ack_at=ack_at, closed_at=close_ts,
                )
                Alarm.objects.filter(pk=a.pk).update(created_at=ts)

    # ------------------------------------------------------------------
    def _energy(self, devices):
        """近 7 天每台设备每日能耗，按额定功率 + 负载浮动合成。"""
        today = timezone.localdate()
        rows = []
        for day in range(7):
            d = today - timedelta(days=day)
            ts = timezone.make_aware(datetime(d.year, d.month, d.day, 8, 0))
            for dev in devices:
                if dev.status == "offline":
                    factor = 0.0
                elif dev.status == "stop":
                    factor = random.uniform(0.08, 0.2)
                else:
                    factor = random.uniform(0.55, 0.92)
                base = (dev.rated_power or 10.0) * 8.0  # 8 小时班次
                rows.append(EnergyRecord(device=dev, kwh=round(base * factor, 1), recorded_at=ts))
        EnergyRecord.objects.bulk_create(rows, batch_size=500)

    # ------------------------------------------------------------------
    def _metrics(self, devices):
        """近 1 小时每分钟温度/电流序列，供设备详情趋势图（http 模式）。"""
        now = timezone.now().replace(second=0, microsecond=0)
        rows = []
        for dev in devices:
            rated = dev.rated_power or 20.0
            base_t, base_c = 55.0 + (rated % 7), rated * 0.55
            base_s = {"machine": 5200, "robot": 1800, "sensor": 0, "gauge": 900, "agv": 0}.get(dev.device_type, 1200)
            base_v = {"machine": 3.2, "robot": 4.1, "sensor": 5.6, "gauge": 2.4, "agv": 3.0}.get(dev.device_type, 3.0)
            base_o = {"machine": 96, "robot": 120, "sensor": 0, "gauge": 240, "agv": 0}.get(dev.device_type, 100)
            fault = dev.status == "fault"
            for i in range(60):
                ts = now - timedelta(minutes=59 - i)
                wob = random.uniform(-1.4, 1.4)
                drift = 6.0 if fault else 0.0
                rows.append(DeviceMetric(
                    device=dev, metric_key="temperature",
                    value=round(base_t + wob + drift, 1), unit="°C", created_at=ts,
                ))
                rows.append(DeviceMetric(
                    device=dev, metric_key="current",
                    value=round(base_c + random.uniform(-0.8, 0.8) + (1.6 if fault else 0), 2),
                    unit="A", created_at=ts,
                ))
                if base_s:
                    rows.append(DeviceMetric(
                        device=dev, metric_key="speed",
                        value=round(base_s * random.uniform(0.94, 1.06), 0), unit="rpm", created_at=ts,
                    ))
                rows.append(DeviceMetric(
                    device=dev, metric_key="vibration",
                    value=round(base_v + random.uniform(-0.5, 0.5) + (2.0 if fault else 0), 2),
                    unit="mm/s", created_at=ts,
                ))
                if base_o:
                    rows.append(DeviceMetric(
                        device=dev, metric_key="output",
                        value=round(base_o * random.uniform(0.82, 1.12), 0), unit="件/h", created_at=ts,
                    ))
        with keep_time(DeviceMetric):
            DeviceMetric.objects.bulk_create(rows, batch_size=1000)

    # ------------------------------------------------------------------
    def _status_logs(self, devices):
        """近 48 小时状态变更流水，供三维状态回放（http 模式）。"""
        now = timezone.now()
        rows = []
        for dev in devices:
            # 每台设备 1~3 条历史变更，起点多为 normal
            for _ in range(random.randint(1, 3)):
                ts = now - timedelta(minutes=random.randint(30, 48 * 60))
                to_status = random.choice(["stop", "fault", "offline", "normal"])
                rows.append(DeviceStatusLog(
                    device=dev, from_status="normal", to_status=to_status,
                    reason={"stop": "计划停机换型", "fault": "阈值越限自动告警",
                            "offline": "网关心跳丢失", "normal": "人工复位"}[to_status],
                    created_at=ts,
                ))
            # 当前异常设备补一条回到现状的记录
            if dev.status != "normal":
                rows.append(DeviceStatusLog(
                    device=dev, from_status="normal", to_status=dev.status,
                    reason="当前状态", created_at=now - timedelta(minutes=random.randint(2, 25)),
                ))
        with keep_time(DeviceStatusLog):
            DeviceStatusLog.objects.bulk_create(rows, batch_size=1000)
