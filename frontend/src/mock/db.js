/**
 * 浏览器内数据层（模拟 Django + DRF 的接口语义）
 * ------------------------------------------------------------------
 * 目的：让作品集在没有后端 / 没有 MQTT 的场合也能 30 秒内跑起来完整闭环，
 * 同时接口形状与 /api/* 完全一致 —— 切换数据源只需改 api/client.js 的一行。
 *
 * 生产形态：本文件由 frontend 的 mock adapter 承担，Django 侧实现同一套路由。
 */
import { AREAS, LINE_LAYOUT, buildDevices, overdueDays } from './seed'

const STORAGE_KEY = 'ft-twin-db-v4'
const HOUR = 3600 * 1000
const DAY = 24 * HOUR

let db = null
let saveTimer = null

/* ---------------- 工具 ---------------- */
export function uid() {
  return Math.random().toString(36).slice(2, 10)
}
function clone(o) {
  return JSON.parse(JSON.stringify(o))
}
function paginate(list, page = 1, pageSize = 20) {
  const p = Math.max(1, Number(page) || 1)
  const ps = Math.max(1, Number(pageSize) || 20)
  const start = (p - 1) * ps
  return {
    count: list.length,
    page: p,
    page_size: ps,
    results: clone(list.slice(start, start + ps)),
  }
}
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}
function fmtTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/* ---------------- 初始化 ---------------- */
function seedDb() {
  const { devices, baselines } = buildDevices()
  const now = Date.now()

  const alarms = []
  const workorders = []
  const alarmRules = [
    { id: 1, device_type: 'machine', metric_key: 'temperature', operator: '>', threshold: 68, level: 'critical', enabled: true },
    { id: 2, device_type: 'machine', metric_key: 'temperature', operator: '>', threshold: 64, level: 'warn', enabled: true },
    { id: 3, device_type: 'machine', metric_key: 'current', operator: '>', threshold: 15, level: 'warn', enabled: true },
    { id: 4, device_type: 'robot', metric_key: 'temperature', operator: '>', threshold: 60, level: 'warn', enabled: true },
    { id: 5, device_type: 'robot', metric_key: 'current', operator: '>', threshold: 11, level: 'warn', enabled: true },
    { id: 6, device_type: 'sensor', metric_key: 'vibration', operator: '>', threshold: 8, level: 'warn', enabled: true },
    { id: 7, device_type: 'sensor', metric_key: 'temperature', operator: '>', threshold: 70, level: 'critical', enabled: true },
    { id: 8, device_type: 'gauge', metric_key: 'temperature', operator: '>', threshold: 55, level: 'warn', enabled: true },
    { id: 9, device_type: 'agv', metric_key: 'battery', operator: '<', threshold: 15, level: 'warn', enabled: true },
  ]

  let aid = 0
  const mkAlarm = (d, level, code, content, trigger, threshold, createdAt, status = 'active') => {
    aid += 1
    return {
      id: aid,
      device_id: d.id,
      device_code: d.code,
      device_name: d.name,
      area_code: d.area_code,
      level,
      status,
      code,
      content,
      trigger_value: trigger,
      threshold,
      ack_by: status === 'active' ? '' : 'operator',
      ack_at: status === 'active' ? null : new Date(createdAt + 3 * 60 * 1000).toISOString(),
      closed_at: status === 'closed' ? new Date(createdAt + 40 * 60 * 1000).toISOString() : null,
      created_at: new Date(createdAt).toISOString(),
    }
  }

  // 当前故障设备的未处理告警
  devices
    .filter((d) => d.status === 'fault')
    .forEach((d, i) => {
      alarms.push(
        mkAlarm(
          d,
          i % 2 === 0 ? 'critical' : 'warn',
          d.device_type === 'sensor' ? 'VIB_HIGH' : 'TEMP_HIGH',
          d.device_type === 'sensor' ? `振动值 ${(8.4 + i * 0.3).toFixed(2)}mm/s 超阈值` : `主轴温度 ${(69.2 + i * 1.4).toFixed(1)}°C 超阈值`,
          +(69.2 + i * 1.4).toFixed(1),
          d.device_type === 'sensor' ? 8 : 68,
          now - (i + 1) * 7 * 60 * 1000,
        ),
      )
    })

  // 历史告警（用于趋势图）
  for (let i = 0; i < 68; i++) {
    const d = devices[Math.floor(Math.random() * devices.length)]
    const t = now - Math.floor(Math.random() * 7 * DAY)
    const level = Math.random() > 0.62 ? 'critical' : 'warn'
    alarms.push(
      mkAlarm(
        d,
        level,
        ['TEMP_HIGH', 'VIB_HIGH', 'CURRENT_HIGH', 'OFFLINE'][Math.floor(Math.random() * 4)],
        '历史告警记录（自动闭环）',
        +(60 + Math.random() * 15).toFixed(1),
        62,
        t,
        Math.random() > 0.35 ? 'closed' : 'acked',
      ),
    )
  }
  alarms.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // 工单
  let wid = 0
  const mkOrder = (d, status, type, title, priority, offsetH) => {
    wid += 1
    const created = now - offsetH * HOUR
    return {
      id: wid,
      order_no: `WO${fmtTime(new Date(created))}${String(wid).padStart(3, '0')}`,
      title,
      order_type: type,
      device_id: d ? d.id : null,
      device_code: d ? d.code : '',
      device_name: d ? d.name : '',
      alarm_id: null,
      status,
      assignee: status === 'pending' ? '' : ['张伟', '李强', '王芳'][wid % 3],
      priority,
      content: '按 SOP 处理并填写处理结果',
      result: status === 'closed' ? '已更换轴承并复测，温度恢复正常' : '',
      created_at: new Date(created).toISOString(),
      updated_at: new Date(created + HOUR).toISOString(),
      closed_at: status === 'closed' ? new Date(created + 3 * HOUR).toISOString() : null,
    }
  }
  const byCode = (c) => devices.find((d) => d.code === c)
  workorders.push(mkOrder(byCode('M07'), 'processing', 'fault', 'M07 主轴温度持续超限', 'high', 5))
  workorders.push(mkOrder(byCode('M31'), 'pending', 'fault', 'M31 加工尺寸偏差超标', 'high', 2))
  workorders.push(mkOrder(byCode('R05'), 'assigned', 'fault', 'R05 关节异响排查', 'mid', 8))
  workorders.push(mkOrder(byCode('S44'), 'pending', 'fault', 'S44 振动传感器数据跳变', 'mid', 1))
  workorders.push(mkOrder(byCode('M18'), 'processing', 'maintain', 'M18 季度保养（润滑+紧固）', 'low', 26))
  workorders.push(mkOrder(byCode('V03'), 'closed', 'fault', 'V03 电量异常下降', 'mid', 52))
  workorders.push(mkOrder(byCode('G12'), 'closed', 'inspection', 'G12 巡检发现镜头脏污', 'low', 76))
  workorders.push(mkOrder(null, 'pending', 'maintain', '空压机房月度点检', 'low', 12))

  // 巡检
  const pointCodes = [
    ['A1-01', 'M01', -32, -20],
    ['A1-12', 'M12', 23, -20],
    ['A2-06', 'M18', -7, -12],
    ['B1-04', 'M27', -17, -4],
    ['C1-08', 'M51', 3, 12],
    ['C2-02', 'M56', -27, 20],
  ]
  const points = pointCodes.map(([name, code, x, z], i) => ({
    id: i + 1,
    name: `巡检点-${name}`,
    device_id: byCode(code)?.id || null,
    device_code: code,
    position_x: x,
    position_y: 0,
    position_z: z,
    check_items: ['温度正常', '无异响', '无漏液', '安全防护到位'],
  }))

  const routes = [
    { id: 1, name: 'A 区日常巡检线', loop: true, point_ids: [1, 2, 3, 4] },
    { id: 2, name: 'C 区夜班巡检线', loop: false, point_ids: [5, 6] },
  ]
  const plans = [
    { id: 1, name: '机加工车间日常巡检', route_id: 1, cycle: 'daily', cron: '', assignee: '张伟', enabled: true },
    { id: 2, name: '检测车间夜班巡检', route_id: 2, cycle: 'daily', cron: '', assignee: '李强', enabled: true },
  ]
  const tasks = [
    { id: 1, plan_id: 1, route_id: 1, status: 'pending', executor: '', started_at: null, finished_at: null, created_at: new Date(now - 2 * HOUR).toISOString() },
    { id: 2, plan_id: 2, route_id: 2, status: 'doing', executor: '李强', started_at: new Date(now - 30 * 60 * 1000).toISOString(), finished_at: null, created_at: new Date(now - 3 * HOUR).toISOString() },
    { id: 3, plan_id: 1, route_id: 1, status: 'done', executor: '张伟', started_at: new Date(now - 26 * HOUR).toISOString(), finished_at: new Date(now - 25 * HOUR).toISOString(), created_at: new Date(now - 27 * HOUR).toISOString() },
  ]
  const records = [
    { id: 1, task_id: 3, point_id: 1, is_abnormal: false, result: { 温度正常: true, 无异响: true, 无漏液: true, 安全防护到位: true }, remark: '', created_at: new Date(now - 25 * HOUR).toISOString() },
    { id: 2, task_id: 3, point_id: 3, is_abnormal: true, result: { 温度正常: false, 无异响: true, 无漏液: true, 安全防护到位: true }, remark: 'M18 机身温度偏高，已转工单', created_at: new Date(now - 25 * HOUR).toISOString() },
  ]

  const maintains = [
    { id: 1, device_id: byCode('M01')?.id ?? null, device_code: 'M01', mtype: 'care', operator: '张伟', cost: 320, content: '季度保养：导轨润滑、皮带张紧', created_at: new Date(now - 40 * DAY).toISOString() },
    { id: 2, device_id: byCode('M07')?.id, device_code: 'M07', mtype: 'repair', operator: '李强', cost: 1860, content: '更换主轴轴承', created_at: new Date(now - 12 * DAY).toISOString() },
    { id: 3, device_id: byCode('R05')?.id, device_code: 'R05', mtype: 'replace', operator: '王芳', cost: 4200, content: '更换 J2 轴减速机', created_at: new Date(now - 62 * DAY).toISOString() },
  ]

  const logs = [
    { id: 1, operator: 'admin', action: 'LOGIN', target: 'session', before: null, after: { ip: '10.0.0.8' }, ip: '10.0.0.8', created_at: new Date(now - 40 * 60 * 1000).toISOString() },
    { id: 2, operator: 'operator', action: 'ALARM_ACK', target: 'Alarm#2', before: { status: 'active' }, after: { status: 'acked' }, ip: '10.0.0.12', created_at: new Date(now - 18 * 60 * 1000).toISOString() },
    { id: 3, operator: 'admin', action: 'DEVICE_UPDATE', target: 'Device#M07', before: { status: 'normal' }, after: { status: 'fault' }, ip: '10.0.0.8', created_at: new Date(now - 8 * 60 * 1000).toISOString() },
  ]

  return {
    version: 4,
    areas: clone(AREAS),
    lines: clone(LINE_LAYOUT),
    devices,
    baselines,
    alarms,
    alarmRules,
    workorders,
    points,
    routes,
    plans,
    tasks,
    records,
    maintains,
    logs,
    snapshots: [],
    scene: {
      status_colors: { normal: '#3FB950', offline: '#8B949E', fault: '#F85149', stop: '#D29922' },
      layer_visible: { building: true, device: true, label: true, effect: true, helper: false },
      bg_color: '#080A0F',
      camera_presets: [
        { name: 'overview', label: '总览', camPos: [52, 56, 76], target: [0, 0, 0] },
        { name: 'line_A1', label: '产线 A1', camPos: [-42, 9.5, -20], target: [12, 1, -20] },
        { name: 'line_B1', label: '产线 B1', camPos: [-42, 9.5, -4], target: [12, 1, -4] },
        { name: 'line_C1', label: '产线 C1', camPos: [-42, 9.5, 12], target: [12, 1, 12] },
        { name: 'top', label: '俯视', camPos: [0, 82, 0.6], target: [0, 0, 0] },
      ],
      model_file: null,
      updated_at: new Date().toISOString(),
    },
    seq: { alarm: aid, workorder: wid, device: devices.length, maintain: 3, log: 3, point: 6, task: 3, record: 2, snapshot: 0 },
  }
}

