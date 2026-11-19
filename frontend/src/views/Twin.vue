<template>
  <div class="twin-wrap">
    <div ref="stageRef" class="twin-stage"></div>

    <!-- ================= 左上：视角 / 图层 / 工具 ================= -->
    <div class="view-dock">
      <div class="twin-hud view-bar">
        <button v-for="p in presets" :key="p.name" class="view-btn" :class="{ active: activePreset === p.name }" @click="applyPreset(p.name)">
          {{ p.label }}
        </button>
      </div>

      <div class="twin-hud layer-list">
        <div class="layer-item" v-for="l in layers" :key="l.key">
          <span class="lb"><el-icon :size="12"><component :is="l.icon" /></el-icon>{{ l.label }}</span>
          <el-switch :model-value="l.on" size="small" @change="(v) => toggleLayer(l.key, v)" />
        </div>
      </div>

      <div class="twin-hud view-bar">
        <button class="view-btn" :class="{ active: roaming }" @click="toggleRoam">
          <el-icon :size="12"><Position /></el-icon> 漫游
        </button>
        <button class="view-btn" @click="shot">截图</button>
        <button class="view-btn" @click="saveSnap">快照</button>
      </div>
    </div>

    <!-- ================= 右上：实时指标 ================= -->
    <div class="twin-hud live-box">
      <div class="lb">LIVE · {{ rtLabel }}</div>
      <div class="lv">
        <div><b class="mono">{{ counters.total }}</b><span>设备</span></div>
        <div><b class="mono ok">{{ counters.online }}</b><span>在线</span></div>
        <div><b class="mono bad">{{ counters.fault }}</b><span>故障</span></div>
        <div><b class="mono warn">{{ counters.active_alarms }}</b><span>告警</span></div>
      </div>
      <div class="ctl">
        <el-switch v-model="blinkOn" size="small" active-text="闪烁" @change="onBlink" />
        <el-switch v-model="postOn" size="small" active-text="辉光" @change="onPost" />
        <el-switch v-model="simOn" size="small" active-text="模拟" @change="onSim" />
      </div>
    </div>

    <!-- ================= 性能 HUD ================= -->
    <div class="perf-hud twin-hud" :class="{ collapsed: perfCollapsed }">
      <div class="ph-hd" @click="perfCollapsed = !perfCollapsed">
        <span>PERFORMANCE</span>
        <el-icon :size="11"><component :is="perfCollapsed ? 'ArrowUp' : 'ArrowDown'" /></el-icon>
      </div>
      <template v-if="!perfCollapsed">
        <div class="row"><span>FPS</span><b :class="fpsClass">{{ stats.fps }}</b></div>
        <div class="row"><span>DrawCall</span><b>{{ stats.drawCalls }}</b></div>
        <div class="row"><span>三角面</span><b>{{ triText }}</b></div>
        <div class="row"><span>几何/纹理</span><b>{{ stats.geometries }} / {{ stats.textures }}</b></div>
        <div class="row"><span>实例设备</span><b>{{ stats.instances }}</b></div>
        <div class="row"><span>拾取耗时</span><b>{{ stats.pickMs }}ms</b></div>
        <div class="row"><span>JS Heap</span><b>{{ stats.jsHeap }}MB</b></div>
        <div class="row" v-if="stats.degraded"><span class="fps-warn">已降级</span><b>—</b></div>
      </template>
    </div>

    <!-- ================= 悬浮 Tooltip ================= -->
    <div v-if="hover && hover.device" class="twin-tooltip" :style="{ left: hover.screen.x + 'px', top: hover.screen.y + 'px' }">
      <div class="tt-title">
        <span class="dot" :class="hover.device.status"></span>
        {{ hover.device.name }}
      </div>
      <div class="tt-metrics">
        <span>编码</span><b>{{ hover.device.code }}</b>
        <span>温度</span><b>{{ fmt(getMetric(hover.device.code, 'temperature'), '°C') }}</b>
        <span>{{ metricLabel(hover.device) }}</span>
        <b>{{ fmt(getMetric(hover.device.code, secondaryKey(hover.device)), '') }}</b>
        <span>状态</span><b>{{ statusLabel(hover.device.status) }}</b>
      </div>
    </div>

    <!-- ================= 设备抽屉 ================= -->
    <div v-if="selected" class="twin-drawer twin-hud">
      <div class="dr-hd">
        <div class="dr-top">
          <div>
            <div class="dr-code mono">{{ selected.code }}</div>
            <h3>{{ selected.name }}</h3>
          </div>
          <el-button text class="close-btn" @click="clearSelect"><el-icon><Close /></el-icon></el-button>
        </div>
        <div class="dr-tags">
          <span class="tag" :class="selected.status"><span class="dot" :class="selected.status"></span>{{ statusLabel(selected.status) }}</span>
          <span class="tag info">{{ typeLabel(selected.device_type) }}</span>
          <span v-if="selected.is_critical" class="tag stop">关键设备</span>
        </div>
      </div>

      <div class="dr-body">
        <div class="metric-grid">
          <div class="metric-cell" v-for="m in metricDefs(selected)" :key="m.key">
            <div class="lb">{{ m.label }}</div>
            <div class="vl">{{ fmt(getMetric(selected.code, m.key), m.unit) }}<span>{{ m.unit }}</span></div>
          </div>
        </div>

        <div class="dr-sec">
          <h4>台账信息</h4>
          <div class="kv"><span>所属区域</span><b>{{ selected.area_name }}</b></div>
          <div class="kv"><span>所属产线</span><b>{{ selected.line_code || '—' }}</b></div>
          <div class="kv"><span>额定功率</span><b>{{ selected.rated_power }} kW</b></div>
          <div class="kv"><span>最近保养</span><b>{{ selected.last_maintain_date || '—' }}</b></div>
          <div class="kv"><span>保养周期</span><b>{{ selected.maintain_cycle_days }} 天</b></div>
          <div class="kv"><span>三维坐标</span><b class="mono">{{ fmtCoord(selected) }}</b></div>
        </div>

        <div class="dr-sec">
          <h4>
            最近告警
            <router-link to="/alarm" class="more">全部</router-link>
          </h4>
          <div v-if="!deviceAlarms.length" class="empty">暂无告警记录</div>
          <div v-for="a in deviceAlarms.slice(0, 4)" :key="a.id" class="alarm-line">
            <span class="tag" :class="a.level">{{ a.level === 'critical' ? '紧急' : '警告' }}</span>
            <div class="al-text">
              <b>{{ a.content }}</b>
              <span>{{ timeAgo(a.created_at) }} · {{ a.status === 'active' ? '未处理' : a.status === 'acked' ? '已确认' : '已关闭' }}</span>
            </div>
          </div>
        </div>

        <div class="dr-sec">
          <h4>关联工单</h4>
          <div v-if="!deviceOrders.length" class="empty">暂无工单</div>
          <div v-for="o in deviceOrders.slice(0, 3)" :key="o.id" class="order-line">
            <div>
              <b>{{ o.title }}</b>
              <span class="mono">{{ o.order_no }}</span>
            </div>
            <span class="tag" :class="o.status === 'closed' ? 'normal' : o.status === 'pending' ? 'warn' : 'info'">
              {{ woStatusLabel(o.status) }}
            </span>
          </div>
        </div>
      </div>

      <div class="dr-ft">
        <el-button size="small" @click="focusSelected">定位</el-button>
        <el-button size="small" @click="createOrder" :disabled="auth.isGuest">建工单</el-button>
        <el-button size="small" :disabled="auth.isGuest" @click="command('stop')">停机</el-button>
        <el-button size="small" type="primary" :disabled="auth.isGuest" @click="command('start')">启动</el-button>
      </div>
    </div>

    <!-- ================= 告警浮层 ================= -->
    <div v-if="toast" class="alarm-toast" @click="$router.push('/alarm')">
      <div class="at-hd">
        <span class="dot fault"></span>
        {{ toast.level === 'critical' ? '紧急告警' : '告警提醒' }}
        <span class="mono" style="margin-left: auto; font-size: 10px; opacity: 0.6">{{ toast.device_code }}</span>
      </div>
      <div class="at-bd">{{ toast.content }}</div>
    </div>

    <!-- ================= 漫游提示 ================= -->
    <div v-if="roaming" class="roam-cross"></div>
    <div v-if="roaming" class="roam-tip twin-hud">WASD 移动 · 鼠标转向 · Shift 加速 · ESC 退出</div>

    <div v-if="!ready" class="loading-mask">
      <div class="ld-ring"></div>
      <p>正在装配三维场景…</p>
      <span>程序化厂房资产 · 实例化设备 · 材质池初始化</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { TwinScene } from '@/three/TwinScene'
