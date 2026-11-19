<template>
  <div class="page" v-if="device">
    <div class="page-title">
      <div>
        <div class="back-line">
          <el-button text size="small" @click="$router.back()"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
          <span class="mono muted">{{ device.code }}</span>
        </div>
        <h2>
          {{ device.name }}
          <span class="tag" :class="device.status" style="margin-left: 10px; vertical-align: 3px">
            <span class="dot" :class="device.status"></span>{{ statusLabel(device.status) }}
          </span>
        </h2>
        <p>{{ device.area_name }} · {{ device.line_code || '未分配产线' }} · {{ typeLabel(device.device_type) }}</p>
      </div>
      <div class="actions">
        <el-button size="small" @click="$router.push({ path: '/twin', query: { code: device.code } })">
          <el-icon><Aim /></el-icon> 三维定位
        </el-button>
        <el-button size="small" :disabled="auth.isGuest" @click="injectFault">注入故障（演示）</el-button>
        <el-button size="small" type="primary" :disabled="auth.isGuest" @click="createOrder">新建工单</el-button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="left-col">
        <div class="panel">
          <div class="panel-hd">
            <h3>实时指标曲线</h3>
            <el-radio-group v-model="metricKey" size="small" @change="loadSeries">
              <el-radio-button v-for="m in metricOptions" :key="m.key" :value="m.key">{{ m.label }}</el-radio-button>
            </el-radio-group>
          </div>
          <div class="panel-bd">
            <EChart :option="chartOption" height="262px" :not-merge="false" />
            <div class="metric-strip">
              <div v-for="m in metricCards" :key="m.key" class="ms-cell">
                <span>{{ m.label }}</span>
                <b class="mono">{{ m.value }}<i>{{ m.unit }}</i></b>
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-hd"><h3>维护保养档案</h3><el-button size="small" text :disabled="auth.isGuest" @click="openMaintain">登记保养</el-button></div>
          <div class="panel-bd" style="padding: 0">
            <el-table :data="maintains" size="small" :show-header="true">
              <el-table-column label="时间" width="150">
                <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(0, 16).replace('T', ' ') }}</span></template>
              </el-table-column>
              <el-table-column label="类型" width="82">
                <template #default="{ row }">{{ { care: '保养', repair: '维修', replace: '更换' }[row.mtype] }}</template>
              </el-table-column>
              <el-table-column prop="operator" label="处理人" width="86" />
              <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
              <el-table-column label="费用" width="92">
                <template #default="{ row }"><span class="mono">¥{{ row.cost }}</span></template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div class="panel">
          <div class="panel-hd"><h3>历史告警</h3><span class="tiny muted">{{ alarms.length }} 条</span></div>
          <div class="panel-bd" style="padding: 0">
            <el-table :data="alarms" size="small">
              <el-table-column label="时间" width="150">
                <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(0, 16).replace('T', ' ') }}</span></template>
              </el-table-column>
              <el-table-column label="等级" width="80">
                <template #default="{ row }"><span class="tag" :class="row.level">{{ row.level === 'critical' ? '紧急' : '警告' }}</span></template>
              </el-table-column>
              <el-table-column prop="content" label="内容" min-width="240" show-overflow-tooltip />
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <span class="tag" :class="row.status === 'active' ? 'critical' : row.status === 'acked' ? 'warn' : 'normal'">
                    {{ { active: '未处理', acked: '已确认', closed: '已关闭' }[row.status] }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>

      <div class="right-col">
        <div class="panel">
          <div class="panel-hd"><h3>台账信息</h3></div>
          <div class="panel-bd">
            <div class="kv" v-for="k in infoRows" :key="k.k"><span>{{ k.k }}</span><b :class="{ mono: k.mono }">{{ k.v }}</b></div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-hd"><h3>保养状态</h3></div>
          <div class="panel-bd">
            <div class="care-box" :class="{ overdue: device.overdue_days > 0 }">
              <div class="cb-val mono">{{ device.overdue_days > 0 ? '超期 ' + device.overdue_days + ' 天' : '正常' }}</div>
              <div class="cb-sub">最近保养 {{ device.last_maintain_date || '—' }} · 周期 {{ device.maintain_cycle_days }} 天</div>
              <el-progress
                :percentage="carePercent"
                :stroke-width="6"
                :status="device.overdue_days > 0 ? 'exception' : 'success'"
                :show-text="false"
                style="margin-top: 10px"
              />
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-hd"><h3>关联工单</h3></div>
          <div class="panel-bd">
            <div v-if="!orders.length" class="empty">暂无工单</div>
            <div v-for="o in orders" :key="o.id" class="order-item">
              <div>
                <b>{{ o.title }}</b>
                <span class="mono">{{ o.order_no }}</span>
              </div>
              <span class="tag" :class="o.status === 'closed' ? 'normal' : 'warn'">{{ woLabel(o.status) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="mDialog" title="登记保养记录" width="520px" append-to-body>
      <el-form :model="mForm" label-width="84px">
        <el-form-item label="类型">
          <el-radio-group v-model="mForm.mtype">
            <el-radio value="care">保养</el-radio>
            <el-radio value="repair">维修</el-radio>
            <el-radio value="replace">更换</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="处理人"><el-input v-model="mForm.operator" /></el-form-item>
        <el-form-item label="费用"><el-input-number v-model="mForm.cost" :min="0" :step="50" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="mForm.content" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mDialog = false">取消</el-button>
        <el-button type="primary" @click="saveMaintain">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import EChart from '@/components/EChart.vue'
import api from '@/api'
import { useDeviceStore } from '@/stores/device'
import { useAuthStore } from '@/stores/auth'
import { STATUS_META, DEVICE_TYPE_META } from '@/mock/seed'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const deviceStore = useDeviceStore()

const device = ref(null)
const alarms = ref([])
const orders = ref([])
const maintains = ref([])
const metricKey = ref('temperature')
const series = shallowRef([])
const mDialog = ref(false)
const mForm = reactive({ mtype: 'care', operator: 'admin', cost: 200, content: '' })

const statusLabel = (s) => STATUS_META[s]?.label || s
const typeLabel = (t) => DEVICE_TYPE_META[t]?.label || t
const woLabel = (s) => ({ pending: '待处理', assigned: '已指派', processing: '处理中', closed: '已闭环' }[s] || s)

const metricOptions = [
  { key: 'temperature', label: '温度', unit: '°C' },
  { key: 'speed', label: '转速', unit: 'rpm' },
  { key: 'current', label: '电流', unit: 'A' },
]

const metricCards = computed(() => {
  const live = deviceStore.live[device.value?.code] || {}
  return [
    { key: 't', label: '温度', value: live.temperature?.toFixed(1) ?? '—', unit: '°C' },
    { key: 's', label: '转速', value: live.speed?.toFixed(0) ?? '—', unit: 'rpm' },
    { key: 'c', label: '电流', value: live.current?.toFixed(2) ?? '—', unit: 'A' },
    { key: 'v', label: '振动', value: live.vibration?.toFixed(2) ?? '—', unit: 'mm/s' },
    { key: 'o', label: '节拍', value: live.output?.toFixed(0) ?? '—', unit: '件/h' },
  ]
})

const infoRows = computed(() => {
  const d = device.value
  if (!d) return []
  return [
    { k: '设备编码', v: d.code, mono: true },
    { k: '三维节点名', v: d.glb_node_name, mono: true },
    { k: '设备类型', v: typeLabel(d.device_type) },
    { k: '所属区域', v: d.area_name },
    { k: '所属产线', v: d.line_code || '—' },
    { k: '额定功率', v: `${d.rated_power} kW` },
    { k: '投运日期', v: d.install_date },
    { k: '关键设备', v: d.is_critical ? '是' : '否' },
    { k: '三维坐标', v: `${d.position_x.toFixed(1)}, ${d.position_y.toFixed(1)}, ${d.position_z.toFixed(1)}` },
  ]
})

const carePercent = computed(() => {
  if (!device.value) return 0
  const used = device.value.overdue_days > 0 ? 100 : Math.max(4, 100 - (device.value.overdue_days || 0) * 0 - 20)
  return Math.min(100, used)
})

const chartOption = computed(() => {
  const data = series.value
  return {
    grid: { left: 46, right: 16, top: 18, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111820',
      borderColor: '#243244',
      textStyle: { color: '#e6edf3', fontSize: 11 },
      valueFormatter: (v) => Number(v).toFixed(2),
    },
    xAxis: {
      type: 'category',
      data: data.map((p) => new Date(p.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
      axisLine: { lineStyle: { color: '#243244' } },
      axisLabel: { color: '#5f6d7d', fontSize: 10 },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      scale: true,
      splitLine: { lineStyle: { color: '#161f2a' } },
      axisLabel: { color: '#5f6d7d', fontSize: 10 },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: data.map((p) => p.value),
        lineStyle: { width: 1.8, color: '#2f81f7' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(47,129,247,0.34)' },
              { offset: 1, color: 'rgba(47,129,247,0.01)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { formatter: '告警阈值', color: '#e3b341', fontSize: 10 },
          lineStyle: { color: 'rgba(210,153,34,0.55)', type: 'dashed' },
          data: [{ yAxis: metricKey.value === 'temperature' ? 68 : metricKey.value === 'current' ? 15 : 1600 }],
        },
      },
    ],
  }
})

let unsub = null

async function loadSeries() {
  const r = await api.devices.metrics(route.params.id, { key: metricKey.value, range: '1h' })
  series.value = r.history
}

async function loadAll() {
  device.value = await api.devices.get(route.params.id)
  const [a, o, m] = await Promise.all([
    api.alarms.list({ device_code: device.value.code, page_size: 10, all: true }),
    api.workorders.list({ device_code: device.value.code, page_size: 5, all: true }),
    api.devices.maintains(device.value.id),
  ])
  alarms.value = Array.isArray(a) ? a : a.results
  orders.value = Array.isArray(o) ? o : o.results
  maintains.value = m
  await loadSeries()
}

onMounted(async () => {
  if (!deviceStore.devices.length) await deviceStore.loadAll()
  try {
    await loadAll()
  } catch (e) {
    // 设备被删除或 URL 里的 id 不存在：给提示并退回台账，避免白屏
    ElMessage.error(e?.status === 404 ? '设备不存在或已被删除' : e.message || '加载失败')
    router.replace('/device')
    return
  }
  unsub = deviceStore.onLive((evt) => {
    if (evt.type !== 'tick' || !device.value) return
    const live = deviceStore.live[device.value.code] || {}
    const v = live[metricKey.value]
    if (v === undefined) return
    const next = series.value.slice()
    next.push({ t: Date.now(), value: v })
    if (next.length > 70) next.shift()
    series.value = next
    const d = deviceStore.byCode[device.value.code]
    if (d) device.value.status = d.status
  })
})

onUnmounted(() => unsub?.())

async function injectFault() {
  try {
    await api.alarms.injectFault(device.value.code)
    ElMessage.warning('已注入故障：三维场景会在 1 帧内变红闪烁')
    setTimeout(loadAll, 800)
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function createOrder() {
  router.push({ path: '/workorder', query: { device: device.value.code, create: '1' } })
}

function openMaintain() {
  Object.assign(mForm, { mtype: 'care', operator: auth.username || 'admin', cost: 200, content: '' })
  mDialog.value = true
}

async function saveMaintain() {
  await api.devices.addMaintain({ device_id: device.value.id, ...mForm })
  ElMessage.success('已登记保养记录')
  mDialog.value = false
  await loadAll()
}
</script>

<style scoped>
.back-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;
}
.actions {
  display: flex;
  gap: 8px;
}
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 330px;
  gap: 14px;
}
.left-col,
.right-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.metric-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.ms-cell {
  padding: 8px 10px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line-soft);
}
.ms-cell span {
  display: block;
  font-size: 10px;
  color: var(--txt-3);
}
.ms-cell b {
  font-size: 14px;
  font-weight: 500;
}
.ms-cell i {
  font-style: normal;
  font-size: 9.5px;
  color: var(--txt-3);
  margin-left: 2px;
}
.kv {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.kv span {
  color: var(--txt-3);
}
.kv b {
  font-weight: 500;
  color: #d3dde8;
}
.care-box {
  padding: 12px;
  border-radius: 8px;
  background: rgba(63, 185, 80, 0.07);
  border: 1px solid rgba(63, 185, 80, 0.2);
}
.care-box.overdue {
  background: rgba(248, 81, 73, 0.08);
  border-color: rgba(248, 81, 73, 0.26);
}
.cb-val {
  font-size: 17px;
  color: #56d364;
  font-weight: 500;
}
.care-box.overdue .cb-val {
  color: #ff7b72;
}
.cb-sub {
  font-size: 10.5px;
  color: var(--txt-3);
  margin-top: 3px;
}
.order-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.order-item b {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: #cfdae6;
}
.order-item span.mono {
  font-size: 9.5px;
  color: #4d5b6b;
}
.empty {
  font-size: 11px;
  color: #4d5b6b;
}
</style>
