"""MQTT 通道：主题设计见 PRD §8.3。Broker 不可用时返回 False，不影响主流程。"""
import json
import logging
import os

log = logging.getLogger(__name__)

TOPIC_TELEMETRY = "factory/{area}/{device}/telemetry"
TOPIC_STATUS = "factory/{area}/{device}/status"
TOPIC_ALARM = "factory/alarm/{level}"
TOPIC_CMD = "factory/cmd/{device}"


def _client():
    import paho.mqtt.client as mqtt  # 延迟导入：没装 paho 时其余功能仍可用

    from django.conf import settings

    c = mqtt.Client()
    if settings.MQTT_USERNAME:
        c.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    c.connect(settings.MQTT_HOST, settings.MQTT_PORT, 10)
    return c


def publish(topic, payload):
    try:
        c = _client()
        c.publish(topic, json.dumps(payload, ensure_ascii=False), qos=1)
        c.disconnect()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("MQTT 发布失败（已降级）：%s", exc)
        return False


def publish_command(device_code, cmd, operator):
    if os.environ.get("MQTT_DISABLED") == "1":
        return False
    return publish(
        TOPIC_CMD.format(device=device_code),
        {"cmd": cmd, "operator": operator, "ts": __import__("time").time()},
    )