import { simulator } from '@/mock/simulator'
import api, { runtime } from '@/api'
import { useDeviceStore } from '@/stores/device'
import { useAlarmStore } from '@/stores/alarm'
import { useAuthStore } from '@/stores/auth'
import { STATUS_META, DEVICE_TYPE_META } from '@/mock/seed'

const router = useRouter()
const route = useRoute()
const deviceStore = useDeviceStore()
const alarmStore = useAlarmStore()
const auth = useAuthStore()

const stageRef = ref(null)
const scene = shallowRef(null)
const ready = ref(false)
const hover = ref(null)
const selected = ref(null)
const deviceAlarms = ref([])
const deviceOrders = ref([])
const toast = ref(null)
const perfCollapsed = ref(false)
const blinkOn = ref(true)
const postOn = ref(true)
const simOn = ref(true)
const roaming = ref(false)
const activePreset = ref('overview')
const stats = ref({ fps: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, instances: 0, pickMs: 0, jsHeap: 0, degraded: false })
const presets = ref([])
const counters = computed(() => deviceStore.counters || {})

const layers = ref([
  { key: 'building', label: '建筑层', icon: 'OfficeBuilding', on: true },
  { key: 'device', label: '设备层', icon: 'Cpu', on: true },
  { key: 'label', label: '标注层', icon: 'ChatDotSquare', on: true },
  { key: 'effect', label: '特效层', icon: 'MagicStick', on: true },
  { key: 'helper', label: '辅助层', icon: 'Grid', on: false },
])