export function getDb() {
  if (db) return db
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === 4) {
        db = parsed
        return db
      }
    }
  } catch (e) {
    console.warn('[mock] 本地数据损坏，重新生成', e)
  }
  db = seedDb()
  persistNow()
  return db
}

export function persistNow() {
  if (!db) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (e) {
    console.warn('[mock] 持久化失败（可能超出 localStorage 配额）', e)
  }
}

export function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistNow, 800)
}

export function resetDb() {
  localStorage.removeItem(STORAGE_KEY)
  db = seedDb()
  persistNow()
  return db
}

export function logOp(operator, action, target, before, after) {
  const d = getDb()
  d.seq.log += 1
  d.logs.unshift({
    id: d.seq.log,
    operator: operator || 'demo',
    action,
    target,
    before: before || null,
    after: after || null,
    ip: '127.0.0.1',
    created_at: new Date().toISOString(),
  })
  if (d.logs.length > 400) d.logs.length = 400
}

/* ---------------- 指标时序（确定性合成） ---------------- */
export function seriesFor(deviceCode, key, range = '1h') {
  const d = getDb()
  const base = d.baselines[deviceCode] || { temperature: 50, speed: 900, current: 8, output: 40 }
  const b = base[key] ?? 50
  const points = range === '24h' ? 96 : range === '7d' ? 168 : 60
  const span = range === '7d' ? 7 * DAY : range === '24h' ? DAY : HOUR
  const step = span / points
  const out = []
  const seed = hash(deviceCode + key)
  const amp = key === 'temperature' ? 3.2 : key === 'vibration' ? 0.9 : key === 'battery' ? 4 : b * 0.06
  for (let i = points; i >= 0; i--) {
    const t = Date.now() - i * step
    const x = (t / 1000) % 100000
    const v =
      b +
      Math.sin(x / (range === '7d' ? 9000 : 900) + seed * 6.28) * amp +
      Math.sin(x / (range === '7d' ? 2600 : 260) + seed * 3.14) * amp * 0.45 +
      (hash(deviceCode + key + Math.floor(t / step)) - 0.5) * amp * 0.4
    out.push({ t, value: +Math.max(0, v).toFixed(2) })
  }
  return out
}

