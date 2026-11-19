<template>
  <div class="heat-page">
    <div ref="stageRef" class="stage"></div>

    <div class="dock">
      <div class="twin-hud box">
        <div class="bx-hd">热力分析</div>
        <el-radio-group v-model="metric" size="small" style="width: 100%" @change="apply">
          <el-radio-button value="temperature">温度</el-radio-button>
          <el-radio-button value="current">电流</el-radio-button>
          <el-radio-button value="output">产能节拍</el-radio-button>
        </el-radio-group>

        <div class="legend">
          <span class="lg-label">低</span>
          <div class="lg-bar"></div>
          <span class="lg-label">高</span>
        </div>
        <div class="legend-scale mono">
          <span>{{ range[0].toFixed(1) }}</span>
          <span>{{ range[1].toFixed(1) }}</span>
        </div>

        <div class="time-box">
          <div class="tb-hd">
            <span>时间轴（最近 {{ bufferLen }} 帧）</span>
            <span class="mono">{{ tsText }}</span>
          </div>
          <el-slider v-model="frame" :min="0" :max="Math.max(0, bufferLen - 1)" :show-tooltip="false" size="small" @input="apply" />
          <el-button size="small" text @click="live">回到实时</el-button>
        </div>

        <div class="stat-mini">
          <div><b class="mono">{{ top5.length }}</b><span>高热设备</span></div>
          <div><b class="mono">{{ avg.toFixed(1) }}</b><span>均值</span></div>
          <div><b class="mono">{{ maxDev?.code || '—' }}</b><span>峰值设备</span></div>
        </div>
      </div>

      <div class="twin-hud box">
        <div class="bx-hd">Top 5 高值</div>
        <div v-for="d in top5" :key="d.code" class="top-item">
          <span class="mono">{{ d.code }}</span>
          <b class="mono">{{ d.value.toFixed(1) }}</b>
          <span class="tiny muted">{{ d.name }}</span>
        </div>
      </div>
    </div>

    <div class="twin-hud hint">
      <el-icon><InfoFilled /></el-icon>
      热力值直接取自设备实时指标，按 5 档色带映射到设备本体（instanceColor），同一时刻数值与台账/曲线完全一致
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { TwinScene } from '@/three/TwinScene'
import api from '@/api'
import { useDeviceStore } from '@/stores/device'

const stageRef = ref(null)
const scene = shallowRef(null)
const deviceStore = useDeviceStore()
const metric = ref('temperature')
const frame = ref(0)
const bufferLen = ref(0)
const tsText = ref('LIVE')
const range = ref([0, 100])
const avg = ref(0)
const top5 = ref([])
const maxDev = ref(null)

const unit = computed(() => ({ temperature: '°C', current: 'A', output: '件/h' }[metric.value]))

function valuesAt(index) {
  const frames = deviceStore.frames
  const f = frames[index] || frames.at(-1)
  const out = {}
  if (f) {
    deviceStore.devices.forEach((d) => {
      const v = f.data?.[d.code]?.[metric.value]
      if (v !== undefined && v !== null) out[d.code] = v
    })
    return out
  }
  // 帧缓冲尚未建立时退回当前值
  deviceStore.devices.forEach((d) => {
    const v = deviceStore.live[d.code]?.[metric.value]
    if (v !== undefined && v !== null) out[d.code] = v
  })
  return out
}

function apply() {
  if (!scene.value) return
  const vals = valuesAt(frame.value)
  const entries = Object.entries(vals)
  if (!entries.length) return
  const nums = entries.map(([, v]) => v)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  range.value = [lo, hi]
  const span = hi - lo || 1
  const norm = {}
  entries.forEach(([code, v]) => (norm[code] = Math.min(1, Math.max(0, (v - lo) / span))))
  scene.value.setHeatmap(norm)

  const sorted = entries.map(([code, v]) => ({ code, value: v, name: deviceStore.byCode[code]?.name || '' })).sort((a, b) => b.value - a.value)
  top5.value = sorted.slice(0, 5)
  maxDev.value = sorted[0]
  avg.value = nums.reduce((s, v) => s + v, 0) / nums.length

  const frames = deviceStore.frames
  bufferLen.value = frames.length
  const t = frames[frame.value]?.t || frames.at(-1)?.t
  tsText.value = t ? new Date(t).toLocaleTimeString('zh-CN') : 'LIVE'
}

function live() {
  frame.value = Math.max(0, bufferLen.value - 1)
  apply()
}

onMounted(async () => {
  await deviceStore.loadAll()
  const config = await api.scene.config()
  scene.value = new TwinScene(stageRef.value, { quality: 'high', statusColors: config.status_colors })
  const lines = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  scene.value.setData(deviceStore.devices, lines, config)
  scene.value.flyToPreset('overview', { duration: 700 })
  bufferLen.value = deviceStore.frames.length
  frame.value = Math.max(0, bufferLen.value - 1)
  apply()
})

// 两种数据源都会往 deviceStore.frames 追加帧，这里统一跟随
const stopWatch = watch(
  () => deviceStore.frames.length,
  (n) => {
    bufferLen.value = n
    if (frame.value >= n - 2) {
      frame.value = Math.max(0, n - 1)
      apply()
    }
  }
)

onBeforeUnmount(() => {
  stopWatch()
  scene.value?.dispose()
  scene.value = null
})
</script>

<style scoped>
.heat-page {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.stage {
  position: absolute;
  inset: 0;
}
.dock {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 6;
  width: 292px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.box {
  padding: 11px 13px;
}
.bx-hd {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #5f7d9e;
  font-family: var(--mono);
  margin-bottom: 9px;
}
.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}
.lg-bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, #1f6feb, #22d3ee 32%, #3fb950 52%, #d29922 74%, #f85149);
}
.lg-label {
  font-size: 9.5px;
  color: var(--txt-3);
}
.legend-scale {
  display: flex;
  justify-content: space-between;
  font-size: 9.5px;
  color: #526274;
  margin-top: 3px;
  padding: 0 20px;
}
.time-box {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(70, 90, 115, 0.22);
}
.tb-hd {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--txt-3);
  margin-bottom: 2px;
}
.stat-mini {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}
.stat-mini div {
  display: flex;
  flex-direction: column;
}
.stat-mini b {
  font-size: 13px;
  font-weight: 500;
  color: #e6edf3;
}
.stat-mini span {
  font-size: 9.5px;
  color: var(--txt-3);
}
.top-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 11px;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.top-item b {
  color: #ff9a94;
  font-weight: 500;
}
.top-item .tiny {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}
.hint {
  position: absolute;
  bottom: 14px;
  right: 14px;
  padding: 7px 13px;
  font-size: 10.5px;
  color: #8fa3b8;
  max-width: 440px;
  display: flex;
  gap: 6px;
  z-index: 6;
  line-height: 1.6;
}
</style>