const rtLabel = computed(() => (simOn.value ? 'SIM 1.2s' : 'PAUSED'))
const triText = computed(() => (stats.value.triangles > 1000 ? (stats.value.triangles / 1000).toFixed(0) + 'k' : stats.value.triangles))
const fpsClass = computed(() => (stats.value.fps >= 50 ? 'fps-good' : stats.value.fps >= 30 ? 'fps-warn' : 'fps-bad'))

let unsub = null
let unsubSim = null
let statsTimer = null
let toastTimer = null
let escHandler = null

/* ---------------- 生命周期 ---------------- */
onMounted(async () => {
  await deviceStore.loadAll()
  const config = await api.scene.config()
  presets.value = config.camera_presets || []

  scene.value = new TwinScene(stageRef.value, {
    quality: window.matchMedia('(max-width: 900px)').matches ? 'low' : 'high',
    statusColors: config.status_colors,
    onHover: (h) => {
      hover.value = h
    },
    onSelect: (code) => {
      selected.value = code ? deviceStore.byCode[code] : null
      deviceStore.select(code)
      if (code) loadRelated(code)
      else {
        deviceAlarms.value = []
        deviceOrders.value = []
      }
    },
    onDoubleClick: (code) => {
      scene.value?.focusDevice(code)
    },
    onRoamChange: (locked) => {
      roaming.value = locked
      if (!locked) scene.value?.setPostEnabled(postOn.value)
    },
  })

  const lines = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  scene.value.setData(deviceStore.devices, lines, config)
  Object.entries(config.layer_visible || {}).forEach(([k, v]) => {
    const l = layers.value.find((x) => x.key === k)
    if (l) l.on = v
  })
  ready.value = true

  // 支持从台账 / 告警 / 平面图带参跳转：?code=M07 或 ?preset=top
  setTimeout(() => {
    if (route.query.preset) {
      activePreset.value = String(route.query.preset)
      scene.value?.flyToPreset(String(route.query.preset), { duration: 900 })
    }
    if (route.query.code) {
      const dev = deviceStore.byCode[String(route.query.code)]
      if (dev) {
        selected.value = dev
        scene.value?.select(dev.code)
        scene.value?.focusDevice(dev.code, { duration: 900 })
        loadRelated(dev.code)
      }
    }
  }, 420)

  if (runtime.mode !== 'http') simulator.start()
  // 实时通道：mock 由浏览器模拟器驱动，http 由后端轮询驱动，统一走 store 事件总线
  unsub = deviceStore.onLive((evt) => {
    if (evt.type !== 'tick') return
    evt.changed?.forEach(({ code, status }) => scene.value?.applyStatus(code, status))
    if (evt.alarms?.length) {
      showToast(evt.alarms[0])
      if (selected.value && evt.alarms[0].device_code === selected.value.code) loadRelated(selected.value.code)
    }
  })
  unsubSim = simulator.on((evt) => {
    if (evt.type === 'status' || evt.type === 'workorder') {
      if (selected.value) {
        selected.value = deviceStore.byCode[selected.value.code] || selected.value
        loadRelated(selected.value.code)
      }
    }
  })

  statsTimer = setInterval(() => {
    if (scene.value) stats.value = scene.value.stats
  }, 500)

  escHandler = (e) => {
    if (e.key === 'Escape') {
      if (roaming.value) scene.value?.exitRoam()
      else clearSelect()
    }
    if (e.code === 'KeyF' && !isTyping(e)) toggleRoam()
  }
  window.addEventListener('keydown', escHandler)
})

