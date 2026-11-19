/**
 * 统一 API 门面
 * ------------------------------------------------------------------
 * 两种数据源，接口形状完全一致：
 *   - mock：浏览器内数据层（默认，零依赖演示）
 *   - http：真实 Django + DRF 后端（VITE_DATA_SOURCE=http 或本地开关）
 *
 * 业务组件永远只调 api.xxx，不关心数据从哪来。
 */
import * as db from '@/mock/db'
import { simulator } from '@/mock/simulator'

const LS_SOURCE = 'ft-twin-source'
const LS_TOKEN = 'ft-twin-token'
const LS_SESSION = 'ft-twin-session'

export const runtime = {
  mode: import.meta.env.VITE_DATA_SOURCE || localStorage.getItem(LS_SOURCE) || 'mock',
  apiBase: import.meta.env.VITE_API_BASE || '/api',
}

export function setSource(mode) {
  runtime.mode = mode
  localStorage.setItem(LS_SOURCE, mode)
  // 两种数据源的 token 互不通用，切换后必须重新登录
  localStorage.removeItem(LS_TOKEN)
  localStorage.removeItem(LS_SESSION)
}

export function getToken() {
  return localStorage.getItem(LS_TOKEN) || ''
}
export function setToken(t) {
  if (t) localStorage.setItem(LS_TOKEN, t)
  else {
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_SESSION)
  }
}

/** 真实后端只回 token 字符串，角色等声明单独存一份，供守卫与 UI 使用 */
export function setSession(claims) {
  if (claims) localStorage.setItem(LS_SESSION, JSON.stringify(claims))
  else localStorage.removeItem(LS_SESSION)
}
function readSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION) || 'null')
  } catch {
    return null
  }
}

function delay(ms = 90) {
  return new Promise((r) => setTimeout(r, ms))
}

/** DRF 分页响应统一解包，让 http 与 mock 的返回形状一致 */
function unwrap(r) {
  if (Array.isArray(r)) return r
  if (r && Array.isArray(r.results)) return r.results
  return []
}

/* ---------------- HTTP 通道 ---------------- */
async function http(path, { method = 'GET', body, params } = {}) {
  const url = new URL(runtime.apiBase + path, window.location.origin)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.detail || `请求失败 ${res.status}`)
    err.code = data.code || res.status
    err.status = res.status
    throw err
  }
  return data
}

/* ---------------- 角色与权限（前端侧仅做 UX 提示，后端强制校验） ---------------- */
export const ROLES = {
  guest: { key: 'guest', label: '访客（只读）', perms: ['read'] },
  operator: { key: 'operator', label: '运维人员', perms: ['read', 'alarm', 'workorder', 'inspection'] },
  admin: { key: 'admin', label: '管理员', perms: ['read', 'alarm', 'workorder', 'inspection', 'device', 'scene', 'audit'] },
}

const DEMO_USERS = {
  admin: { password: 'admin123', name: 'admin', role: 'admin' },
  operator: { password: 'operator123', name: 'operator', role: 'operator' },
  demo: { password: 'demo', name: 'demo', role: 'guest' },
}

function issueToken(user) {
  return `mock.${btoa(unescape(encodeURIComponent(JSON.stringify({ sub: user.name, role: user.role, iat: Date.now() }))))}`
}
export function parseToken(token = getToken()) {
  try {
    if (token && token.startsWith('mock.')) {
      return JSON.parse(decodeURIComponent(escape(atob(token.split('.').slice(1).join('.')))))
    }
  } catch {
    /* 落到会话声明 */
  }
  // 真实后端：token 为不透明字符串，声明取自登录响应
  return token ? readSession() : null
}
function guard(perm) {
  const claims = parseToken()
  if (!claims) {
    const e = new Error('未登录或登录已过期')
    e.code = 401
    throw e
  }
  const role = ROLES[claims.role]
  if (perm && role && !role.perms.includes(perm)) {
    const e = new Error(`当前角色（${role.label}）无此操作权限`)
    e.code = 403
    throw e
  }
  return claims
}

