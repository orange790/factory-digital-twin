<template>
  <div class="replay-page">
    <div ref="stageRef" class="stage"></div>

    <div class="twin-hud header">
      <div class="hd-left">
        <b>状态回放</b>
        <span class="tiny muted">数据源：DeviceStatusLog 状态流水</span>
      </div>
      <div class="hd-right">
        <span class="tiny muted">回放范围</span>
        <el-radio-group v-model="spanHours" size="small" @change="build">
          <el-radio-button :value="1">1 小时</el-radio-button>
          <el-radio-button :value="6">6 小时</el-radio-button>
          <el-radio-button :value="24">24 小时</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="twin-hud timeline">
      <div class="tl-top">
        <el-button size="small" :type="playing ? 'default' : 'primary'" @click="toggle">
          <el-icon><component :is="playing ? 'VideoPause' : 'VideoPlay'" /></el-icon>
          {{ playing ? '暂停' : '播放' }}
        </el-button>
        <div class="tl-time">
          <b class="mono">{{ timeText }}</b>
          <span class="tiny muted">{{ events.length }} 条状态变更</span>
        </div>
        <el-radio-group v-model="speed" size="small">
          <el-radio-button :value="1">1×</el-radio-button>
          <el-radio-button :value="2">2×</el-radio-button>
          <el-radio-button :value="4">4×</el-radio-button>
        </el-radio-group>
        <span class="tiny muted">当前故障 {{ currentFault }} 台</span>
      </div>
      <el-slider v-model="cursor" :min="0" :max="1000" :show-tooltip="false" @input="onScrub" />
      <div class="tl-marks">
        <span v-for="m in marks" :key="m.t" class="mark" :style="{ left: m.pct + '%' }" :title="m.text"></span>
      </div>
    </div>

    <div class="twin-hud legend">
      <span v-for="s in ['normal', 'fault', 'stop', 'offline']" :key="s">
        <i :style="{ background: color(s) }"></i>{{ label(s) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { TwinScene } from '@/three/TwinScene'
import api from '@/api'
import { useDeviceStore } from '@/stores/device'
import { STATUS_META } from '@/mock/seed'

const stageRef = ref(null)
const scene = shallowRef(null)
const deviceStore = useDeviceStore()
const spanHours = ref(1)
const cursor = ref(1000)
const playing = ref(false)
const speed = ref(2)
const events = ref([])
const currentFault = ref(0)
const now = ref(Date.now())

let timer = null

const color = (s) => STATUS_META[s]?.color || '#8B949E'
const label = (s) => STATUS_META[s]?.label || s

const startTs = computed(() => now.value - spanHours.value * 3600 * 1000)
const timeText = computed(() => new Date(startTs.value + ((now.value - startTs.value) * cursor.value) / 1000).toLocaleString('zh-CN'))

const marks = computed(() =>
  events.value.slice(0, 60).map((e) => ({
    t: e.t,
    pct: Math.min(100, Math.max(0, ((e.t - startTs.value) / (now.value - startTs.value)) * 100)),
    text: `${e.code} → ${label(e.to)}`,
  })),
)

function statusAt(ts) {
  const map = {}
  deviceStore.devices.forEach((d) => (map[d.code] = d.status))
  events.value.forEach((e) => {
    if (e.t <= ts) map[e.code] = e.to
  })
  return map
}

function apply(ts) {
  if (!scene.value) return
  const map = statusAt(ts)
  Object.entries(map).forEach(([code, status]) => scene.value.applyStatus(code, status))
  currentFault.value = Object.values(map).filter((s) => s === 'fault').length
}

function onScrub(v) {
  playing.value = false
  const ts = startTs.value + ((now.value - startTs.value) * v) / 1000
  apply(ts)
}

function toggle() {
  if (playing.value) {
    playing.value = false
    clearInterval(timer)
    return
  }
  playing.value = true
  if (cursor.value >= 995) cursor.value = 0
  timer = setInterval(() => {
    cursor.value = Math.min(1000, cursor.value + speed.value * 2)
    const ts = startTs.value + ((now.value - startTs.value) * cursor.value) / 1000
    apply(ts)
    if (cursor.value >= 1000) {
      playing.value = false
      clearInterval(timer)
    }
  }, 100)
}

async function build() {
  now.value = Date.now()
  const logs = await api.devices.statusLogs()
  events.value = logs
    .map((l) => ({ t: new Date(l.created_at).getTime(), code: l.device_code, to: l.to_status, from: l.from_status }))
    .filter((e) => e.t >= startTs.value)
    .sort((a, b) => a.t - b.t)
  cursor.value = 1000
  apply(now.value)
}

onMounted(async () => {
  await deviceStore.loadAll()
  const config = await api.scene.config()
  scene.value = new TwinScene(stageRef.value, { quality: 'high', statusColors: config.status_colors })
  const lines = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  scene.value.setData(deviceStore.devices, lines, config)
  scene.value.flyToPreset('overview', { duration: 700 })
  await build()
})

onBeforeUnmount(() => {
  clearInterval(timer)
  scene.value?.dispose()
  scene.value = null
})
</script>

<style scoped>
.replay-page {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.stage {
  position: absolute;
  inset: 0;
}
.header {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  z-index: 6;
}
.hd-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.hd-left b {
  font-size: 13px;
}
.hd-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.timeline {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
  padding: 12px 16px 8px;
  z-index: 6;
}
.tl-top {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 2px;
}
.tl-time {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.tl-time b {
  font-size: 13px;
  color: #cfe3ff;
}
.tl-marks {
  position: relative;
  height: 8px;
  margin: 0 8px;
}
.mark {
  position: absolute;
  top: 0;
  width: 1px;
  height: 6px;
  background: rgba(248, 81, 73, 0.6);
}
.legend {
  position: absolute;
  bottom: 96px;
  right: 18px;
  padding: 7px 12px;
  display: flex;
  gap: 14px;
  font-size: 10.5px;
  color: var(--txt-3);
  z-index: 6;
}
.legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.legend i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
</style>
