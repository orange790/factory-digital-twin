<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>运营总览</h2>
        <p>设备 {{ stats.total || 0 }} 台 · 数据每 3 秒刷新 · 实时通道 {{ rtLabel }}</p>
      </div>
      <div class="actions">
        <el-radio-group v-model="range" size="small" @change="loadTrend">
          <el-radio-button value="24h">24 小时</el-radio-button>
          <el-radio-button value="7d">7 天</el-radio-button>
          <el-radio-button value="30d">30 天</el-radio-button>
        </el-radio-group>
        <el-button size="small" type="primary" @click="$router.push('/twin')">
          <el-icon><Box /></el-icon> 进入三维
        </el-button>
      </div>
    </div>

    <div class="stat-row">
      <StatCard label="设备总数" :value="stats.total" unit="台" icon="Cpu" hint="覆盖 3 个车间 / 6 条产线" />
      <StatCard label="在线率" :value="stats.online_rate" unit="%" icon="Connection" tone="ok" :hint="`在线 ${stats.online} / 离线 ${stats.offline}`" />
      <StatCard label="故障设备" :value="stats.fault" unit="台" icon="Warning" tone="bad" hint="红色呼吸闪烁已同步至三维" clickable @click="$router.push('/alarm')" />
      <StatCard label="未处理告警" :value="stats.active_alarms" unit="条" icon="Bell" tone="warn" hint="5 分钟内同型告警自动合并" clickable @click="$router.push('/alarm')" />
      <StatCard label="待办工单" :value="stats.pending_orders" unit="单" icon="Tickets" hint="含待处理 / 已指派 / 处理中" clickable @click="$router.push('/workorder')" />
      <StatCard label="待保养设备" :value="stats.overdue_maintain" unit="台" icon="Tools" tone="warn" hint="超出保养周期，需排期" clickable @click="$router.push('/device')" />
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-hd">
          <h3>告警趋势</h3>
          <span class="tiny muted">按等级堆叠 · 点击柱子查看明细</span>
        </div>
        <div class="panel-bd">
          <EChart :option="trendOption" height="236px" />
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd"><h3>设备状态分布</h3></div>
        <div class="panel-bd pie-body">
          <EChart :option="pieOption" height="236px" />
        </div>
      </div>
    </div>

    <div class="grid-3">
      <div class="panel plan-panel">
        <div class="panel-hd">
          <h3>车间平面态势</h3>
          <span class="tiny muted">设备点位由台账坐标渲染 · 点击设备进入三维定位</span>
        </div>
        <div class="panel-bd plan-body">
          <svg :viewBox="`0 0 ${W} ${H}`" class="plan-svg">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0 L0 0 0 20" fill="none" stroke="#151e29" stroke-width="1" />
              </pattern>
            </defs>
            <rect :width="W" :height="H" fill="#0b1017" />
            <rect :width="W" :height="H" fill="url(#grid)" />
            <rect x="2" y="2" :width="W - 4" :height="H - 4" fill="none" stroke="#243244" stroke-width="1.4" rx="4" />

            <!-- 产线带 -->
            <g v-for="l in lines" :key="l.code">
              <rect :x="mx(-40)" :y="my(l.z) - 14" :width="mx(32) - mx(-40)" height="28" fill="rgba(47,129,247,0.05)" rx="3" />
              <text :x="mx(-45)" :y="my(l.z) + 3" class="plan-line-label">{{ l.code }}</text>
            </g>

            <!-- 设备点 -->
            <g v-for="d in planDevices" :key="d.code" class="plan-dot">
              <circle
                :cx="mx(d.position_x)"
                :cy="my(d.position_z)"
                :r="radiusOf(d)"
                :fill="statusColor(d.status)"
                :opacity="d.status === 'offline' ? 0.45 : 0.92"
                @click="$router.push({ path: '/twin', query: { code: d.code } })"
              >
                <title>{{ d.code }} · {{ d.name }} · {{ statusLabel(d.status) }}</title>
              </circle>
            </g>
          </svg>
          <div class="plan-legend">
            <span v-for="s in statusOrder" :key="s"><i :style="{ background: statusColor(s) }"></i>{{ statusLabel(s) }}</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <h3>实时告警</h3>
          <router-link to="/alarm" class="tiny">全部 →</router-link>
        </div>
        <div class="panel-bd list-body">
          <div v-if="!alarmStore.active.length" class="empty-state">
            <el-icon :size="26"><CircleCheck /></el-icon>
            <p>暂无未处理告警</p>
          </div>
          <div v-for="a in alarmStore.active.slice(0, 6)" :key="a.id" class="row-item" @click="focusAlarm(a)">
            <span class="tag" :class="a.level">{{ a.level === 'critical' ? '紧急' : '警告' }}</span>
            <div class="ri-main">
              <b>{{ a.device_code }} · {{ a.content }}</b>
              <span>{{ timeAgo(a.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd">
        <h3>待处理工单</h3>
        <router-link to="/workorder" class="tiny">工单看板 →</router-link>
      </div>
      <div class="panel-bd">
        <el-table :data="openOrders" size="small" :show-header="true">
          <el-table-column prop="order_no" label="工单号" width="170">
            <template #default="{ row }"><span class="mono tiny">{{ row.order_no }}</span></template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip />
          <el-table-column prop="device_code" label="设备" width="90" />
          <el-table-column label="类型" width="100">
            <template #default="{ row }">{{ typeLabel(row.order_type) }}</template>
          </el-table-column>
          <el-table-column label="优先级" width="86">
            <template #default="{ row }">
              <span class="tag" :class="row.priority === 'high' ? 'critical' : row.priority === 'mid' ? 'warn' : 'info'">
                {{ { high: '高', mid: '中', low: '低' }[row.priority] }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="assignee" label="处理人" width="90">
            <template #default="{ row }">{{ row.assignee || '待指派' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><span class="tag" :class="woTone(row.status)">{{ woLabel(row.status) }}</span></template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import StatCard from '@/components/StatCard.vue'
import EChart from '@/components/EChart.vue'
import api from '@/api'
import { useAlarmStore } from '@/stores/alarm'
import { useDeviceStore } from '@/stores/device'
import { STATUS_META } from '@/mock/seed'

const router = useRouter()
const alarmStore = useAlarmStore()
const deviceStore = useDeviceStore()

const stats = ref({})
const trend = shallowRef([])
const range = ref('24h')
const orders = ref([])
const rtLabel = ref('SIM 1.2s')
const lines = ref([])

const W = 900
const H = 620
const mx = (x) => ((x + 48) / 96) * W
const my = (z) => ((z + 33) / 66) * H

const planDevices = computed(() => deviceStore.devices)
const statusOrder = ['normal', 'fault', 'stop', 'offline']
const statusColor = (s) => STATUS_META[s]?.color || '#8B949E'
const statusLabel = (s) => STATUS_META[s]?.label || s
const radiusOf = (d) => ({ machine: 5.2, robot: 4.6, sensor: 3.4, gauge: 4, agv: 5.2 }[d.device_type] || 4.6)

const openOrders = computed(() => orders.value.filter((o) => o.status !== 'closed'))

const trendOption = computed(() => ({
  grid: { left: 38, right: 12, top: 30, bottom: 26 },
  tooltip: { trigger: 'axis', backgroundColor: '#111820', borderColor: '#243244', textStyle: { color: '#e6edf3', fontSize: 11 } },
  legend: { right: 6, top: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: '#8b98a8', fontSize: 11 } },
  xAxis: {
    type: 'category',
    data: trend.value.map((x) => x.label),
    axisLine: { lineStyle: { color: '#243244' } },
    axisLabel: { color: '#5f6d7d', fontSize: 10, interval: 'auto' },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#161f2a' } },
    axisLabel: { color: '#5f6d7d', fontSize: 10 },
  },
  series: [
    {
      name: '警告',
      type: 'bar',
      stack: 'a',
      data: trend.value.map((x) => x.warn),
      itemStyle: { color: '#d29922', borderRadius: [0, 0, 0, 0] },
      barMaxWidth: 18,
    },
    {
      name: '紧急',
      type: 'bar',
      stack: 'a',
      data: trend.value.map((x) => x.critical),
      itemStyle: { color: '#f85149', borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 18,
    },
  ],
}))

const pieOption = computed(() => {
  const by = stats.value.by_status || []
  return {
    tooltip: { trigger: 'item', backgroundColor: '#111820', borderColor: '#243244', textStyle: { color: '#e6edf3', fontSize: 11 } },
    legend: {
      orient: 'vertical',
      right: 4,
      top: 'center',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: '#8b98a8', fontSize: 11 },
      formatter: (n) => {
        const item = by.find((x) => statusLabel(x.status) === n)
        return `${n}  ${item ? item.count : 0}`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['36%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#0e141c', borderWidth: 2 },
        label: { show: false },
        data: by.map((x) => ({ name: statusLabel(x.status), value: x.count, itemStyle: { color: statusColor(x.status) } })),
      },
    ],
  }
})

let timer = null
let unsub = null

async function loadStats() {
  stats.value = await api.overview.stats()
}
async function loadTrend() {
  trend.value = await api.overview.trend(range.value)
}
async function loadOrders() {
  const r = await api.workorders.list({ page_size: 6, all: true })
  orders.value = Array.isArray(r) ? r : r.results
}

onMounted(async () => {
  lines.value = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  if (!deviceStore.tree.length) {
    await deviceStore.loadAll()
    lines.value = (deviceStore.tree || []).flatMap((a) => a.lines || [])
  }
  await Promise.all([loadStats(), loadTrend(), loadOrders(), alarmStore.loadActive()])
  timer = setInterval(() => {
    loadStats()
    loadOrders()
  }, 3000)
  unsub = deviceStore.onLive((evt) => {
    if (evt.type === 'tick') stats.value = { ...stats.value, ...(evt.counters || {}) }
    if (evt.alarms?.length) loadTrend()
  })
})

onUnmounted(() => {
  clearInterval(timer)
  unsub?.()
})

function focusAlarm(a) {
  router.push({ path: '/twin', query: { code: a.device_code } })
}
const typeLabel = (t) => ({ fault: '故障处理', inspection: '巡检异常', maintain: '计划保养' }[t] || t)
const woLabel = (s) => ({ pending: '待处理', assigned: '已指派', processing: '处理中', closed: '已闭环' }[s] || s)
const woTone = (s) => ({ pending: 'warn', assigned: 'info', processing: 'info', closed: 'normal' }[s] || 'info')
function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return `${Math.floor(d)} 秒前`
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`
  return `${Math.floor(d / 86400)} 天前`
}
</script>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1.62fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.grid-3 {
  display: grid;
  grid-template-columns: 1.75fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.pie-body {
  padding-top: 4px;
}
.plan-body {
  padding: 10px 14px 12px;
}
.plan-svg {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 6px;
}
.plan-line-label {
  fill: #3f5368;
  font-size: 11px;
  font-family: var(--mono);
}
.plan-dot circle {
  cursor: pointer;
  transition: r 0.15s, opacity 0.15s;
}
.plan-dot circle:hover {
  opacity: 1;
  filter: drop-shadow(0 0 6px currentColor);
}
.plan-legend {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  font-size: 10.5px;
  color: var(--txt-3);
}
.plan-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.plan-legend i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.list-body {
  min-height: 232px;
  max-height: 300px;
  overflow-y: auto;
  padding-top: 8px;
}
.row-item {
  display: flex;
  gap: 8px;
  padding: 8px 6px;
  border-radius: 6px;
  cursor: pointer;
  border-bottom: 1px solid var(--line-soft);
}
.row-item:hover {
  background: rgba(255, 255, 255, 0.03);
}
.ri-main b {
  display: block;
  font-size: 11.5px;
  font-weight: 400;
  color: #cfdae6;
  line-height: 1.4;
}
.ri-main span {
  font-size: 10px;
  color: #4d5b6b;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 0;
  color: #3f5a45;
}
.empty-state p {
  margin: 0;
  font-size: 12px;
  color: var(--txt-3);
}

@media (max-width: 1400px) {
  .stat-row {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
