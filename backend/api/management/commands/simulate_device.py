"""
python manage.py simulate_device --devices 200 --interval 2 --fault-rate 0.02 --no-mqtt
--------------------------------------------------------------
虚拟设备上报脚本（扮演 IoT 网关 + 网关侧聚合）。
默认走 MQTT 发布；加 --no-mqtt 直接写库，适合没有 EMQX 的环境一键造数据。
"""
import json
import random
import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import Alarm, Device, DeviceMetric
from api.services import evaluate_rules

BASE = {
    "temperature": 58.0,
    "speed": 900.0,
    "current": 8.0,
    "vibration": 3.2,
    "battery": 88.0,
    "output": 42.0,
}

STEP = {"temperature": 0.6, "speed": 22.0, "current": 0.3, "vibration": 0.22, "battery": 0.1, "output": 1.2}
UNIT = {"temperature": "°C", "speed": "rpm", "current": "A", "vibration": "mm/s", "battery": "%", "output": "件/h"}


class Command(BaseCommand):
    help = "模拟设备上报：随机游走生成指标，超阈值自动生成告警"

    def add_arguments(self, parser):
        parser.add_argument("--devices", type=int, default=200, help="参与上报的设备数量")
        parser.add_argument("--interval", type=float, default=2.0, help="上报间隔（秒）")
        parser.add_argument("--fault-rate", type=float, default=0.02, help="每轮每台设备触发故障的概率")
        parser.add_argument("--ticks", type=int, default=0, help="运行轮数，0 表示一直跑")
        parser.add_argument("--no-mqtt", action="store_true", help="不发布 MQTT，直接写库")
        parser.add_argument("--inject", type=str, default="", help="指定设备编码强制注入故障，如 M01")

    def handle(self, *args, **opts):
        devices = list(Device.objects.exclude(status="offline")[: opts["devices"]])
        if not devices:
            self.stderr.write("没有设备，请先执行 python manage.py seed_demo")
            return

        if opts["inject"]:
            self._inject(opts["inject"])
            return

        publisher = None
        if not opts["no_mqtt"]:
            try:
                from api.mqtt import _client

                publisher = _client()
                publisher.loop_start()
                self.stdout.write(self.style.SUCCESS("已连接 MQTT Broker，开始上报"))
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(f"MQTT 不可用，自动降级为直接写库：{exc}")
                publisher = None

        state = {d.code: dict(BASE) for d in devices}
        tick = 0
        try:
            while True:
                tick += 1
                for device in devices:
                    metrics = state[device.code]
                    for k, step in STEP.items():
                        metrics[k] = round(max(0.0, metrics[k] + random.uniform(-step, step) + (BASE[k] - metrics[k]) * 0.08), 2)

                    if random.random() < opts["fault_rate"]:
                        metrics["temperature"] = round(random.uniform(66, 76), 2)

                    self._persist(device, metrics, publisher)
                    alarm = evaluate_rules(device, metrics)
                    if alarm:
                        self.stdout.write(f"[告警] {device.code} {alarm.content}")

                if opts["ticks"] and tick >= opts["ticks"]:
                    break
                time.sleep(opts["interval"])
        except KeyboardInterrupt:
            self.stdout.write("已停止")
        finally:
            if publisher:
                publisher.loop_stop()
                publisher.disconnect()

    def _persist(self, device, metrics, publisher):
        row = DeviceMetric.objects.bulk_create(
            [
                DeviceMetric(device=device, metric_key=k, value=v, unit=UNIT[k])
                for k, v in metrics.items()
                if k in UNIT
            ],
            ignore_conflicts=True,
        )
        del row
        if publisher:
            topic = f"factory/{device.area.code}/{device.code}/telemetry"
            publisher.publish(
                topic,
                json.dumps({"device_code": device.code, "ts": int(time.time() * 1000), "metrics": metrics}),
                qos=0,
            )

    def _inject(self, code):
        device = Device.objects.get(code=code)
        evaluate_rules(device, {"temperature": 74.5, "vibration": 9.4})
        device.refresh_from_db()
        self.stdout.write(
            self.style.SUCCESS(f"已对 {code} 注入故障，当前状态={device.status}，告警数={Alarm.objects.filter(device=device).count()}")
        )