/* ---------------- 查询 ---------------- */
export function listDevices(params = {}) {
  const d = getDb()
  let arr = d.devices.slice()
  const { status, area_code, area_id, line_id, device_type, keyword, is_critical, ordering } = params
  if (status) arr = arr.filter((x) => x.status === status)
  if (area_code) arr = arr.filter((x) => x.area_code === area_code)
  if (area_id) arr = arr.filter((x) => String(x.area_id) === String(area_id))
  if (line_id) arr = arr.filter((x) => String(x.line_id) === String(line_id))
  if (device_type) arr = arr.filter((x) => x.device_type === device_type)
  if (is_critical) arr = arr.filter((x) => x.is_critical)
  if (keyword) {
    const k = String(keyword).toLowerCase()
    arr = arr.filter((x) => x.code.toLowerCase().includes(k) || x.name.toLowerCase().includes(k))
  }
  if (ordering === '-created_at') arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  else {
    const typeOrder = { machine: 0, robot: 1, sensor: 2, gauge: 3, agv: 4 }
    arr.sort(
      (a, b) =>
        (a.area_id || 0) - (b.area_id || 0) ||
        (a.line_id || 99) - (b.line_id || 99) ||
        (typeOrder[a.device_type] ?? 9) - (typeOrder[b.device_type] ?? 9) ||
        String(a.code).localeCompare(String(b.code), 'zh'),
    )
  }
  if (params.all) return clone(arr)
  return paginate(arr, params.page, params.page_size)
}

