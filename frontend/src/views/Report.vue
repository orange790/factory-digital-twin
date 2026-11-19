<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>报表中心</h2>
        <p>告警统计 · 设备可用率 · 工单时效，支持导出 CSV（Excel 可直接打开）</p>
      </div>
      <div class="actions">
        <el-radio-group v-model="range" size="small" @change="load">
          <el-radio-button value="24h">近 24 小时</el-radio-button>
          <el-radio-button value="7d">近 7 天</el-radio-button>
          <el-radio-button value="30d">近 30 天</el-radio-button>
        </el-radio-group>
        <el-button size="small" type="primary" @click="exportCsv"><el-icon><Download /></el-icon> 导出报表</el-button>
      </div>
    </div>

    <div class="kpi-row">
      <StatCard label="告警总数" :value="data.total" unit="条" icon="Bell" :hint="`紧急 ${data.critical || 0} · 警告 ${data.warn || 0}`" />
      <StatCard label="设备可用率" :value="data.availability" unit="%" icon="Odometer" tone="ok" hint="基于在线设备占比" />
      <StatCard label="平均闭环时长" :value="data.avg_close_minutes" unit="分钟" icon="Timer" tone="warn" hint="告警从产生到关闭" />
      <StatCard label="工单闭环率" :value="orderRate" unit="%" icon="Tickets" hint="已闭环 / 全部工单" />
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-hd"><h3>告警设备 TOP 15</h3></div>
        <div class="panel-bd"><EChart :option="barOption" height="286px" /></div>
      </div>
      <div class="panel">
        <div class="panel-hd"><h3>等级构成</h3></div>
        <div class="panel-bd"><EChart :option="pieOption" height="286px" /></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd">
        <h3>告警明细</h3>
        <span class="tiny muted">最多展示 500 条</span>
      </div>
      <div class="panel-bd" style="padding: 0">
        <el-table :data="data.rows || []" size="small" height="360">
          <el-table-column label="时间" width="150">
            <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(0, 16).replace('T', ' ') }}</span></template>
          </el-table-column>
          <el-table-column prop="device_code" label="设备" width="86" />
          <el-table-column prop="device_name" label="设备名称" width="170" show-overflow-tooltip />
          <el-table-column label="等级" width="82">
            <template #default="{ row }"><span class="tag" :class="row.level">{{ row.level === 'critical' ? '紧急' : '警告' }}</span></template>
          </el-table-column>
          <el-table-column prop="code" label="类型码" width="106">
            <template #default="{ row }"><span class="mono tiny">{{ row.code }}</span></template>
          </el-table-column>
          <el-table-column prop="content" label="内容" min-width="280" show-overflow-tooltip />
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <span class="tag" :class="row.status === 'active' ? 'critical' : row.status === 'acked' ? 'warn' : 'normal'">
                {{ { active: '未处理', acked: '已确认', closed: '已关闭' }[row.status] }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="ack_by" label="处理人" width="88" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import StatCard from '@/components/StatCard.vue'
import EChart from '@/components/EChart.vue'
import api from '@/api'

const range = ref('7d')
const data = ref({})
const orders = ref([])

const orderRate = computed(() => {
  if (!orders.value.length) return 0
  const closed = orders.value.filter((o) => o.status === 'closed').length
  return +((closed / orders.value.length) * 100).toFixed(1)
})

const barOption = computed(() => {
  const rows = (data.value.by_device || []).slice().reverse()
  return {
    grid: { left: 92, right: 26, top: 12, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#111820', borderColor: '#243244', textStyle: { color: '#e6edf3', fontSize: 11 } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#161f2a' } }, axisLabel: { color: '#5f6d7d', fontSize: 10 } },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.device_code),
      axisLine: { lineStyle: { color: '#243244' } },
      axisLabel: { color: '#8b98a8', fontSize: 10, fontFamily: 'monospace' },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => r.total),
        barMaxWidth: 12,
        itemStyle: { color: '#2f81f7', borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: '#7d8b9c', fontSize: 10 },
      },
    ],
  }
})

const pieOption = computed(() => ({
  tooltip: { trigger: 'item', backgroundColor: '#111820', borderColor: '#243244', textStyle: { color: '#e6edf3', fontSize: 11 } },
  legend: { bottom: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: '#8b98a8', fontSize: 11 } },
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '44%'],
      itemStyle: { borderColor: '#0e141c', borderWidth: 2 },
      label: { color: '#9aa7b6', fontSize: 11, formatter: '{b}\n{d}%' },
      data: [
        { name: '紧急', value: data.value.critical || 0, itemStyle: { color: '#f85149' } },
        { name: '警告', value: data.value.warn || 0, itemStyle: { color: '#d29922' } },
      ],
    },
  ],
}))

async function load() {
  data.value = await api.report.alarm(range.value)
  const r = await api.workorders.list({ page_size: 500, all: true })
  orders.value = Array.isArray(r) ? r : r.results
}

function exportCsv() {
  const head = ['时间', '设备编码', '设备名称', '等级', '类型码', '内容', '状态', '处理人']
  const rows = (data.value.rows || []).map((r) => [
    r.created_at,
    r.device_code,
    r.device_name,
    r.level === 'critical' ? '紧急' : '警告',
    r.code,
    r.content,
    { active: '未处理', acked: '已确认', closed: '已关闭' }[r.status],
    r.ack_by,
  ])
  const csv = [head.join(','), ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `告警报表-${range.value}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  ElMessage.success(`已导出 ${rows.length} 条记录（含 BOM，Excel 直接打开不乱码）`)
}

onMounted(load)
</script>

<style scoped>
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
</style>