onBeforeUnmount(() => {
  unsub?.()
  unsubSim?.()
  clearInterval(statsTimer)
  clearTimeout(toastTimer)
  window.removeEventListener('keydown', escHandler)
  scene.value?.dispose()
  scene.value = null
})

/* ---------------- 交互 ---------------- */
function isTyping(e) {
  const t = e.target
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
}

function clearSelect() {
  selected.value = null
  scene.value?.select('')
  deviceStore.select('')
}

function applyPreset(name) {
  activePreset.value = name
  scene.value?.flyToPreset(name)
}

function toggleLayer(key, on) {
  const l = layers.value.find((x) => x.key === key)
  if (l) l.on = on
  scene.value?.setLayer(key, on)
}

function onBlink(v) {
  scene.value?.setBlinkEnabled(v)
}
function onPost(v) {
  scene.value?.setPostEnabled(v)
}
function onSim(v) {
  if (runtime.mode === 'http') return
  if (v) simulator.start()
  else simulator.stop()
}

function toggleRoam() {
  if (roaming.value) scene.value?.exitRoam()
  else {
    scene.value?.enterRoam()
    ElMessage.info('点击画面锁定鼠标，WASD 移动，ESC 退出')
  }
}

async function loadRelated(code) {
  const [alarms, orders] = await Promise.all([
    api.alarms.list({ device_code: code, page_size: 5, all: true }),
    api.workorders.list({ device_code: code, page_size: 5, all: true }),
  ])
  deviceAlarms.value = Array.isArray(alarms) ? alarms : alarms.results
  deviceOrders.value = Array.isArray(orders) ? orders : orders.results
}

function focusSelected() {
  if (selected.value) {
    scene.value?.focusDevice(selected.value.code)
    activePreset.value = ''
  }
}

function createOrder() {
  router.push({ path: '/workorder', query: { device: selected.value.code, create: '1' } })
}