export function deviceTree() {
  const d = getDb()
  return d.areas.map((a) => ({
    ...a,
    lines: d.lines
      .filter((l) => l.area_id === a.id)
      .map((l) => ({
        ...l,
        devices: d.devices
          .filter((x) => x.line_id === l.id)
          .map((x) => ({ id: x.id, code: x.code, name: x.name, status: x.status, device_type: x.device_type, is_critical: x.is_critical })),
      })),
    devices: d.devices
      .filter((x) => x.area_id === a.id && !x.line_id)
      .map((x) => ({ id: x.id, code: x.code, name: x.name, status: x.status, device_type: x.device_type })),
  }))
}

export function statusMap() {
  const d = getDb()
  return d.devices.map((x) => ({ code: x.code, status: x.status, id: x.id }))
}

export function overviewStats() {
  const d = getDb()
  const total = d.devices.length
  const online = d.devices.filter((x) => x.status !== 'offline').length
  const fault = d.devices.filter((x) => x.status === 'fault').length
  const stop = d.devices.filter((x) => x.status === 'stop').length
  const pendingOrders = d.workorders.filter((x) => x.status !== 'closed').length
  const activeAlarms = d.alarms.filter((x) => x.status === 'active').length
  const overdue = d.devices.filter((x) => overdueDays(x) > 0).length
  return {
    total,
    online,
    offline: total - online,
    online_rate: +(online / total * 100).toFixed(1),
    fault,
    stop,
    pending_orders: pendingOrders,
    active_alarms: activeAlarms,
    overdue_maintain: overdue,
    by_status: ['normal', 'offline', 'fault', 'stop'].map((s) => ({
      status: s,
      count: d.devices.filter((x) => x.status === s).length,
    })),
    by_type: Object.entries(
      d.devices.reduce((acc, x) => {
        acc[x.device_type] = (acc[x.device_type] || 0) + 1
        return acc
      }, {}),
    ).map(([type, count]) => ({ type, count })),
  }
}

export function alarmTrend(range = '24h') {
  const d = getDb()
  const buckets = range === '30d' ? 30 : range === '7d' ? 7 : 24
  const span = buckets * HOUR * (range === '30d' ? 24 : range === '7d' ? 24 : 1)
  const now = Date.now()
  const out = []
  for (let i = buckets - 1; i >= 0; i--) {
    const end = now - i * (span / buckets)
    const start = end - span / buckets
    const inBucket = d.alarms.filter((a) => {
      const t = new Date(a.created_at).getTime()
      return t >= start && t < end
    })
    out.push({
      label:
        range === '24h'
          ? `${new Date(end).getHours()}:00`
          : `${new Date(end).getMonth() + 1}/${new Date(end).getDate()}`,
      warn: inBucket.filter((a) => a.level === 'warn').length,
      critical: inBucket.filter((a) => a.level === 'critical').length,
    })
  }
  return out
}

