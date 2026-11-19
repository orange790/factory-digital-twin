<template>
  <div class="route-page">
    <div ref="stageRef" class="stage"></div>

    <div class="dock left">
      <div class="twin-hud panel-lite">
        <div class="pl-hd">巡检路线</div>
        <el-select v-model="routeId" size="small" style="width: 100%" @change="loadRoute">
          <el-option v-for="r in routes" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <div class="pl-body">
          <div v-for="(p, i) in currentPoints" :key="p.id" class="pt-item">
            <span class="pt-idx mono">{{ i + 1 }}</span>
            <div>
              <b>{{ p.name }}</b>
              <span class="mono">{{ p.device_code }}</span>
            </div>
            <span v-if="activePoint === i" class="tag info">到位</span>
          </div>
        </div>
      </div>

      <div class="twin-hud panel-lite">
        <div class="pl-hd">回放控制</div>
        <div class="ctrl-row">
          <el-button size="small" :type="playing ? 'default' : 'primary'" @click="togglePlay">
            <el-icon><component :is="playing ? 'VideoPause' : 'VideoPlay'" /></el-icon>
            {{ playing ? '暂停' : '回放' }}
          </el-button>
          <el-button size="small" @click="resetCam">复位视角</el-button>
        </div>
        <div class="slider-row">
          <span class="tiny muted">速度</span>
          <el-slider v-model="speed" :min="20" :max="220" size="small" style="flex: 1" />
        </div>
        <el-switch v-model="follow" size="small" active-text="相机跟随" />
      </div>
    </div>

    <div class="twin-hud hint">
      <el-icon><InfoFilled /></el-icon>
      路线由点位三维坐标经 CatmullRom 曲线插值生成，光点按路径参数运动，到站回调点亮站点
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import { TwinScene } from '@/three/TwinScene'
import api from '@/api'
import { useDeviceStore } from '@/stores/device'

const stageRef = ref(null)
const scene = shallowRef(null)
const deviceStore = useDeviceStore()
const routes = ref([])
const routeId = ref(1)
const currentPoints = ref([])
const playing = ref(false)
const speed = ref(90)
const follow = ref(true)
const activePoint = ref(-1)

let offFrame = null

async function loadRoute() {
  const r = routes.value.find((x) => x.id === routeId.value)
  if (!r || !scene.value) return
  currentPoints.value = r.points
  activePoint.value = -1
  scene.value.showRoute(r.points.map((p) => ({ x: p.position_x, z: p.position_z })), { loop: r.loop })
  scene.value.route.onArrive = (i) => (activePoint.value = i)
  playing.value = false
}

function togglePlay() {
  if (!scene.value) return
  if (playing.value) {
    scene.value.pauseRoute()
    playing.value = false
  } else {
    scene.value.playRoute()
    playing.value = true
  }
}

function resetCam() {
  scene.value?.flyToPreset('overview')
}

onMounted(async () => {
  await deviceStore.loadAll()
  const [rs, config] = await Promise.all([api.inspection.routes(), api.scene.config()])
  routes.value = rs
  scene.value = new TwinScene(stageRef.value, { quality: 'high', statusColors: config.status_colors })
  const lines = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  scene.value.setData(deviceStore.devices, lines, config)
  await loadRoute()
  // 相机跟随路线光点
  const { camera, controls } = scene.value.cameraApi
  offFrame = scene.value.onFrame((dt) => {
    if (!follow.value) return
    const t = scene.value?.route?.traveler
    if (!t) return
    const target = t.position.clone()
    controls.target.lerp(target, 0.08)
    const desired = target.clone().add(new THREE.Vector3(9, 7, 9))
    camera.position.lerp(desired, 0.04)
  })
  setTimeout(() => scene.value?.flyToPreset('overview', { duration: 600 }), 200)
})

onBeforeUnmount(() => {
  offFrame?.()
  scene.value?.dispose()
  scene.value = null
})
</script>

<style scoped>
.route-page {
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 236px;
}
.panel-lite {
  padding: 10px 12px;
}
.pl-hd {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #5f7d9e;
  margin-bottom: 8px;
  font-family: var(--mono);
}
.pl-body {
  margin-top: 9px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}
.pt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.025);
}
.pt-idx {
  width: 17px;
  height: 17px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 9.5px;
  background: rgba(47, 129, 247, 0.16);
  color: #8fb8e8;
  flex: none;
}
.pt-item b {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: #cfdae6;
}
.pt-item span.mono {
  font-size: 9.5px;
  color: #526274;
}
.pt-item .tag {
  margin-left: auto;
}
.ctrl-row {
  display: flex;
  gap: 6px;
}
.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 6px;
}
.hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 14px;
  font-size: 11px;
  color: #8fa3b8;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 6;
  max-width: 620px;
}
</style>
