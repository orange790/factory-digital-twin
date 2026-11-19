<template>
  <div class="bs">
    <header class="bs-hd">
      <div class="hd-l">
        <span class="dot normal"></span>
        <span class="mono">FT-TWIN · DIGITAL TWIN OPS</span>
      </div>
      <h1>小型工厂数字孪生运维平台</h1>
      <div class="hd-r">
        <span class="mono">{{ clock }}</span>
        <el-button text size="small" class="exit" @click="$router.push('/')">退出大屏</el-button>
      </div>
    </header>

    <div class="bs-body">
      <aside class="col left">
        <div class="kpi-grid">
          <div class="kpi" v-for="k in kpis" :key="k.label">
            <span>{{ k.label }}</span>
            <b class="mono" :class="k.tone">{{ k.value }}</b>
            <i>{{ k.unit }}</i>
          </div>
        </div>

        <div class="bs-panel">
          <div class="bp-hd">设备类型构成</div>
          <EChart :option="typeOption" height="180px" />
        </div>

        <div class="bs-panel">
          <div class="bp-hd">状态分布</div>
          <div class="status-bars">
            <div v-for="s in statusList" :key="s.status" class="sb-row">
              <span class="sb-label">{{ label(s.status) }}</span>
              <div class="sb-track"><i :style="{ width: pct(s.count) + '%', background: color(s.status) }"></i></div>
              <b class="mono">{{ s.count }}</b>
            </div>
          </div>
        </div>
      </aside>

      <main class="center">
        <div ref="stageRef" class="stage"></div>
        <div class="stage-legend">
          <span v-for="s in ['normal', 'fault', 'stop', 'offline']" :key="s">
            <i :style="{ background: color(s) }"></i>{{ label(s) }}
          </span>
        </div>
      </main>

      <aside class="col right">
        <div class="bs-panel grow">
          <div class="bp-hd">
            实时告警
            <span class="mono">{{ alarmStore.activeCount }} 条未处理</span>
          </div>
          <div class="alarm-list">
            <div v-for="a in rolling" :key="a.id" class="al-item" :class="a.level">
              <div class="al-top">
                <span class="tag" :class="a.level">{{ a.level === 'critical' ? '紧急' : '警告' }}</span>
                <span class="mono">{{ a.device_code }}</span>
                <span class="al-time">{{ time(a.created_at) }}</span>
              </div>
              <p>{{ a.content }}</p>
            </div>
            <div v-if="!rolling.length" class="al-empty">全部设备运行正常</div>
          </div>
        </div>

        <div class="bs-panel">
          <div class="bp-hd">待办工单</div>
          <div v-for="o in orders.slice(0, 4)" :key="o.id" class="wo-item">
            <b>{{ o.title }}</b>
            <span class="mono">{{ label2(o.status) }}</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import EChart from '@/components/EChart.vue'
import api from '@/api'
import { TwinScene } from '@/three/TwinScene'
import { useDeviceStore } from '@/stores/device'
import { useAlarmStore } from '@/stores/alarm'
import { STATUS_META } from '@/mock/seed'

const stageRef = ref(null)
const scene = shallowRef(null)
const deviceStore = useDeviceStore()
const alarmStore = useAlarmStore()
const stats = ref({})
const orders = ref([])
const clock = ref('')
const rolling = ref([])
const typeOption = shallowRef({})

let clockTimer = null
let rollTimer = null
let statTimer = null
let rollIndex = 0
let unsub = null

const color = (s) => STATUS_META[s]?.color || '#8B949E'
const label = (s) => STATUS_META[s]?.label || s
const label2 = (s) => ({ pending: '待处理', assigned: '已指派', processing: '处理中', closed: '已闭环' }[s] || s)
const statusList = computed(() => stats.value.by_status || [])
const pct = (n) => Math.round((n / (stats.value.total || 1)) * 100)

const kpis = computed(() => [
  { label: '设备总数', value: stats.value.total || 0, unit: '台', tone: '' },
  { label: '在线率', value: `${stats.value.online_rate || 0}%`, unit: '', tone: 'ok' },
  { label: '故障设备', value: stats.value.fault || 0, unit: '台', tone: 'bad' },
  { label: '未处理告警', value: stats.value.active_alarms || 0, unit: '条', tone: 'warn' },
])

function buildTypeOption(s) {
  const by = s.by_type || []
  const names = { machine: '机床', robot: '机械臂', sensor: '传感器', gauge: '检测仪', agv: 'AGV' }
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8 },
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '50%'],
        label: { color: '#8fa3b8', fontSize: 10, formatter: '{b}\n{c}' },
        labelLine: { length: 6, length2: 6, lineStyle: { color: '#2b3a4d' } },
        data: by.map((x, i) => ({
          name: names[x.type] || x.type,
          value: x.count,
          itemStyle: { color: ['#2f81f7', '#22d3ee', '#3fb950', '#d29922', '#a371f7'][i % 5] },
        })),
      },
    ],
  }
}

function roll() {
  const list = alarmStore.active
  if (!list.length) {
    rolling.value = []
    return
  }
  rollIndex = (rollIndex + 3) % Math.max(1, list.length)
  const arr = []
  for (let i = 0; i < Math.min(4, list.length); i++) arr.push(list[(rollIndex + i) % list.length])
  rolling.value = arr
}

async function loadStats() {
  stats.value = await api.overview.stats()
  typeOption.value = buildTypeOption(stats.value)
  const r = await api.workorders.list({ page_size: 20, all: true })
  orders.value = (Array.isArray(r) ? r : r.results).filter((o) => o.status !== 'closed')
}