export function listAlarms(params = {}) {
  const d = getDb()
  let arr = d.alarms.slice()
  if (params.level) arr = arr.filter((x) => x.level === params.level)
  if (params.status) arr = arr.filter((x) => x.status === params.status)
  if (params.area_code) arr = arr.filter((x) => x.area_code === params.area_code)
  if (params.device_code) arr = arr.filter((x) => x.device_code === params.device_code)
  if (params.device_id) arr = arr.filter((x) => String(x.device_id) === String(params.device_id))
  if (params.keyword) {
    const k = String(params.keyword).toLowerCase()
    arr = arr.filter((x) => x.device_code.toLowerCase().includes(k) || x.content.toLowerCase().includes(k))
  }
  arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  if (params.all) return clone(arr)
  return paginate(arr, params.page, params.page_size)
}

export function ackAlarm(id, operator) {
  const d = getDb()
  const a = d.alarms.find((x) => x.id === Number(id))
  if (!a) throw new Error('告警不存在')
  if (a.status !== 'active') throw new Error('仅未处理告警可确认')
  a.status = 'acked'
  a.ack_by = operator || 'operator'
  a.ack_at = new Date().toISOString()
  logOp(operator, 'ALARM_ACK', `Alarm#${a.id}`, { status: 'active' }, { status: 'acked' })
  persist()
  return clone(a)
}

export function closeAlarm(id, operator) {
  const d = getDb()
  const a = d.alarms.find((x) => x.id === Number(id))
  if (!a) throw new Error('告警不存在')
  a.status = 'closed'
  a.closed_at = new Date().toISOString()
  if (!a.ack_by) {
    a.ack_by = operator || 'operator'
    a.ack_at = a.closed_at
  }
  const dev = d.devices.find((x) => x.id === a.device_id)
  if (dev && dev.status === 'fault') setDeviceStatus(dev.code, 'normal', '告警关闭自动恢复', operator)
  logOp(operator, 'ALARM_CLOSE', `Alarm#${a.id}`, { status: 'acked' }, { status: 'closed' })
  persist()
  return clone(a)
}

export function listWorkorders(params = {}) {
  const d = getDb()
  let arr = d.workorders.slice()
  if (params.status) arr = arr.filter((x) => x.status === params.status)
  if (params.order_type) arr = arr.filter((x) => x.order_type === params.order_type)
  if (params.device_code) arr = arr.filter((x) => x.device_code === params.device_code)
  if (params.device_id) arr = arr.filter((x) => String(x.device_id) === String(params.device_id))
  if (params.keyword) {
    const k = String(params.keyword).toLowerCase()
    arr = arr.filter((x) => x.title.toLowerCase().includes(k) || x.order_no.toLowerCase().includes(k))
  }
  arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  if (params.all) return clone(arr)
  return paginate(arr, params.page, params.page_size)
}

const WO_FLOW = {
  pending: ['assigned', 'processing'],
  assigned: ['processing'],
  processing: ['closed'],
  closed: [],
}

export function createWorkorder(payload, operator) {
  const d = getDb()
  d.seq.workorder += 1
  const dev = payload.device_id ? d.devices.find((x) => x.id === Number(payload.device_id)) : null
  const now = new Date()
  const wo = {
    id: d.seq.workorder,
    order_no: `WO${fmtTime(now)}${String(d.seq.workorder).padStart(3, '0')}`,
    title: payload.title || '新建运维工单',
    order_type: payload.order_type || 'fault',
    device_id: dev ? dev.id : null,
    device_code: dev ? dev.code : '',
    device_name: dev ? dev.name : '',
    alarm_id: payload.alarm_id || null,
    status: 'pending',
    assignee: payload.assignee || '',
    priority: payload.priority || 'mid',
    content: payload.content || '',
    result: '',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    closed_at: null,
  }
  d.workorders.unshift(wo)
  if (wo.alarm_id) {
    const a = d.alarms.find((x) => x.id === Number(wo.alarm_id))
    if (a && a.status === 'active') {
      a.status = 'acked'
      a.ack_by = operator || 'operator'
      a.ack_at = now.toISOString()
    }
  }
  logOp(operator, 'WORKORDER_CREATE', `WorkOrder#${wo.order_no}`, null, { status: 'pending' })
  persist()
  return clone(wo)
}

