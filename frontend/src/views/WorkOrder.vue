<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>运维工单</h2>
        <p>状态机 pending → assigned → processing → closed（非法流转后端拒绝）· 关闭工单自动关闭关联告警并恢复设备</p>
      </div>
      <div class="actions">
        <el-radio-group v-model="view" size="small">
          <el-radio-button value="board">看板</el-radio-button>
          <el-radio-button value="list">列表</el-radio-button>
        </el-radio-group>
        <el-button size="small" type="primary" :disabled="auth.isGuest" @click="openCreate()">
          <el-icon><Plus /></el-icon> 新建工单
        </el-button>
      </div>
    </div>

    <div class="board" v-if="view === 'board'">
      <div
        v-for="col in columns"
        :key="col.key"
        class="col"
        :class="[col.key, { over: dragOver === col.key }]"
        @dragover.prevent="dragOver = col.key"
        @dragleave="dragOver = ''"
        @drop="onDrop(col.key)"
      >
        <div class="col-hd">
          <span class="dot" :class="col.tone"></span>
          <b>{{ col.label }}</b>
          <span class="cnt">{{ grouped[col.key].length }}</span>
        </div>
        <div class="col-body">
          <div
            v-for="o in grouped[col.key]"
            :key="o.id"
            class="card"
            :draggable="!auth.isGuest && col.key !== 'closed'"
            @dragstart="onDragStart(o)"
            @click="detail(o)"
          >
            <div class="c-top">
              <span class="mono c-no">{{ o.order_no }}</span>
              <span class="tag" :class="o.priority === 'high' ? 'critical' : o.priority === 'mid' ? 'warn' : 'info'">
                {{ { high: '高', mid: '中', low: '低' }[o.priority] }}
              </span>
            </div>
            <p class="c-title">{{ o.title }}</p>
            <div class="c-meta">
              <span v-if="o.device_code" class="mono">{{ o.device_code }}</span>
              <span class="c-type">{{ typeLabel(o.order_type) }}</span>
              <span class="c-assignee" v-if="o.assignee">{{ o.assignee }}</span>
            </div>
            <div class="c-foot">
              <span>{{ timeAgo(o.created_at) }}</span>
              <span v-if="o.status !== 'closed' && !auth.isGuest" class="c-actions" @click.stop>
                <el-button v-if="o.status === 'pending'" text size="small" class="act" @click="assign(o)">指派 →</el-button>
                <el-button v-if="o.status === 'assigned'" text size="small" class="act" @click="move(o, 'processing')">开工 →</el-button>
                <el-button v-if="o.status === 'processing'" text size="small" class="act ok" @click="finish(o)">闭环 ✓</el-button>
              </span>
            </div>
          </div>
          <div v-if="!grouped[col.key].length" class="col-empty">拖拽工单到这里</div>
        </div>
      </div>
    </div>

    <div class="panel" v-else>
      <div class="panel-hd">
        <div class="filters">
          <el-select v-model="query.status" size="small" placeholder="状态" clearable style="width: 110px" @change="reload">
            <el-option v-for="c in columns" :key="c.key" :label="c.label" :value="c.key" />
          </el-select>
          <el-select v-model="query.order_type" size="small" placeholder="类型" clearable style="width: 116px" @change="reload">
            <el-option label="故障处理" value="fault" />
            <el-option label="巡检异常" value="inspection" />
            <el-option label="计划保养" value="maintain" />
          </el-select>
          <el-input v-model="query.keyword" size="small" placeholder="工单号 / 标题" clearable style="width: 190px" @input="debounced" />
        </div>
      </div>
      <div class="panel-bd" style="padding: 0 0 8px">
        <el-table :data="rows" size="small">
          <el-table-column prop="order_no" label="工单号" width="164">
            <template #default="{ row }"><span class="mono tiny">{{ row.order_no }}</span></template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="250" show-overflow-tooltip />
          <el-table-column label="设备" width="90">
            <template #default="{ row }"><span class="mono tiny">{{ row.device_code || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="类型" width="94">
            <template #default="{ row }">{{ typeLabel(row.order_type) }}</template>
          </el-table-column>
          <el-table-column prop="assignee" label="处理人" width="88">
            <template #default="{ row }">{{ row.assignee || '待指派' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <span class="tag" :class="{ pending: 'warn', assigned: 'info', processing: 'info', closed: 'normal' }[row.status]">
                {{ labelOf(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="150">
            <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(5, 16).replace('T', ' ') }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button text size="small" @click="detail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 新建 -->
    <el-dialog v-model="dialog" title="新建运维工单" width="580px" append-to-body>
      <el-form :model="form" label-width="88px">
        <el-form-item label="标题" required><el-input v-model="form.title" placeholder="如 M07 主轴温度持续超限" /></el-form-item>
        <el-form-item label="工单类型">
          <el-radio-group v-model="form.order_type">
            <el-radio value="fault">故障处理</el-radio>
            <el-radio value="inspection">巡检异常</el-radio>
            <el-radio value="maintain">计划保养</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关联设备">
          <el-select v-model="form.device_id" filterable clearable style="width: 100%" placeholder="选择设备">
            <el-option v-for="d in deviceStore.devices" :key="d.id" :label="`${d.code} · ${d.name}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="form.priority">
            <el-radio value="high">高</el-radio>
            <el-radio value="mid">中</el-radio>
            <el-radio value="low">低</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="处理人"><el-input v-model="form.assignee" placeholder="可留空，后续指派" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.content" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">创建</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="drawer" title="工单详情" size="420px" append-to-body>
      <template v-if="current">
        <h3 class="d-title">{{ current.title }}</h3>
        <div class="d-tags">
          <span class="tag info">{{ current.order_no }}</span>
          <span class="tag" :class="{ pending: 'warn', assigned: 'info', processing: 'info', closed: 'normal' }[current.status]">{{ labelOf(current.status) }}</span>
          <span class="tag warn">{{ typeLabel(current.order_type) }}</span>
        </div>
        <div class="d-kv"><span>关联设备</span><b>{{ current.device_code || '—' }}</b></div>
        <div class="d-kv"><span>处理人</span><b>{{ current.assignee || '待指派' }}</b></div>
        <div class="d-kv"><span>创建时间</span><b class="mono">{{ current.created_at.slice(0, 16).replace('T', ' ') }}</b></div>
        <div class="d-kv"><span>闭环时间</span><b class="mono">{{ current.closed_at ? current.closed_at.slice(0, 16).replace('T', ' ') : '—' }}</b></div>
        <div class="d-sec"><h4>工单描述</h4><p>{{ current.content || '无' }}</p></div>
        <div class="d-sec"><h4>处理结果</h4><p>{{ current.result || '尚未填写' }}</p></div>

        <div class="d-flow">
          <el-step :active="stepActive" :title="''" simple>
            <template #default>
              <div class="steps">
                <span v-for="(s, i) in flowSteps" :key="s.key" :class="{ done: i <= stepActive - 1 }">{{ s.label }}</span>
              </div>
            </template>
          </el-step>
        </div>

        <div class="d-actions" v-if="current.status !== 'closed'">
          <el-button v-if="current.status === 'pending'" size="small" :disabled="auth.isGuest" @click="assign(current)">指派处理人</el-button>
          <el-button v-if="current.status === 'assigned'" size="small" type="primary" :disabled="auth.isGuest" @click="move(current, 'processing')">开始处理</el-button>
          <el-button v-if="current.status === 'processing'" size="small" type="success" :disabled="auth.isGuest" @click="finish(current, true)">填写结果并闭环</el-button>
        </div>
        <p class="d-tip">
          <el-icon><InfoFilled /></el-icon>
          闭环后自动关闭该设备未处理告警，三维材质恢复为正常运行色
        </p>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useDeviceStore } from '@/stores/device'

const route = useRoute()
const auth = useAuthStore()
const deviceStore = useDeviceStore()

const view = ref('board')
const all = ref([])
const rows = ref([])
const dialog = ref(false)
const drawer = ref(false)
const saving = ref(false)
const current = ref(null)
const dragItem = ref(null)
const dragOver = ref('')
const query = reactive({ page: 1, page_size: 20, status: '', order_type: '', keyword: '' })
const form = reactive({ title: '', order_type: 'fault', device_id: null, priority: 'mid', assignee: '', content: '', alarm_id: null })

const columns = [
  { key: 'pending', label: '待处理', tone: 'stop' },
  { key: 'assigned', label: '已指派', tone: 'offline' },
  { key: 'processing', label: '处理中', tone: 'normal' },
  { key: 'closed', label: '已闭环', tone: 'normal' },
]

const grouped = computed(() => {
  const g = { pending: [], assigned: [], processing: [], closed: [] }
  all.value.forEach((o) => (g[o.status] || g.pending).push(o))
  return g
})

const flowSteps = [
  { key: 'pending', label: '待处理' },
  { key: 'assigned', label: '已指派' },
  { key: 'processing', label: '处理中' },
  { key: 'closed', label: '已闭环' },
]
const stepActive = computed(() => flowSteps.findIndex((s) => s.key === current.value?.status) + 1)

const typeLabel = (t) => ({ fault: '故障处理', inspection: '巡检异常', maintain: '计划保养' }[t] || t)
const labelOf = (s) => ({ pending: '待处理', assigned: '已指派', processing: '处理中', closed: '已闭环' }[s] || s)

async function reload() {
  const r = await api.workorders.list({ ...query, page_size: 200, all: true })
  const list = Array.isArray(r) ? r : r.results
  all.value = list
  rows.value = list
}

let t = null
function debounced() {
  clearTimeout(t)
  t = setTimeout(reload, 300)
}

function onDragStart(o) {
  dragItem.value = o
}
async function onDrop(status) {
  dragOver.value = ''
  const o = dragItem.value
  dragItem.value = null
  if (!o || o.status === status) return
  await move(o, status)
}

async function move(o, to, extra = {}) {
  try {
    const r = await api.workorders.transition(o.id, to, extra)
    ElMessage.success(`已流转至「${labelOf(to)}」`)
    if (to === 'closed') ElMessage.info('关联告警已关闭，设备状态已恢复')
    await reload()
    if (current.value?.id === r.id) current.value = r
  } catch (e) {
    ElMessage.error(e.message)
    await reload()
  }
}

async function assign(o) {
  try {
    const { value } = await ElMessageBox.prompt('输入处理人姓名', '指派工单', { inputValue: '张伟', confirmButtonText: '指派', cancelButtonText: '取消' })
    await move(o, 'assigned', { assignee: value })
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

async function finish(o, fromDrawer) {
  try {
    const { value } = await ElMessageBox.prompt('填写处理结果', '工单闭环', {
      inputValue: '已更换故障部件并复测，指标恢复正常',
      confirmButtonText: '确认闭环',
      cancelButtonText: '取消',
      inputType: 'textarea',
    })
    await move(o, 'closed', { result: value })
    if (fromDrawer) {
      drawer.value = false
      current.value = null
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

function detail(o) {
  current.value = o
  drawer.value = true
}

function openCreate() {
  Object.assign(form, { title: '', order_type: 'fault', device_id: null, priority: 'mid', assignee: '', content: '', alarm_id: null })
  dialog.value = true
}

async function save() {
  if (!form.title) return ElMessage.warning('请填写标题')
  saving.value = true
  try {
    await api.workorders.create({ ...form })
    ElMessage.success('工单已创建')
    dialog.value = false
    await reload()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))} 分钟前`
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`
  return `${Math.floor(d / 86400)} 天前`
}

onMounted(async () => {
  if (!deviceStore.devices.length) await deviceStore.loadAll()
  await reload()
  if (route.query.create === '1') {
    openCreate()
    if (route.query.alarm) form.alarm_id = Number(route.query.alarm)
    if (route.query.device) {
      const d = deviceStore.byCode[route.query.device]
      if (d) {
        form.device_id = d.id
        form.title = `${d.code} 故障处理`
        form.priority = d.status === 'fault' ? 'high' : 'mid'
      }
    }
  }
})
</script>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  align-items: start;
}
.col {
  border-radius: 10px;
  background: linear-gradient(180deg, #101823 0%, #0c121a 100%);
  border: 1px solid var(--line-soft);
  min-height: calc(100vh - 190px);
  transition: border-color 0.15s, background 0.15s;
}
.col.over {
  border-color: rgba(47, 129, 247, 0.55);
  background: rgba(47, 129, 247, 0.07);
}
.col-hd {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 13px;
  border-bottom: 1px solid var(--line-soft);
  font-size: 12px;
}
.col-hd b {
  font-weight: 550;
}
.col-hd .cnt {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--txt-3);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 7px;
  border-radius: 9px;
}
.col-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: calc(100vh - 250px);
}
.card {
  padding: 10px 11px 8px;
  border-radius: 8px;
  background: #121a25;
  border: 1px solid var(--line-soft);
  cursor: grab;
  transition: all 0.15s;
}
.card:hover {
  border-color: rgba(47, 129, 247, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
.card:active {
  cursor: grabbing;
}
.c-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.c-no {
  font-size: 9.5px;
  color: #526274;
}
.c-title {
  margin: 6px 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #d8e2ed;
}
.c-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: #5f6d7d;
  align-items: center;
}
.c-type {
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
}
.c-assignee {
  margin-left: auto;
  color: #8fb8e8;
}
.c-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed rgba(70, 90, 115, 0.16);
  font-size: 9.5px;
  color: #46525f;
}
:deep(.act) {
  color: #7fc4ff;
  font-size: 10.5px;
  padding: 2px 4px;
  height: 20px;
}
:deep(.act.ok) {
  color: #7ee2a8;
}
.col-empty {
  padding: 26px 0;
  text-align: center;
  font-size: 11px;
  color: #333f4d;
  border: 1px dashed rgba(70, 90, 115, 0.18);
  border-radius: 8px;
}
.filters {
  display: flex;
  gap: 8px;
}
.d-title {
  margin: 0 0 10px;
  font-size: 15px;
}
.d-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.d-kv {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(70, 90, 115, 0.14);
}
.d-kv span {
  color: var(--txt-3);
}
.d-sec {
  margin-top: 16px;
}
.d-sec h4 {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--txt-3);
  font-weight: 500;
}
.d-sec p {
  margin: 0;
  font-size: 12px;
  color: #c3cfdb;
  line-height: 1.7;
}
.steps {
  display: flex;
  gap: 6px;
  margin: 16px 0;
}
.steps span {
  flex: 1;
  text-align: center;
  font-size: 10.5px;
  padding: 6px 0;
  border-radius: 5px;
  color: #4d5b6b;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line-soft);
}
.steps span.done {
  color: #a9d1ff;
  background: rgba(47, 129, 247, 0.14);
  border-color: rgba(47, 129, 247, 0.35);
}
.d-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.d-tip {
  display: flex;
  gap: 6px;
  font-size: 10.5px;
  color: #5f6d7d;
  margin-top: 18px;
  line-height: 1.6;
}
</style>
