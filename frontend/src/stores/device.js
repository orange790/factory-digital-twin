import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import api from '@/api'
import { simulator } from '@/mock/simulator'

export const useDeviceStore = defineStore('device', () => {
  const devices = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  const tree = ref([])
  const live = shallowRef({}) // code -> metrics（高频，放 shallowRef 避免深层响应式开销）
  /** 实时快照帧缓冲（两种数据源统一），供热力图时间轴与回放使用 */
  const frames = shallowRef([])
  const FRAME_LIMIT = 90

  function pushFrame(data, t = Date.now()) {
    const next = frames.value.concat({ t, data })
    frames.value = next.length > FRAME_LIMIT ? next.slice(next.length - FRAME_LIMIT) : next
  }

  /** 实时事件总线：mock 来自浏览器模拟器，http 来自 /devices/live/ 轮询 */
  const liveSubs = new Set()
  function onLive(fn) {
    liveSubs.add(fn)
    return () => liveSubs.delete(fn)
  }
  function emitLive(payload) {
    liveSubs.forEach((fn) => {
      try {
        fn(payload)
      } catch (e) {
        console.error(e)
      }
    })
  }
  const counters = ref({ total: 0, online: 0, fault: 0, stop: 0, active_alarms: 0, pending_orders: 0 })
  const selectedCode = ref('')
  const statusVersion = ref(0)
  const focusRequest = ref(null) // { code, ts } —— 3D 场景监听后飞行
  const openDetailRequest = ref(null)

  const byCode = computed(() => {
    const m = {}
    devices.value.forEach((d) => (m[d.code] = d))
    return m
  })
  const statusOf = (code) => byCode.value[code]?.status || 'offline'
  const faultDevices = computed(() => devices.value.filter((d) => d.status === 'fault'))
  const criticalDevices = computed(() => devices.value.filter((d) => d.is_critical))

  async function loadAll(force = false) {
    if (loaded.value && !force) return devices.value
    loading.value = true
    try {
      devices.value = await api.devices.all()
      tree.value = await api.devices.tree()
      loaded.value = true
      if (api.runtime.mode === 'http') {
        await refreshLive()
      } else {
        const l = {}
        devices.value.forEach((d) => (l[d.code] = simulator.getMetrics(d.code)))
        live.value = l
        counters.value = simulator.snapshotCounters()
      }
    } finally {
      loading.value = false
    }
    return devices.value
  }

  /** http 模式下的实时快照（无 MQTT 时由 App 定时轮询调用） */
  async function refreshLive() {
    const snap = await api.devices.live()
    const l = { ...live.value }
    const changed = []
    ;(snap.items || []).forEach((it) => {
      l[it.code] = {
        temperature: it.temperature,
        current: it.current,
        speed: it.speed,
        vibration: it.vibration,
        battery: it.battery,
        output: it.output,
      }
      const d = byCode.value[it.code]
      if (d && it.status && d.status !== it.status) {
        d.status = it.status
        changed.push({ code: it.code, status: it.status })
      }
    })
    live.value = l
    pushFrame(l, snap.ts)
    if (snap.counters) counters.value = { ...counters.value, ...snap.counters }
    if (changed.length) statusVersion.value += 1
    emitLive({ type: 'tick', live: l, counters: counters.value, changed })
    return snap
  }

  /** MQTT 单设备上报（telemetry / status），与轮询共用同一套状态更新逻辑 */
  function applyTelemetry(msg) {
    const code = msg?.code
    if (!code) return
    const keys = ['temperature', 'current', 'speed', 'vibration', 'battery', 'output']
    const l = { ...live.value }
    const cur = { ...(l[code] || {}) }
    let hasMetric = false
    keys.forEach((k) => {
      if (msg[k] !== undefined && msg[k] !== null) {
        cur[k] = msg[k]
        hasMetric = true
      }
    })
    l[code] = cur
    live.value = l
    if (hasMetric) pushFrame(l, msg.ts ? msg.ts * 1000 : Date.now())

    const changed = []
    const d = byCode.value[code]
    if (d && msg.status && d.status !== msg.status) {
      d.status = msg.status
      changed.push({ code, status: msg.status })
      statusVersion.value += 1
    }
    emitLive({ type: 'tick', live: l, counters: counters.value, changed })
  }

  async function refreshTree() {
    tree.value = await api.devices.tree()
  }

  async function reload() {
    return loadAll(true)
  }

  function applyTick(evt) {
    live.value = Object.fromEntries(simulator.live)
    pushFrame(live.value)
    counters.value = evt?.counters || simulator.snapshotCounters()
    if (evt?.changed?.length) {
      evt.changed.forEach(({ code, status }) => {
        const d = byCode.value[code]
        if (d) d.status = status
      })
      statusVersion.value += 1
    }
    emitLive({ type: 'tick', live: live.value, counters: counters.value, alarms: evt?.alarms })
  }

  function select(code) {
    selectedCode.value = code || ''
  }
  function focus(code) {
    focusRequest.value = { code, ts: Date.now() }
    selectedCode.value = code
  }
  function openDetail(code) {
    openDetailRequest.value = { code, ts: Date.now() }
  }

  function patchDevice(payload) {
    const d = byCode.value[payload.code]
    if (d) Object.assign(d, payload)
    statusVersion.value += 1
  }

  return {
    devices,
    loading,
    loaded,
    tree,
    live,
    frames,
    counters,
    selectedCode,
    statusVersion,
    focusRequest,
    openDetailRequest,
    byCode,
    statusOf,
    faultDevices,
    criticalDevices,
    loadAll,
    reload,
    refreshLive,
    applyTelemetry,
    onLive,
    refreshTree,
    applyTick,
    select,
    focus,
    openDetail,
    patchDevice,
  }
})