export function transitionWorkorder(id, to, payload = {}, operator) {
  const d = getDb()
  const wo = d.workorders.find((x) => x.id === Number(id))
  if (!wo) throw new Error('工单不存在')
  const allowed = WO_FLOW[wo.status] || []
  if (!allowed.includes(to)) {
    const err = new Error(`非法流转：${wo.status} → ${to}`)
    err.code = 'INVALID_TRANSITION'
    throw err
  }
  const from = wo.status
  wo.status = to
  wo.updated_at = new Date().toISOString()
  if (payload.assignee !== undefined) wo.assignee = payload.assignee
  if (payload.result !== undefined) wo.result = payload.result

  if (to === 'closed') {
    wo.closed_at = new Date().toISOString()
    // 关闭工单 → 自动关闭关联告警 → 设备恢复
    if (wo.alarm_id) {
      const a = d.alarms.find((x) => x.id === Number(wo.alarm_id))
      if (a && a.status !== 'closed') {
        a.status = 'closed'
        a.closed_at = wo.closed_at
        if (!a.ack_by) a.ack_by = operator || 'operator'
      }
    } else if (wo.device_id) {
      d.alarms
        .filter((x) => x.device_id === wo.device_id && x.status !== 'closed')
        .forEach((a) => {
          a.status = 'closed'
          a.closed_at = wo.closed_at
        })
    }
    if (wo.device_id) {
      const dev = d.devices.find((x) => x.id === wo.device_id)
      if (dev && dev.status === 'fault') setDeviceStatus(dev.code, 'normal', `工单 ${wo.order_no} 闭环`, operator)
    }
  }
  logOp(operator, 'WORKORDER_TRANSITION', `WorkOrder#${wo.order_no}`, { status: from }, { status: to })
  persist()
  return clone(wo)
}

export function setDeviceStatus(code, status, reason = '', operator = 'system') {
  const d = getDb()
  const dev = d.devices.find((x) => x.code === code)
  if (!dev || dev.status === status) return dev
  const from = dev.status
  dev.status = status
  dev.updated_at = new Date().toISOString()
  d.statusLogs = d.statusLogs || []
  d.statusLogs.push({ device_code: code, from_status: from, to_status: status, reason, created_at: new Date().toISOString() })
  if (d.statusLogs.length > 3000) d.statusLogs.splice(0, 500)
  persist()
  return dev
}