async function command(cmd) {
  try {
    await api.devices.command(selected.value.code, cmd)
    ElMessage.success(`已下发指令：${cmd === 'stop' ? '停机' : '启动'}`)
    setTimeout(() => loadRelated(selected.value.code), 300)
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function showToast(a) {
  toast.value = a
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 5000)
}

function shot() {
  const url = scene.value.screenshot()
  const a = document.createElement('a')
  a.href = url
  a.download = `twin-${Date.now()}.png`
  a.click()
  ElMessage.success('已导出当前场景截图')
}

async function saveSnap() {
  try {
    const { value } = await ElMessageBox.prompt('给这个视角起个名字', '保存场景快照', {
      inputValue: `视角-${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
    await api.scene.saveSnapshot({ name: value, ...scene.value.getSnapshot() })
    ElMessage.success('快照已保存，可在场景配置页一键还原')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '保存失败')
  }
}

/* ---------------- 展示辅助 ---------------- */
const statusLabel = (s) => STATUS_META[s]?.label || s
const typeLabel = (t) => DEVICE_TYPE_META[t]?.label || t
const woStatusLabel = (s) => ({ pending: '待处理', assigned: '已指派', processing: '处理中', closed: '已闭环' })[s] || s

function getMetric(code, key) {
  const live = deviceStore.live[code]
  return live ? live[key] : undefined
}
const fmt = (v, unit = '') => (v === undefined || v === null ? '—' : Number(v).toFixed(unit === '' ? 0 : 1))
const fmtCoord = (d) => `${d.position_x?.toFixed?.(1)}, ${d.position_y?.toFixed?.(1)}, ${d.position_z?.toFixed?.(1)}`

function secondaryKey(d) {
  if (d.device_type === 'sensor') return 'vibration'
  if (d.device_type === 'agv') return 'battery'
  if (d.device_type === 'robot') return 'current'
  return 'speed'
}
function metricLabel(d) {
  return { sensor: '振动', agv: '电量', robot: '电流' }[d.device_type] || '转速'
}

function metricDefs(d) {
  const map = {
    temperature: { key: 'temperature', label: '温度', unit: '°C' },
    speed: { key: 'speed', label: d.device_type === 'agv' ? '车速' : '转速', unit: d.device_type === 'agv' ? 'm/s' : 'rpm' },
    current: { key: 'current', label: '电流', unit: 'A' },
    vibration: { key: 'vibration', label: '振动', unit: 'mm/s' },
    battery: { key: 'battery', label: '电量', unit: '%' },
    output: { key: 'output', label: '节拍', unit: '件/h' },
  }
  const sets = {
    machine: ['temperature', 'speed', 'current', 'output'],
    robot: ['temperature', 'current', 'speed', 'output'],
    sensor: ['temperature', 'vibration', 'current', 'output'],
    gauge: ['temperature', 'speed', 'current', 'output'],
    agv: ['battery', 'speed', 'temperature', 'current'],
  }
  return (sets[d.device_type] || sets.machine).map((k) => map[k])
}

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return `${Math.floor(d)} 秒前`
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`
  return `${Math.floor(d / 86400)} 天前`
}

watch(
  () => deviceStore.selectedCode,
  (code) => {
    if (code && (!selected.value || selected.value.code !== code)) {
      selected.value = deviceStore.byCode[code] || null
    }
  },
)
</script>

<style scoped>
.twin-wrap {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #080a0f;
}

.live-box {
  position: absolute;
  right: 14px;
  top: 14px;
  padding: 9px 13px;
  z-index: 8;
  min-width: 214px;
}
.live-box .lb {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  color: #5f7d9e;
  font-family: var(--mono);
  margin-bottom: 6px;
}
.live-box .lv {
  display: flex;
  gap: 15px;
}
.live-box .lv div {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.live-box .lv b {
  font-size: 16px;
  font-weight: 500;
  color: #e6edf3;
}
.live-box .lv b.ok {
  color: #56d364;
}
.live-box .lv b.bad {
  color: #ff7b72;
}
.live-box .lv b.warn {
  color: #e3b341;
}
.live-box .lv span {
  font-size: 9.5px;
  color: var(--txt-3);
}
.live-box .ctl {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(70, 90, 115, 0.22);
}
:deep(.el-switch__label) {
  font-size: 10.5px;
  color: var(--txt-3);
}
:deep(.el-switch__label.is-active) {
  color: #9aa7b6;
}

.perf-hud.collapsed {
  width: 150px;
}
.ph-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  color: #5f7d9e;
  cursor: pointer;
  margin-bottom: 5px;
}

/* 抽屉 */
.dr-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.dr-code {
  font-size: 10.5px;
  color: #5f7d9e;
  letter-spacing: 0.06em;
}
.dr-hd h3 {
  margin: 2px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.close-btn {
  color: var(--txt-3);
  padding: 2px;
}
.dr-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.dr-sec {
  margin-top: 16px;
}
.dr-sec h4 {
  font-size: 11px;
  color: var(--txt-3);
  font-weight: 500;
  margin: 0 0 8px;
  letter-spacing: 0.04em;
  display: flex;
  justify-content: space-between;
}
.dr-sec h4 .more {
  font-size: 10.5px;
  color: #5f7d9e;
}
.kv {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.kv span {
  color: var(--txt-3);
}
.kv b {
  font-weight: 500;
  color: #d3dde8;
}
.empty {
  font-size: 11px;
  color: #4d5b6b;
  padding: 6px 0;
}
.alarm-line {
  display: flex;
  gap: 7px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.al-text {
  min-width: 0;
}
.al-text b {
  font-size: 11px;
  font-weight: 400;
  color: #cfdae6;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.al-text span {
  font-size: 10px;
  color: #4d5b6b;
}
.order-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.order-line b {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: #cfdae6;
}
.order-line span.mono {
  font-size: 9.5px;
  color: #4d5b6b;
}

/* 加载 */
.loading-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #080a0f;
  color: var(--txt-2);
}
.loading-mask p {
  margin: 6px 0 0;
  font-size: 12.5px;
}
.loading-mask span {
  font-size: 10.5px;
  color: #4d5b6b;
  font-family: var(--mono);
}
.ld-ring {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(47, 129, 247, 0.18);
  border-top-color: #2f81f7;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
