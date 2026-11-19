<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>场景配置</h2>
        <p>状态色 / 图层 / 视角预设 / 节点绑定全部落库，改配置不改代码（F-BE-09）</p>
      </div>
      <div class="actions">
        <el-button size="small" @click="reload">重置</el-button>
        <el-button size="small" type="primary" :disabled="!auth.can('scene')" :loading="saving" @click="save">保存配置</el-button>
      </div>
    </div>

    <div class="cfg-grid">
      <div class="panel">
        <div class="panel-hd"><h3>状态视觉映射</h3><span class="tiny muted">写入 SceneConfig.status_colors</span></div>
        <div class="panel-bd">
          <div v-for="s in statusOrder" :key="s" class="color-row">
            <span class="dot" :class="s"></span>
            <div class="cr-label">
              <b>{{ statusLabel(s) }}</b>
              <span>{{ statusHint[s] }}</span>
            </div>
            <el-color-picker v-model="config.status_colors[s]" size="small" :disabled="!auth.can('scene')" />
            <span class="mono tiny">{{ config.status_colors[s] }}</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd"><h3>图层可见性</h3><span class="tiny muted">SceneConfig.layer_visible</span></div>
        <div class="panel-bd">
          <div v-for="l in layerDefs" :key="l.key" class="layer-row">
            <div>
              <b>{{ l.label }}</b>
              <span>{{ l.desc }}</span>
            </div>
            <el-switch v-model="config.layer_visible[l.key]" size="small" :disabled="!auth.can('scene')" />
          </div>
          <div class="layer-row">
            <div><b>背景色</b><span>SceneConfig.bg_color</span></div>
            <el-color-picker v-model="config.bg_color" size="small" :disabled="!auth.can('scene')" />
          </div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top: 14px">
      <div class="panel-hd">
        <h3>模型资产与节点绑定</h3>
        <span class="tiny muted">当前使用程序化资产；换成 GLB 时仅需替换加载器，绑定逻辑不变</span>
      </div>
      <div class="panel-bd">
        <div class="asset-row">
          <div class="asset-box">
            <el-icon :size="20"><Box /></el-icon>
            <div>
              <b>{{ config.model_file || 'procedural_hall.v1（程序化生成）' }}</b>
              <span>节点命名规范 DEV_{{ '{device_code}' }} · 建议 Draco 压缩后 ≤ 10MB</span>
            </div>
          </div>
          <div class="asset-act">
            <el-upload :auto-upload="false" :show-file-list="false" :on-change="onUpload" accept=".glb,.gltf">
              <el-button size="small" :disabled="!auth.can('scene')">上传 GLB</el-button>
            </el-upload>
            <el-button size="small" text @click="validateBinding">校验绑定</el-button>
          </div>
        </div>

        <el-alert v-if="bindingChecked" :type="unbound.length ? 'warning' : 'success'" :closable="false" show-icon style="margin: 10px 0">
          <template #title>
            绑定校验完成：{{ devices.length }} 台设备 / {{ devices.length - unbound.length }} 台已绑定
            <span v-if="unbound.length">，{{ unbound.length }} 台节点名缺失需检查</span>
          </template>
        </el-alert>

        <el-table :data="devices.slice(0, 12)" size="small" max-height="260">
          <el-table-column prop="code" label="设备编码" width="100">
            <template #default="{ row }"><span class="mono">{{ row.code }}</span></template>
          </el-table-column>
          <el-table-column prop="name" label="设备名称" min-width="200" show-overflow-tooltip />
          <el-table-column label="GLB 节点名" width="180">
            <template #default="{ row }">
              <span class="mono" :class="{ bad: !row.glb_node_name || !row.glb_node_name.startsWith('DEV_') }">{{ row.glb_node_name || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="坐标" width="190">
            <template #default="{ row }">
              <span class="mono tiny">{{ row.position_x.toFixed(1) }}, {{ row.position_y.toFixed(1) }}, {{ row.position_z.toFixed(1) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="绑定状态" width="100">
            <template #default="{ row }">
              <span class="tag" :class="row.glb_node_name?.startsWith('DEV_') ? 'normal' : 'critical'">
                {{ row.glb_node_name?.startsWith('DEV_') ? '已绑定' : '异常' }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <p class="tiny muted" style="margin: 8px 0 0">仅展示前 12 条，完整清单见设备台账</p>
      </div>
    </div>

    <div class="cfg-grid" style="margin-top: 14px">
      <div class="panel">
        <div class="panel-hd"><h3>视角预设</h3><span class="tiny muted">{{ config.camera_presets?.length || 0 }} 个</span></div>
        <div class="panel-bd" style="padding: 0">
          <el-table :data="config.camera_presets || []" size="small">
            <el-table-column prop="label" label="名称" width="120" />
            <el-table-column label="相机位置" min-width="140">
              <template #default="{ row }"><span class="mono tiny">{{ row.camPos.map((v) => v.toFixed(1)).join(', ') }}</span></template>
            </el-table-column>
            <el-table-column label="观察点" width="130">
              <template #default="{ row }"><span class="mono tiny">{{ row.target.map((v) => v.toFixed(1)).join(', ') }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button text size="small" @click="$router.push({ path: '/twin', query: { preset: row.name } })">预览</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd"><h3>场景快照</h3><span class="tiny muted">相机位姿 + 图层状态可一键还原</span></div>
        <div class="panel-bd" style="padding: 0">
          <div v-if="!snapshots.length" class="empty-snap">
            <el-icon :size="22"><Camera /></el-icon>
            <p>还没有快照，可在三维页「快照」按钮保存</p>
          </div>
          <el-table v-else :data="snapshots" size="small">
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column label="相机位置" width="150">
              <template #default="{ row }"><span class="mono tiny">{{ row.camera_position.map((v) => v.toFixed(1)).join(', ') }}</span></template>
            </el-table-column>
            <el-table-column label="时间" width="130">
              <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(5, 16).replace('T', ' ') }}</span></template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useDeviceStore } from '@/stores/device'
import { STATUS_META as SM } from '@/mock/seed'

const auth = useAuthStore()
const deviceStore = useDeviceStore()
const config = ref({ status_colors: {}, layer_visible: {}, camera_presets: [] })
const snapshots = ref([])
const devices = ref([])
const unbound = ref([])
const bindingChecked = ref(false)
const saving = ref(false)

const statusOrder = ['normal', 'offline', 'fault', 'stop']
const statusLabel = (s) => SM[s]?.label || s
const statusHint = {
  normal: '标准 PBR，无附加表现',
  offline: '透明度 0.6，无自发光',
  fault: '呼吸闪烁 + Fresnel 边缘描边',
  stop: '标准 PBR，黄色标识',
}
const layerDefs = [
  { key: 'building', label: '建筑层', desc: '地面 / 墙体 / 桁架 / 导轨' },
  { key: 'device', label: '设备层', desc: '实例化设备，参与拾取' },
  { key: 'label', label: '标注层', desc: 'CSS2D 标签，按优先级抽稀' },
  { key: 'effect', label: '特效层', desc: 'Bloom 辉光 / 巡检路线' },
  { key: 'helper', label: '辅助层', desc: '选中包围盒 / 拾取圈' },
]

async function reload() {
  config.value = await api.scene.config()
  snapshots.value = await api.scene.snapshots()
  if (!deviceStore.devices.length) await deviceStore.loadAll()
  devices.value = deviceStore.devices
}

async function save() {
  saving.value = true
  try {
    await api.scene.saveConfig({
      status_colors: config.value.status_colors,
      layer_visible: config.value.layer_visible,
      bg_color: config.value.bg_color,
    })
    ElMessage.success('配置已保存，刷新三维页即按新配置渲染')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

function validateBinding() {
  unbound.value = devices.value.filter((d) => !d.glb_node_name?.startsWith('DEV_'))
  bindingChecked.value = true
  ElMessage.success(`已校验 ${devices.value.length} 台设备的节点命名`)
}

function onUpload(file) {
  ElMessage.info(`已选择 ${file.name}；演示环境不落盘，真实环境将写入 SceneConfig.model_file`)
}

onMounted(reload)
</script>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
.cfg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.cr-label {
  flex: 1;
}
.cr-label b {
  display: block;
  font-size: 12px;
  font-weight: 500;
}
.cr-label span {
  font-size: 10.5px;
  color: var(--txt-3);
}
.layer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.layer-row b {
  display: block;
  font-size: 12px;
  font-weight: 500;
}
.layer-row span {
  font-size: 10.5px;
  color: var(--txt-3);
}
.asset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--line-soft);
  margin-bottom: 10px;
}
.asset-box {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #7fc4ff;
}
.asset-box b {
  display: block;
  font-size: 12px;
  color: #d3dde8;
  font-weight: 500;
}
.asset-box span {
  font-size: 10.5px;
  color: var(--txt-3);
}
.asset-act {
  display: flex;
  gap: 8px;
  align-items: center;
}
.bad {
  color: #ff7b72;
}
.empty-snap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 0;
  color: #3f4d5e;
}
.empty-snap p {
  margin: 0;
  font-size: 11.5px;
  color: var(--txt-3);
}
</style>