export function upsertDevice(payload, operator) {
  const d = getDb()
  if (payload.id) {
    const dev = d.devices.find((x) => x.id === Number(payload.id))
    if (!dev) throw new Error('设备不存在')
    const before = { code: dev.code, name: dev.name, status: dev.status }
    Object.assign(dev, payload, { id: dev.id })
    const area = d.areas.find((a) => a.id === Number(dev.area_id))
    const line = d.lines.find((l) => l.id === Number(dev.line_id))
    dev.area_code = area ? area.code : dev.area_code
    dev.area_name = area ? area.name : dev.area_name
    dev.line_code = line ? line.code : dev.line_code
    dev.glb_node_name = `DEV_${dev.code}`
    dev.updated_at = new Date().toISOString()
    logOp(operator, 'DEVICE_UPDATE', `Device#${dev.code}`, before, { code: dev.code, name: dev.name, status: dev.status })
    persist()
    return clone(dev)
  }
  if (d.devices.some((x) => x.code === payload.code)) {
    const err = new Error(`设备编码 ${payload.code} 已存在`)
    err.code = 'DUPLICATE_CODE'
    throw err
  }
  d.seq.device += 1
  const area = d.areas.find((a) => a.id === Number(payload.area_id)) || d.areas[0]
  const line = d.lines.find((l) => l.id === Number(payload.line_id))
  const dev = {
    id: d.devices.length ? Math.max(...d.devices.map((x) => x.id)) + 1 : 1,
    code: payload.code,
    name: payload.name,
    device_type: payload.device_type || 'machine',
    area_id: area.id,
    area_code: area.code,
    area_name: area.name,
    line_id: line ? line.id : null,
    line_code: line ? line.code : '',
    parent_id: payload.parent_id || null,
    status: 'normal',
    is_critical: !!payload.is_critical,
    glb_node_name: `DEV_${payload.code}`,
    position_x: Number(payload.position_x) || 0,
    position_y: Number(payload.position_y) || 0,
    position_z: Number(payload.position_z) || 0,
    camera_preset: line ? `line_${line.code}` : 'overview',
    rated_power: Number(payload.rated_power) || 0,
    install_date: payload.install_date || new Date().toISOString().slice(0, 10),
    maintain_cycle_days: Number(payload.maintain_cycle_days) || 90,
    last_maintain_date: payload.last_maintain_date || new Date().toISOString().slice(0, 10),
    desc: payload.desc || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  d.devices.push(dev)
  d.baselines[dev.code] = { temperature: 52, speed: 900, current: 8, output: 40, vibration: 3.2, battery: 90 }
  logOp(operator, 'DEVICE_CREATE', `Device#${dev.code}`, null, { code: dev.code, name: dev.name })
  persist()
  return clone(dev)
}

export function deleteDevice(id, operator) {
  const d = getDb()
  const idx = d.devices.findIndex((x) => x.id === Number(id))
  if (idx < 0) throw new Error('设备不存在')
  const dev = d.devices[idx]
  d.devices.splice(idx, 1)
  logOp(operator, 'DEVICE_DELETE', `Device#${dev.code}`, { code: dev.code, name: dev.name }, null)
  persist()
  return { ok: true }
}

export function listMaintains(deviceId) {
  const d = getDb()
  return clone(d.maintains.filter((x) => !deviceId || x.device_id === Number(deviceId)))
}

export function addMaintain(payload, operator) {
  const d = getDb()
  d.seq.maintain += 1
  const dev = d.devices.find((x) => x.id === Number(payload.device_id))
  const rec = {
    id: d.seq.maintain,
    device_id: Number(payload.device_id),
    device_code: dev ? dev.code : '',
    mtype: payload.mtype || 'care',
    operator: payload.operator || operator,
    cost: Number(payload.cost) || 0,
    content: payload.content || '',
    created_at: new Date().toISOString(),
  }
  d.maintains.unshift(rec)
  if (dev) dev.last_maintain_date = new Date().toISOString().slice(0, 10)
  logOp(operator, 'MAINTAIN_ADD', `Device#${rec.device_code}`, null, rec)
  persist()
  return clone(rec)
}

export function listPlans() {
  const d = getDb()
  return clone(
    d.plans.map((p) => ({
      ...p,
      route_name: d.routes.find((r) => r.id === p.route_id)?.name || '—',
    }))
  )
}

export function listTasks() {
  const d = getDb()
  return d.tasks.map((t) => {
    const route = d.routes.find((r) => r.id === t.route_id)
    return {
      ...t,
      route_name: route ? route.name : '',
      point_count: route ? route.point_ids.length : 0,
      record_count: d.records.filter((r) => r.task_id === t.id).length,
    }
  })
}

export function submitTask(id, payload, operator) {
  const d = getDb()
  const t = d.tasks.find((x) => x.id === Number(id))
  if (!t) throw new Error('任务不存在')
  const items = payload.items || []
  let abnormal = 0
  items.forEach((item) => {
    d.seq.record += 1
    const rec = {
      id: d.seq.record,
      task_id: t.id,
      point_id: item.point_id,
      is_abnormal: !!item.is_abnormal,
      result: item.result || {},
      remark: item.remark || '',
      created_at: new Date().toISOString(),
    }
    d.records.push(rec)
    if (rec.is_abnormal) {
      abnormal += 1
      const point = d.points.find((p) => p.id === rec.point_id)
      createWorkorder(
        {
          title: `巡检异常：${point ? point.name : '点位'} ${rec.remark || ''}`.slice(0, 60),
          order_type: 'inspection',
          device_id: point ? point.device_id : null,
          priority: 'mid',
          content: rec.remark,
        },
        operator,
      )
    }
  })
  t.status = abnormal > 0 ? 'abnormal' : 'done'
  t.executor = payload.executor || operator
  t.started_at = t.started_at || new Date().toISOString()
  t.finished_at = new Date().toISOString()
  logOp(operator, 'INSPECTION_SUBMIT', `Task#${t.id}`, null, { status: t.status, abnormal })
  persist()
  return clone({ ...t, abnormal })
}

export function listPoints() {
  return clone(getDb().points)
}
export function listRoutes() {
  const d = getDb()
  return d.routes.map((r) => ({
    ...r,
    points: r.point_ids.map((pid) => d.points.find((p) => p.id === pid)).filter(Boolean),
  }))
}
export function createPoint(payload, operator) {
  const d = getDb()
  d.seq.point += 1
  const p = {
    id: d.seq.point,
    name: payload.name || `巡检点-${d.seq.point}`,
    device_id: payload.device_id || null,
    device_code: payload.device_code || '',
    position_x: Number(payload.position_x) || 0,
    position_y: Number(payload.position_y) || 0,
    position_z: Number(payload.position_z) || 0,
    check_items: payload.check_items || ['温度正常', '无异响', '无漏液', '安全防护到位'],
  }
  d.points.push(p)
  logOp(operator, 'POINT_CREATE', `Point#${p.id}`, null, p)
  persist()
  return clone(p)
}
export function createRoute(payload, operator) {
  const d = getDb()
  const id = (d.routes.at(-1)?.id || 0) + 1
  const r = { id, name: payload.name || `巡检路线-${id}`, loop: payload.loop ?? true, point_ids: payload.point_ids || [] }
  d.routes.push(r)
  logOp(operator, 'ROUTE_CREATE', `Route#${id}`, null, r)
  persist()
  return clone(r)
}

/* ---------------- 能耗 ---------------- */
export function energySummary({ group = 'line', range = '7d' } = {}) {
  const d = getDb()
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1
  const buckets = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY)
    buckets.push(day.toISOString().slice(0, 10))
  }
  const keyOf = (dev) => {
    if (group === 'area') return dev.area_code
    if (group === 'device') return dev.code
    if (group === 'type') return dev.device_type
    return dev.line_code || '其他'
  }
  const groups = {}
  d.devices.forEach((dev) => {
    const k = keyOf(dev)
    if (!groups[k]) groups[k] = { name: k, total: 0, series: buckets.map(() => 0) }
    buckets.forEach((day, i) => {
      const seed = hash(dev.code + day)
      const h = dev.status === 'offline' ? 0 : 18 * (0.55 + seed * 0.4)
      const kwh = +(dev.rated_power * h).toFixed(2)
      groups[k].series[i] += kwh
      groups[k].total += kwh
    })
  })
  const list = Object.values(groups)
    .map((g) => ({ ...g, total: +g.total.toFixed(1), series: g.series.map((v) => +v.toFixed(1)) }))
    .sort((a, b) => b.total - a.total)
  return {
    buckets,
    groups: group === 'device' ? list.slice(0, 12) : list,
    total: +list.reduce((s, g) => s + g.total, 0).toFixed(1),
  }
}

