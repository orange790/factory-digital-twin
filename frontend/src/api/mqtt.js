/**
 * MQTT 实时通道（可选）
 * ------------------------------------------------------------------
 * 后端 `api/mqtt.py` 发布到：
 *   factory/{area}/{device}/status      状态变更
 *   factory/{area}/{device}/telemetry   指标上报
 *   factory/alarm/{level}               告警
 * 前端经 WebSocket（EMQX 默认 8083）订阅。
 *
 * 设计原则：Broker 不存在时**静默降级**，不抛错、不阻塞首屏，
 * 由 App.vue 退回 3s HTTP 轮询（/api/devices/live/）。
 */
import mqtt from 'mqtt'

const WS_PORT = import.meta.env.VITE_MQTT_WS_PORT || 8083
const TOPICS = ['factory/+/+/status', 'factory/+/+/telemetry', 'factory/alarm/+']

/**
 * 默认不尝试连接：没有 EMQX 时浏览器必然在控制台打印 WebSocket 失败，
 * 会干扰演示与面试观感。接上 Broker 后启动前端时设置 VITE_MQTT=1 即可启用。
 */
export const MQTT_ENABLED = import.meta.env.VITE_MQTT === '1'

export function createMqttChannel({ onStatus, onTelemetry, onAlarm, onState } = {}) {
  if (!MQTT_ENABLED) {
    onState?.('fallback')
    return { close() {}, get connected() { return false } }
  }
  const host = window.location.hostname
  const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host}:${WS_PORT}/mqtt`

  let client = null
  let closed = false

  const state = (s) => {
    try {
      onState?.(s)
    } catch (e) {
      console.warn('[mqtt] state handler error', e)
    }
  }

  try {
    client = mqtt.connect(url, {
      connectTimeout: 2500,
      reconnectPeriod: 0, // 只尝试一次，失败即降级，避免控制台噪音
      clientId: `ft-twin-web-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
    })
  } catch (e) {
    state('fallback')
    return { close() {}, get connected() { return false } }
  }

  client.on('connect', () => {
    if (closed) return
    state('mqtt')
    client.subscribe(TOPICS, { qos: 0 }, (err) => {
      if (err) console.warn('[mqtt] 订阅失败', err)
    })
  })

  client.on('message', (topic, buf) => {
    let payload = {}
    try {
      payload = JSON.parse(buf.toString())
    } catch {
      return
    }
    const parts = topic.split('/')
    if (parts[1] === 'alarm') {
      onAlarm?.({ ...payload, level: payload.level || parts[2] })
      return
    }
    const device = parts[2]
    if (!device) return
    if (topic.endsWith('/status')) onStatus?.({ code: device, status: payload.status, ...payload })
    else onTelemetry?.({ code: device, ...payload })
  })

  client.on('error', () => {
    // 连不上就当没有，交给轮询
    state('fallback')
    try {
      client.end(true)
    } catch {
      /* ignore */
    }
  })

  // 2.5s 内没连上就认为 Broker 不可用
  const timer = setTimeout(() => {
    if (!client?.connected) {
      state('fallback')
      try {
        client?.end(true)
      } catch {
        /* ignore */
      }
    }
  }, 2600)

  return {
    close() {
      closed = true
      clearTimeout(timer)
      try {
        client?.end(true)
      } catch {
        /* ignore */
      }
    },
    get connected() {
      return !!client?.connected
    },
  }
}