/* ---------------- 对外接口 ---------------- */
export const api = {
  runtime,

  /* ---- 认证 ---- */
  auth: {
    async login(username, password) {
      if (runtime.mode === 'http') {
        const data = await http('/auth/login/', { method: 'POST', body: { username, password } })
        setToken(data.access)
        setSession({ sub: data.username, role: data.role, iat: Date.now() })
        return data
      }
      await delay(220)
      const u = DEMO_USERS[username]
      if (!u || u.password !== password) {
        const e = new Error('账号或密码错误')
        e.code = 'AUTH_FAILED'
        throw e
      }
      const token = issueToken(u)
      setToken(token)
      db.logOp(u.name, 'LOGIN', 'session', null, { role: u.role })
      return { access: token, username: u.name, role: u.role }
    },
    async demo() {
      if (runtime.mode === 'http') {
        const data = await http('/auth/demo/', { method: 'POST' })
        setToken(data.access)
        setSession({ sub: data.username, role: data.role, iat: Date.now() })
        return data
      }
      await delay(120)
      const token = issueToken(DEMO_USERS.demo)
      setToken(token)
      return { access: token, username: 'demo', role: 'guest' }
    },
    logout() {
      setToken('')
    },
    me() {
      return parseToken()
    },
  },

  /* ---- 概览 ---- */
  overview: {
    async stats() {
      if (runtime.mode === 'http') return http('/overview/stats/')
      await delay(60)
      return { ...db.overviewStats(), counters: simulator.snapshotCounters() }
    },
    async trend(range = '24h') {
      if (runtime.mode === 'http') return http('/overview/trend/', { params: { range } })
      await delay(40)
      return db.alarmTrend(range)
    },
  },

  /* ---- 设备 ---- */
  devices: {
    async list(params) {
      if (runtime.mode === 'http') return http('/devices/', { params })
      await delay(70)
      return db.listDevices(params)
    },
    async all() {
      if (runtime.mode === 'http') {
        const r = await http('/devices/', { params: { page_size: 1000 } })
        return r.results
      }
      return db.listDevices({ all: true })
    },
    async get(id) {
      if (runtime.mode === 'http') return http(`/devices/${id}/`)
      const all = db.listDevices({ all: true })
      const d = all.find((x) => String(x.id) === String(id))
      if (!d) throw new Error('设备不存在')
      return { ...d, metrics: simulator.getMetrics(d.code), overdue_days: Math.max(0, require_overdue(d)) }
    },
    async tree() {
      if (runtime.mode === 'http') return http('/devices/tree/')
      await delay(50)
      return db.deviceTree()
    },
    async statuses() {
      if (runtime.mode === 'http') return http('/devices/status/')
      return db.statusMap()
    },
    async live() {
      if (runtime.mode === 'http') return http('/devices/live/')
      return { items: [], counters: simulator.snapshotCounters(), ts: Date.now() }
    },
    async metrics(id, params = {}) {
      if (runtime.mode === 'http') return http(`/devices/${id}/metrics/`, { params })
      const all = db.listDevices({ all: true })
      const d = all.find((x) => String(x.id) === String(id))
      const key = params.key || 'temperature'
      const live = simulator.getHistory(d.code).map((p) => ({ t: p.t, value: p[key] }))
      const hist = db.seriesFor(d.code, key, params.range || '1h')
      return { key, unit: { temperature: '°C', speed: 'rpm', current: 'A', vibration: 'mm/s', battery: '%' }[key], history: hist, live }
    },
    async save(payload) {
      if (runtime.mode === 'http') {
        return payload.id ? http(`/devices/${payload.id}/`, { method: 'PUT', body: payload }) : http('/devices/', { method: 'POST', body: payload })
      }
      const claims = guard('device')
      await delay(120)
      return db.upsertDevice(payload, claims.sub)
    },
    async remove(id) {
      if (runtime.mode === 'http') return http(`/devices/${id}/`, { method: 'DELETE' })
      const claims = guard('device')
      await delay(100)
      return db.deleteDevice(id, claims.sub)
    },
    async maintains(id) {
      if (runtime.mode === 'http') return unwrap(await http('/maintains/', { params: { device: id } }))
      return db.listMaintains(id)
    },
    /** 指令下发（F-RT-03）：start / stop / reset */
    async command(code, cmd) {
      if (runtime.mode === 'http') return http(`/devices/${code}/command/`, { method: 'POST', body: { cmd } })
      const claims = guard('workorder')
      await delay(120)
      const next = { start: 'normal', stop: 'stop', reset: 'normal' }[cmd] || 'normal'
      db.setDeviceStatus(code, next, `平台下发指令 ${cmd}`, claims.sub)
      db.logOp(claims.sub, 'DEVICE_COMMAND', `Device#${code}`, null, { cmd, to: next })
      simulator.emit({ type: 'status', code, status: next, reason: `指令 ${cmd}` })
      return { ok: true, code, status: next }
    },
    /** 状态流水（状态回放数据源） */
    async statusLogs(params = {}) {
      if (runtime.mode === 'http') return unwrap(await http('/devices/status-logs/', { params }))
      return JSON.parse(JSON.stringify(db.getDb().statusLogs || []))
    },
    async addMaintain(payload) {
      if (runtime.mode === 'http') return http('/maintains/', { method: 'POST', body: payload })
      const claims = guard('device')
      return db.addMaintain(payload, claims.sub)
    },
  },

  /* ---- 告警 ---- */
  alarms: {
    async list(params) {
      if (runtime.mode === 'http') return http('/alarms/', { params })
      await delay(60)
      return db.listAlarms(params)
    },
    async ack(id) {
      if (runtime.mode === 'http') return http(`/alarms/${id}/ack/`, { method: 'POST' })
      const claims = guard('alarm')
      await delay(80)
      const r = db.ackAlarm(id, claims.sub)
      simulator.emit({ type: 'alarm-ack', alarm: r })
      return r
    },
    async close(id) {
      if (runtime.mode === 'http') return http(`/alarms/${id}/close/`, { method: 'POST' })
      const claims = guard('alarm')
      await delay(80)
      const r = db.closeAlarm(id, claims.sub)
      simulator.emit({ type: 'alarm-close', alarm: r })
      return r
    },
    async batchAck(ids) {
      if (runtime.mode === 'http') return http('/alarms/batch_ack/', { method: 'POST', body: { ids } })
      const claims = guard('alarm')
      const out = []
      ids.forEach((id) => {
        try {
          out.push(db.ackAlarm(id, claims.sub))
        } catch (e) {
          /* 跳过不可确认项 */
        }
      })
      simulator.emit({ type: 'alarm-ack', batch: out })
      return out
    },
    async rules() {
      if (runtime.mode === 'http') return http('/alarm-rules/')
      return JSON.parse(JSON.stringify(db.getDb().alarmRules))
    },
    async saveRules(rules) {
      if (runtime.mode === 'http') return http('/alarm-rules/', { method: 'PUT', body: rules })
      const claims = guard('scene')
      db.getDb().alarmRules = rules
      db.logOp(claims.sub, 'ALARM_RULE_UPDATE', 'AlarmRule', null, { count: rules.length })
      db.persist()
      return rules
    },
    /** 演示用：手动注入一条故障 */
    async injectFault(code) {
      const claims = parseToken()
      if (!claims || claims.role === 'guest') {
        const e = new Error('只读账号不能注入故障')
        e.code = 403
        throw e
      }
      const alarm = simulator.triggerFault(code)
      return alarm
    },
  },

  /* ---- 工单 ---- */
  workorders: {
    async list(params) {
      if (runtime.mode === 'http') return http('/workorders/', { params })
      await delay(60)
      return db.listWorkorders(params)
    },
    async create(payload) {
      if (runtime.mode === 'http') return http('/workorders/', { method: 'POST', body: payload })
      const claims = guard('workorder')
      await delay(120)
      const r = db.createWorkorder(payload, claims.sub)
      simulator.emit({ type: 'workorder', order: r })
      return r
    },
    async transition(id, to, payload = {}) {
      if (runtime.mode === 'http') return http(`/workorders/${id}/transition/`, { method: 'POST', body: { to, ...payload } })
      const claims = guard('workorder')
      await delay(120)
      const r = db.transitionWorkorder(id, to, payload, claims.sub)
      simulator.emit({ type: 'workorder', order: r })
      return r
    },
  },

  /* ---- 巡检 ---- */
  inspection: {
    async tasks() {
      if (runtime.mode === 'http') return unwrap(await http('/inspection/tasks/'))
      return db.listTasks()
    },
    async submit(id, payload) {
      if (runtime.mode === 'http') return http(`/inspection/tasks/${id}/submit/`, { method: 'POST', body: payload })
      const claims = guard('inspection')
      await delay(140)
      return db.submitTask(id, payload, claims.sub)
    },
    async points() {
      if (runtime.mode === 'http') return unwrap(await http('/inspection/points/'))
      return db.listPoints()
    },
    async plans() {
      if (runtime.mode === 'http') return unwrap(await http('/inspection/plans/'))
      return db.listPlans ? db.listPlans() : []
    },
    async routes() {
      if (runtime.mode === 'http') return unwrap(await http('/inspection/routes/'))
      return db.listRoutes()
    },
    async createPoint(payload) {
      if (runtime.mode === 'http') return http('/inspection/points/', { method: 'POST', body: payload })
      const claims = guard('device')
      return db.createPoint(payload, claims.sub)
    },
    async createRoute(payload) {
      if (runtime.mode === 'http') return http('/inspection/routes/', { method: 'POST', body: payload })
      const claims = guard('device')
      return db.createRoute(payload, claims.sub)
    },
  },

  /* ---- 能耗 / 报表 ---- */
  energy: {
    async summary(params) {
      if (runtime.mode === 'http') return http('/energy/summary/', { params })
      await delay(70)
      return db.energySummary(params)
    },
  },
  report: {
    async alarm(range = '7d') {
      if (runtime.mode === 'http') return http('/report/alarm/', { params: { range } })
      await delay(80)
      return db.alarmReport(range)
    },
  },

  /* ---- 场景配置 ---- */
  scene: {
    async config() {
      if (runtime.mode === 'http') return http('/scene/config/')
      return db.getSceneConfig()
    },
    async saveConfig(payload) {
      if (runtime.mode === 'http') return http('/scene/config/', { method: 'PUT', body: payload })
      const claims = guard('scene')
      return db.saveSceneConfig(payload, claims.sub)
    },
    async snapshots() {
      if (runtime.mode === 'http') return http('/scene/snapshot/')
      return db.listSnapshots()
    },
    async saveSnapshot(payload) {
      if (runtime.mode === 'http') return http('/scene/snapshot/', { method: 'POST', body: payload })
      const claims = parseToken()
      return db.saveSnapshot(payload, claims?.sub || 'guest')
    },
  },

  /* ---- 审计 ---- */
  logs: {
    async list(params) {
      if (runtime.mode === 'http') return http('/logs/', { params })
      const claims = guard('audit')
      return db.listLogs(params)
    },
  },

  /* ---- 开发辅助 ---- */
  dev: {
    reset() {
      db.resetDb()
      simulator.bootstrap()
      return true
    },
    simulator,
    statusLogs() {
      return db.getDb().statusLogs || []
    },
  },
}

function require_overdue(d) {
  if (!d.last_maintain_date) return 0
  const due = new Date(d.last_maintain_date)
  due.setDate(due.getDate() + (d.maintain_cycle_days || 90))
  return Math.floor((Date.now() - due.getTime()) / 86400000)
}

export { simulator }
export default api
