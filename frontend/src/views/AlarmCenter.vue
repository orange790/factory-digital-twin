<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>告警中心</h2>
        <p>未处理 {{ counts.active }} 条 · 紧急 {{ counts.critical }} 条 · 同设备同类型 5 分钟内自动合并去重</p>
      </div>
      <div class="actions">
        <el-button size="small" @click="ruleDialog = true"><el-icon><Setting /></el-icon> 告警规则</el-button>
        <el-button size="small" :disabled="!selected.length || !auth.can('alarm')" @click="batchAck">
          批量确认 {{ selected.length ? `(${selected.length})` : '' }}
        </el-button>
        <el-button size="small" type="primary" :disabled="auth.isGuest" @click="inject">
          <el-icon><Lightning /></el-icon> 模拟故障
        </el-button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd">
        <div class="filters">
          <el-select v-model="query.status" size="small" placeholder="状态" clearable style="width: 108px" @change="reload">
            <el-option label="未处理" value="active" />
            <el-option label="已确认" value="acked" />
            <el-option label="已关闭" value="closed" />
          </el-select>
          <el-select v-model="query.level" size="small" placeholder="等级" clearable style="width: 100px" @change="reload">
            <el-option label="紧急" value="critical" />
            <el-option label="警告" value="warn" />
          </el-select>
          <el-select v-model="query.area_code" size="small" placeholder="区域" clearable style="width: 116px" @change="reload">
            <el-option v-for="a in areas" :key="a.code" :label="a.name" :value="a.code" />
          </el-select>
          <el-input v-model="query.keyword" size="small" placeholder="设备编码 / 内容" clearable style="width: 190px" :prefix-icon="Search" @input="debounced" />
        </div>
        <span class="tiny muted">共 {{ total }} 条</span>
      </div>

      <div class="panel-bd" style="padding: 0 0 8px">
        <el-table :data="rows" size="small" v-loading="loading" @selection-change="(v) => (selected = v)" row-key="id">
          <el-table-column type="selection" width="42" reserve-selection />
          <el-table-column label="等级" width="84">
            <template #default="{ row }">
              <span class="tag" :class="row.level">{{ row.level === 'critical' ? '紧急' : '警告' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="设备" width="216">
            <template #default="{ row }">
              <span class="mono linkish" @click="$router.push({ path: '/twin', query: { code: row.device_code } })">{{ row.device_code }}</span>
              <span class="tiny muted" style="margin-left: 6px">{{ row.device_name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="content" label="告警内容" min-width="300" show-overflow-tooltip />
          <el-table-column label="触发值 / 阈值" width="130">
            <template #default="{ row }">
              <span class="mono">{{ row.trigger_value }} / {{ row.threshold }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <span class="tag" :class="row.status === 'active' ? 'critical' : row.status === 'acked' ? 'warn' : 'normal'">
                {{ { active: '未处理', acked: '已确认', closed: '已关闭' }[row.status] }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="152">
            <template #default="{ row }"><span class="mono tiny">{{ fmtTime(row.created_at) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="188" fixed="right">
            <template #default="{ row }">
              <el-button text size="small" :disabled="row.status !== 'active' || !auth.can('alarm')" @click="ack(row)">确认</el-button>
              <el-button text size="small" :disabled="row.status === 'closed' || !auth.can('alarm')" @click="close(row)">关闭</el-button>
              <el-button text size="small" :disabled="auth.isGuest" @click="toOrder(row)">建单</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.page_size"
            :total="total"
            :page-sizes="[15, 30, 50]"
            layout="total, sizes, prev, pager, next"
            size="small"
            @change="reload"
          />
        </div>
      </div>
    </div>

    <el-dialog v-model="ruleDialog" title="告警阈值规则配置" width="680px" append-to-body>
      <p class="rule-tip">规则变更后立即生效，模拟器与后端判定共用同一套阈值（配置化，无需改代码）。</p>
      <el-table :data="rules" size="small">
        <el-table-column label="设备类型" width="110">
          <template #default="{ row }">{{ typeLabel(row.device_type) }}</template>
        </el-table-column>
        <el-table-column prop="metric_key" label="指标" width="110" />
        <el-table-column label="条件" width="110">
          <template #default="{ row }">
            <el-select v-model="row.operator" size="small" style="width: 74px">
              <el-option label=">" value=">" />
              <el-option label="<" value="<" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="阈值" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.threshold" size="small" :step="1" controls-position="right" style="width: 108px" />
          </template>
        </el-table-column>
        <el-table-column label="等级" width="110">
          <template #default="{ row }">
            <el-select v-model="row.level" size="small" style="width: 92px">
              <el-option label="警告" value="warn" />
              <el-option label="紧急" value="critical" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80">
          <template #default="{ row }"><el-switch v-model="row.enabled" size="small" /></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="ruleDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!auth.can('scene')" @click="saveRules">保存规则</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import api from '@/api'
import { useAlarmStore } from '@/stores/alarm'
import { useDeviceStore } from '@/stores/device'
import { useAuthStore } from '@/stores/auth'
import { DEVICE_TYPE_META } from '@/mock/seed'

const router = useRouter()
const alarmStore = useAlarmStore()
const deviceStore = useDeviceStore()
const auth = useAuthStore()

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const selected = ref([])
const ruleDialog = ref(false)
const rules = ref([])
const counts = reactive({ active: 0, critical: 0 })
const areas = ref([])

const query = reactive({ page: 1, page_size: 15, status: '', level: '', area_code: '', keyword: '' })
const typeLabel = (t) => DEVICE_TYPE_META[t]?.label || t

async function reload() {
  loading.value = true
  try {
    const r = await api.alarms.list({ ...query })
    rows.value = r.results
    total.value = r.count
    const all = await api.alarms.list({ page_size: 200, all: true })
    const list = Array.isArray(all) ? all : all.results
    counts.active = list.filter((a) => a.status === 'active').length
    counts.critical = list.filter((a) => a.status === 'active' && a.level === 'critical').length
  } finally {
    loading.value = false
  }
}

let timer = null
function debounced() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    query.page = 1
    reload()
  }, 300)
}

async function ack(row) {
  try {
    await api.alarms.ack(row.id)
    ElMessage.success('已确认')
    await reload()
    await alarmStore.loadActive()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function close(row) {
  try {
    await api.alarms.close(row.id)
    ElMessage.success('已关闭，设备状态将自动恢复')
    await reload()
    await alarmStore.loadActive()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function batchAck() {
  try {
    const r = await api.alarms.batchAck(selected.value.map((x) => x.id))
    ElMessage.success(`已确认 ${r.length} 条告警`)
    await reload()
    await alarmStore.loadActive()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function toOrder(row) {
  router.push({ path: '/workorder', query: { alarm: row.id, device: row.device_code, create: '1' } })
}

async function inject() {
  try {
    const { value } = await ElMessageBox.prompt('输入设备编码（如 M01 / S12 / R03），将随机注入超阈值故障', '模拟设备故障', {
      inputValue: 'M01',
      confirmButtonText: '注入',
      cancelButtonText: '取消',
    })
    await api.alarms.injectFault(value.trim())
    ElMessage.warning('故障已注入，观察三维场景与告警列表')
    await reload()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

async function saveRules() {
  try {
    await api.alarms.saveRules(rules.value)
    ElMessage.success('规则已保存并生效')
    ruleDialog.value = false
  } catch (e) {
    ElMessage.error(e.message)
  }
}

let unsub = null
onMounted(async () => {
  if (!deviceStore.tree.length) await deviceStore.loadAll()
  areas.value = deviceStore.tree
  await reload()
  rules.value = await api.alarms.rules()
  // 实时通道统一走 store 事件总线（mock / http 通用）
  unsub = deviceStore.onLive((evt) => {
    if (evt.alarms?.length) reload()
  })
})
onUnmounted(() => unsub?.())

const fmtTime = (iso) => new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
.filters {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px 4px;
}
.linkish {
  color: #7fc4ff;
  cursor: pointer;
}
.linkish:hover {
  text-decoration: underline;
}
.rule-tip {
  margin: 0 0 12px;
  font-size: 11.5px;
  color: var(--txt-3);
}
</style>