onMounted(async () => {
  await deviceStore.loadAll()
  const config = await api.scene.config()
  scene.value = new TwinScene(stageRef.value, { quality: 'high', statusColors: config.status_colors })
  const lines = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  scene.value.setData(deviceStore.devices, lines, config)
  scene.value.flyToPreset('overview', { duration: 1200 })

  // 缓慢自转，大屏更有"活着"的感觉
  scene.value.onFrame((dt) => {
    if (scene.value?.cameraFly.flying || scene.value?.roaming) return
    const { controls } = scene.value.cameraApi
    const r = Math.hypot(controls.object?.position.x ?? 0, 0)
    const c = scene.value.cameraApi.camera
    const radius = Math.hypot(c.position.x, c.position.z)
    const angle = Math.atan2(c.position.z, c.position.x) + dt * 0.035
    c.position.x = Math.cos(angle) * radius
    c.position.z = Math.sin(angle) * radius
    controls.update()
  })

  await Promise.all([loadStats(), alarmStore.loadActive()])
  roll()
  clockTimer = setInterval(() => {
    clock.value = new Date().toLocaleString('zh-CN', { hour12: false })
  }, 1000)
  clock.value = new Date().toLocaleString('zh-CN', { hour12: false })
  rollTimer = setInterval(roll, 4200)
  statTimer = setInterval(loadStats, 4000)
  unsub = deviceStore.onLive((evt) => {
    if (evt.type === 'tick') {
      evt.changed?.forEach(({ code, status }) => scene.value?.applyStatus(code, status))
    }
  })
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(rollTimer)
  clearInterval(statTimer)
  unsub?.()
  scene.value?.dispose()
  scene.value = null
})

const time = (iso) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
</script>

<style scoped>
.bs {
  height: 100%;
  background: radial-gradient(1200px 700px at 50% 0%, #0c1723 0%, #06080c 70%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bs-hd {
  height: 58px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid rgba(47, 129, 247, 0.18);
  background: linear-gradient(180deg, rgba(15, 27, 43, 0.9), rgba(8, 12, 18, 0.6));
  position: relative;
}
.bs-hd::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -1px;
  width: 420px;
  height: 2px;
  transform: translateX(-50%);
  background: linear-gradient(90deg, transparent, #2f81f7, transparent);
}
.bs-hd h1 {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: #d8e8f8;
  text-shadow: 0 0 18px rgba(47, 129, 247, 0.5);
  white-space: nowrap;
}
.hd-l,
.hd-r {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  color: #5f7d9e;
  letter-spacing: 0.08em;
}
.exit {
  color: #5f7d9e;
  font-size: 10.5px;
}
.bs-body {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr 320px;
  gap: 12px;
  padding: 12px;
  min-height: 0;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.kpi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.kpi {
  padding: 12px 12px 10px;
  border-radius: 8px;
  background: linear-gradient(160deg, rgba(20, 33, 50, 0.85), rgba(11, 17, 25, 0.85));
  border: 1px solid rgba(47, 129, 247, 0.16);
  position: relative;
  overflow: hidden;
}
.kpi span {
  font-size: 10.5px;
  color: #6d8199;
}
.kpi b {
  display: inline-block;
  font-size: 24px;
  font-weight: 550;
  margin-top: 4px;
  color: #dbe8f6;
}
.kpi b.ok {
  color: #56d364;
}
.kpi b.bad {
  color: #ff7b72;
}
.kpi b.warn {
  color: #e3b341;
}
.kpi i {
  font-style: normal;
  font-size: 10px;
  color: #5f7d9e;
  margin-left: 3px;
}
.bs-panel {
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(16, 25, 37, 0.86), rgba(9, 14, 20, 0.86));
  border: 1px solid rgba(47, 129, 247, 0.14);
  padding: 10px 12px 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bs-panel.grow {
  flex: 1;
}
.bp-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #9fb6ce;
  padding-left: 9px;
  position: relative;
  margin-bottom: 8px;
}
.bp-hd::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 2.5px;
  border-radius: 2px;
  background: #2f81f7;
}
.bp-hd .mono {
  font-size: 10px;
  color: #5f7d9e;
}
.status-bars {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.sb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
}
.sb-label {
  width: 52px;
  color: #7d94ab;
}
.sb-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.sb-track i {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s;
}
.sb-row b {
  width: 28px;
  text-align: right;
  color: #c3d3e3;
}
.center {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(47, 129, 247, 0.16);
  min-height: 0;
}
.stage {
  position: absolute;
  inset: 0;
}
.stage-legend {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: flex;
  gap: 14px;
  font-size: 10px;
  color: #6d8199;
  z-index: 3;
}
.stage-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.stage-legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.alarm-list {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.al-item {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(248, 81, 73, 0.06);
  border-left: 2px solid rgba(248, 81, 73, 0.7);
  animation: fade-in 0.5s;
}
.al-item.warn {
  background: rgba(210, 153, 34, 0.07);
  border-left-color: rgba(210, 153, 34, 0.8);
}
.al-top {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: #8fa3b8;
}
.al-time {
  margin-left: auto;
  color: #4d5b6b;
}
.al-item p {
  margin: 5px 0 0;
  font-size: 11px;
  color: #cfdae6;
  line-height: 1.5;
}
.al-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 11.5px;
  color: #3f5a45;
}
.wo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 10.5px;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.wo-item b {
  font-weight: 400;
  color: #b7c6d6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wo-item .mono {
  color: #5f7d9e;
  flex: none;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
