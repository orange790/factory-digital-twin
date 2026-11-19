/**
 * 浏览器内虚拟设备模拟器（扮演 IoT 网关 + EMQX + 订阅落库进程）
 * ------------------------------------------------------------------
 * 对应 PRD 的 simulate_device.py：随机游走生成指标 → 超阈值触发告警 →
 * 状态变更写流水。区别只是它跑在浏览器里，让 Demo 零依赖启动。
 */
import { getDb, persist, setDeviceStatus, logOp } from './db'

const METRIC_META = {
  temperature: { unit: '°C', step: 0.35 },
  speed: { unit: 'rpm', step: 18 },
  current: { unit: 'A', step: 0.22 },
  vibration: { unit: 'mm/s', step: 0.12 },
  battery: { unit: '%', step: 0.06 },
  output: { unit: '件/h', step: 0.9 },
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export class DeviceSimulator {
  constructor() {
    this.timer = null
    this.listeners = new Set()
    this.live = new Map() // code -> metrics
    this.history = new Map() // code -> [{t, temperature,...}]
    this.tickCount = 0
    this.interval = 1200
    this.autoFaultRate = 0.004
    this.enabled = true
  }

  /* ---- 订阅 ---- */
  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  emit(evt) {
    this.listeners.forEach((fn) => fn(evt))
  }

  bootstrap() {
    const db = getDb()
    db.devices.forEach((d) => {
      const base = db.baselines[d.code] || { temperature: 50, speed: 900, current: 8, output: 40 }
      this.live.set(d.code, { ...base })
      this.history.set(d.code, [])
    })
  }

  start() {
    if (this.timer) return
    this.bootstrap()
    this.timer = setInterval(() => this.tick(), this.interval)
  }
  stop() {
    clearInterval(this.timer)
    this.timer = null
  }

  /** 手动制造故障：面试演示的"造故障"按钮 */
  triggerFault(code, reason = '人工注入故障（演示）') {
    const db = getDb()
    const dev = db.devices.find((d) => d.code === code)
    if (!dev) return null
    const m = this.live.get(code) || {}
    const key = dev.device_type === 'sensor' ? 'vibration' : 'temperature'
    if (key === 'vibration') m.vibration = 9.4
    else m.temperature = 74.5
    this.live.set(code, m)
    setDeviceStatus(code, 'fault', reason, 'demo')
    const alarm = this.raiseAlarm(dev, key, m[key], key === 'vibration' ? 8 : 68, 'critical', reason)
    this.emit({ type: 'status', code, status: 'fault', reason })
    this.emit({ type: 'alarm', alarm })
    persist()
    return alarm
  }

  recover(code) {
    setDeviceStatus(code, 'normal', '人工恢复（演示）', 'demo')
    const db = getDb()
    db.alarms
      .filter((a) => a.device_code === code && a.status !== 'closed')
      .forEach((a) => {
        a.status = 'closed'
        a.closed_at = new Date().toISOString()
      })
    persist()
    this.emit({ type: 'status', code, status: 'normal', reason: '人工恢复' })
  }

  raiseAlarm(dev, metricKey, value, threshold, level, reason = '') {
    const db = getDb()
    const codeMap = { temperature: 'TEMP_HIGH', vibration: 'VIB_HIGH', current: 'CURRENT_HIGH', battery: 'BATTERY_LOW' }
    const code = codeMap[metricKey] || 'THRESHOLD'

    // 去重：同设备同类型 5 分钟内合并（对应 F-BE-04）
    const dup = db.alarms.find(
      (a) => a.device_code === dev.code && a.code === code && a.status !== 'closed' && Date.now() - new Date(a.created_at).getTime() < 5 * 60 * 1000,
    )
    if (dup) {
      dup.trigger_value = +Number(value).toFixed(2)
      const idx = db.alarms.indexOf(dup)
      if (idx > 0) {
        db.alarms.splice(idx, 1)
        db.alarms.unshift(dup)
      }
      return dup
    }

    db.seq.alarm += 1
    const content =
      metricKey === 'temperature'
        ? `${dev.name} 温度 ${Number(value).toFixed(1)}°C 超阈值 ${threshold}°C`
        : metricKey === 'vibration'
          ? `${dev.name} 振动 ${Number(value).toFixed(2)}mm/s 超阈值 ${threshold}mm/s`
          : `${dev.name} ${METRIC_META[metricKey]?.unit || ''} 指标异常（${Number(value).toFixed(2)}）`
    const alarm = {
      id: db.seq.alarm,
      device_id: dev.id,
      device_code: dev.code,
      device_name: dev.name,
      area_code: dev.area_code,
      level,
      status: 'active',
      code,
      content: reason ? `${content}（${reason}）` : content,
      trigger_value: +Number(value).toFixed(2),
      threshold,
      ack_by: '',
      ack_at: null,
      closed_at: null,
      created_at: new Date().toISOString(),
    }
    db.alarms.unshift(alarm)
    if (db.alarms.length > 600) db.alarms.length = 600
    return alarm
  }

  ruleHit(dev, metrics) {
    const db = getDb()
    const rules = db.alarmRules.filter((r) => r.enabled && r.device_type === dev.device_type)
    for (const r of rules) {
      const v = metrics[r.metric_key]
      if (v === undefined) continue
      const hit = r.operator === '>' ? v > r.threshold : v < r.threshold
      if (hit) return { rule: r, value: v }
    }
    return null
  }

  tick() {
    if (!this.enabled) return
    const db = getDb()
    this.tickCount += 1
    const changed = []
    const newAlarms = []
    // 现场同时故障设备上限，避免 200 台随机游走把告警刷屏
    let faultCount = db.devices.filter((d) => d.status === 'fault').length
    const MAX_FAULT = 9

    db.devices.forEach((dev) => {
      if (dev.status === 'offline') return
      const cur = this.live.get(dev.code) || {}
      const base = db.baselines[dev.code] || { temperature: 50 }
      // 均值回归随机游走
      const next = { ...cur }
      Object.keys(METRIC_META).forEach((k) => {
        if (next[k] === undefined) return
        const mid = base[k] ?? next[k]
        const step = METRIC_META[k].step
        const pull = (mid - next[k]) * 0.06
        let v = next[k] + pull + (Math.random() - 0.5) * step * 2
        if (dev.status === 'fault' && (k === 'temperature' || k === 'vibration')) {
          v = Math.max(v, k === 'temperature' ? 66 : 7.4)
        }
        if (k === 'battery') v = clamp(v, 4, 100)
        next[k] = +v.toFixed(2)
      })
      this.live.set(dev.code, next)

      const hist = this.history.get(dev.code)
      hist.push({ t: Date.now(), ...next })
      if (hist.length > 90) hist.shift()

      // 规则判定（只对非故障设备做新告警判定，避免刷屏）
      if (dev.status !== 'fault' && dev.status !== 'stop') {
        const hit = faultCount < MAX_FAULT && newAlarms.length < 2 ? this.ruleHit(dev, next) : null
        if (hit) {
          faultCount++
          setDeviceStatus(dev.code, 'fault', `${hit.rule.metric_key} 超阈值`, 'simulator')
          const alarm = this.raiseAlarm(dev, hit.rule.metric_key, hit.value, hit.rule.threshold, hit.rule.level)
          newAlarms.push(alarm)
          changed.push({ code: dev.code, status: 'fault' })
        }
      } else if (dev.status === 'fault') {
        // 故障设备指标回落则为"自愈"，但仍保留告警等待人工闭环
        const stillHit = this.ruleHit(dev, next)
        if (!stillHit && Math.random() < 0.02) {
          setDeviceStatus(dev.code, 'normal', '指标恢复正常', 'simulator')
          changed.push({ code: dev.code, status: 'normal' })
        }
      }
    })

    // 离线设备小概率恢复心跳
    db.devices
      .filter((d) => d.status === 'offline')
      .forEach((d) => {
        if (Math.random() < 0.04) {
          setDeviceStatus(d.code, 'normal', '心跳恢复', 'simulator')
          changed.push({ code: d.code, status: 'normal' })
        }
      })

    if (changed.length || newAlarms.length) persist()

    this.emit({
      type: 'tick',
      ts: Date.now(),
      live: this.live,
      changed,
      alarms: newAlarms,
      counters: this.snapshotCounters(),
    })
  }

  snapshotCounters() {
    const db = getDb()
    const online = db.devices.filter((d) => d.status !== 'offline').length
    return {
      total: db.devices.length,
      online,
      fault: db.devices.filter((d) => d.status === 'fault').length,
      stop: db.devices.filter((d) => d.status === 'stop').length,
      active_alarms: db.alarms.filter((a) => a.status === 'active').length,
      pending_orders: db.workorders.filter((w) => w.status !== 'closed').length,
    }
  }

  getMetrics(code) {
    return this.live.get(code) || {}
  }
  getHistory(code) {
    return (this.history.get(code) || []).slice(-60)
  }
}

export const simulator = new DeviceSimulator()