/* ---------------- 场景配置 / 快照 / 日志 ---------------- */
export function getSceneConfig() {
  return clone(getDb().scene)
}
export function saveSceneConfig(payload, operator) {
  const d = getDb()
  const before = clone(d.scene)
  Object.assign(d.scene, payload, { updated_at: new Date().toISOString() })
  logOp(operator, 'SCENE_CONFIG_UPDATE', 'SceneConfig', before, payload)
  persist()
  return clone(d.scene)
}
export function listSnapshots() {
  return clone(getDb().snapshots)
}
export function saveSnapshot(payload, operator) {
  const d = getDb()
  d.seq.snapshot += 1
  const s = {
    id: d.seq.snapshot,
    name: payload.name || `快照-${d.seq.snapshot}`,
    camera_position: payload.camera_position,
    camera_target: payload.camera_target,
    layer_visible: payload.layer_visible || {},
    created_at: new Date().toISOString(),
  }
  d.snapshots.unshift(s)
  logOp(operator, 'SNAPSHOT_SAVE', `Snapshot#${s.id}`, null, { name: s.name })
  persist()
  return clone(s)
}
export function listLogs(params = {}) {
  return paginate(getDb().logs, params.page, params.page_size || 20)
}

/* ---------------- 报表 ---------------- */
export function alarmReport(range = '7d') {
  const d = getDb()
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1
  const since = Date.now() - days * DAY
  const list = d.alarms.filter((a) => new Date(a.created_at).getTime() >= since)
  const byDevice = {}
  list.forEach((a) => {
    byDevice[a.device_code] = byDevice[a.device_code] || { device_code: a.device_code, device_name: a.device_name, total: 0, critical: 0, warn: 0 }
    byDevice[a.device_code].total += 1
    byDevice[a.device_code][a.level] += 1
  })
  const closed = list.filter((a) => a.status === 'closed' && a.closed_at)
  const avgAck = closed.length
    ? closed.reduce((s, a) => s + (new Date(a.closed_at) - new Date(a.created_at)) / 60000, 0) / closed.length
    : 0
  const availableDevices = d.devices.filter((x) => x.status !== 'offline').length
  return {
    range,
    total: list.length,
    critical: list.filter((a) => a.level === 'critical').length,
    warn: list.filter((a) => a.level === 'warn').length,
    avg_close_minutes: +avgAck.toFixed(1),
    availability: +((availableDevices / d.devices.length) * 100).toFixed(2),
    by_device: Object.values(byDevice).sort((a, b) => b.total - a.total).slice(0, 15),
    rows: list.slice(0, 500).map((a) => ({
      created_at: a.created_at,
      device_code: a.device_code,
      device_name: a.device_name,
      level: a.level,
      code: a.code,
      content: a.content,
      status: a.status,
      ack_by: a.ack_by,
    })),
  }
}
