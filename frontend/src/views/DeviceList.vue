<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>设备台账</h2>
        <p>共 {{ total }} 台设备 · 三维节点名与编码强绑定（DEV_{code}）· 新增后即时出现在场景对应坐标</p>
      </div>
      <div class="actions">
        <el-button size="small" @click="exportCsv"><el-icon><Download /></el-icon> 导出</el-button>
        <el-button size="small" :disabled="!auth.can('device')" @click="triggerImport"><el-icon><Upload /></el-icon> 导入</el-button>
        <el-button size="small" type="primary" :disabled="!auth.can('device')" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增设备
        </el-button>
        <input ref="fileRef" type="file" accept=".csv" hidden @change="onImport" />
      </div>
    </div>

    <div class="device-layout">
      <div class="panel tree-panel">
        <div class="panel-hd"><h3>设备树</h3><span class="tiny muted">区域 → 产线 → 设备</span></div>
        <div class="panel-bd tree-body">
          <el-input v-model="treeFilter" size="small" placeholder="过滤节点…" clearable :prefix-icon="Search" />
          <el-tree
            ref="treeRef"
            :data="treeData"
            :props="{ label: 'label', children: 'children' }"
            node-key="key"
            highlight-current
            :filter-node-method="filterNode"
            :expand-on-click-node="false"
            @node-click="onNodeClick"
            class="dev-tree"
          >
            <template #default="{ data }">
              <span class="tree-node" :class="data.type">
                <span v-if="data.status" class="dot" :class="data.status"></span>
                <span class="tn-label">{{ data.label }}</span>
                <span v-if="data.count" class="tn-count">{{ data.count }}</span>
              </span>
            </template>
          </el-tree>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <div class="filters">
            <el-input v-model="query.keyword" size="small" placeholder="搜索编码 / 名称" clearable style="width: 190px" :prefix-icon="Search" @input="debouncedSearch" />
            <el-select v-model="query.status" size="small" placeholder="状态" clearable style="width: 106px" @change="reload">
              <el-option v-for="s in statusOrder" :key="s" :label="statusLabel(s)" :value="s" />
            </el-select>
            <el-select v-model="query.area_code" size="small" placeholder="区域" clearable style="width: 116px" @change="reload">
              <el-option v-for="a in areas" :key="a.code" :label="a.name" :value="a.code" />
            </el-select>
            <el-select v-model="query.device_type" size="small" placeholder="类型" clearable style="width: 106px" @change="reload">
              <el-option v-for="t in typeOptions" :key="t.v" :label="t.l" :value="t.v" />
            </el-select>
            <el-button size="small" text @click="resetQuery">重置</el-button>
          </div>
          <span class="tiny muted">{{ total }} 条</span>
        </div>

        <div class="panel-bd" style="padding: 0 0 8px">
          <el-table :data="rows" size="small" v-loading="loading" @row-dblclick="(row) => $router.push(`/device/${row.id}`)" height="calc(100vh - 300px)">
            <el-table-column prop="code" label="编码" width="86" fixed>
              <template #default="{ row }"><span class="mono linkish" @click="$router.push(`/device/${row.id}`)">{{ row.code }}</span></template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="210" show-overflow-tooltip />
            <el-table-column label="状态" width="104">
              <template #default="{ row }">
                <span class="tag" :class="row.status"><span class="dot" :class="row.status"></span>{{ statusLabel(row.status) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="86">
              <template #default="{ row }">{{ typeLabel(row.device_type) }}</template>
            </el-table-column>
            <el-table-column prop="area_name" label="区域" width="124" show-overflow-tooltip />
            <el-table-column prop="line_code" label="产线" width="72" />
            <el-table-column label="实时温度" width="98">
              <template #default="{ row }">
                <span class="mono">{{ tempOf(row.code) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="额定功率" width="92">
              <template #default="{ row }"><span class="mono">{{ row.rated_power }}kW</span></template>
            </el-table-column>
            <el-table-column label="保养" width="100">
              <template #default="{ row }">
                <span v-if="row.overdue > 0" class="tag critical">超期 {{ row.overdue }}d</span>
                <span v-else class="tiny muted">{{ row.last_maintain_date || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="176" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" @click="$router.push(`/device/${row.id}`)">详情</el-button>
                <el-button text size="small" :disabled="!auth.can('device')" @click="openEdit(row)">编辑</el-button>
                <el-button text size="small" type="danger" :disabled="!auth.can('device')" @click="remove(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="query.page"
              v-model:page-size="query.page_size"
              :total="total"
              :page-sizes="[15, 30, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              size="small"
              @change="reload"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑设备' : '新增设备'" width="620px" append-to-body>
      <el-form :model="form" label-width="96px" size="default">
        <div class="form-grid">
          <el-form-item label="设备编码" required>
            <el-input v-model="form.code" placeholder="如 M73" :disabled="!!form.id" />
          </el-form-item>
          <el-form-item label="设备名称" required>
            <el-input v-model="form.name" placeholder="如 CNC加工中心-A1-13" />
          </el-form-item>
          <el-form-item label="设备类型">
            <el-select v-model="form.device_type" style="width: 100%">
              <el-option v-for="t in typeOptions" :key="t.v" :label="t.l" :value="t.v" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属区域">
            <el-select v-model="form.area_id" style="width: 100%">
              <el-option v-for="a in areas" :key="a.id" :label="a.name" :value="a.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属产线">
            <el-select v-model="form.line_id" style="width: 100%" clearable>
              <el-option v-for="l in allLines" :key="l.id" :label="`${l.code} · ${l.name}`" :value="l.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="额定功率">
            <el-input-number v-model="form.rated_power" :min="0" :step="0.5" style="width: 100%" />
          </el-form-item>
          <el-form-item label="X 坐标">
            <el-input-number v-model="form.position_x" :min="-45" :max="45" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="Z 坐标">
            <el-input-number v-model="form.position_z" :min="-30" :max="30" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="保养周期">
            <el-input-number v-model="form.maintain_cycle_days" :min="1" :step="15" style="width: 100%" />
          </el-form-item>
          <el-form-item label="关键设备">
            <el-switch v-model="form.is_critical" />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="form.desc" type="textarea" :rows="2" />
        </el-form-item>
        <p class="form-tip">
          <el-icon><InfoFilled /></el-icon>
          保存后三维场景会按 X / Z 坐标即时生成节点 <b class="mono">DEV_{{ form.code || 'xxx' }}</b>，无需改代码
        </p>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useDeviceStore } from '@/stores/device'
import { STATUS_META, DEVICE_TYPE_META, overdueDays } from '@/mock/seed'

const auth = useAuthStore()
const deviceStore = useDeviceStore()

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const areas = ref([])
const allLines = ref([])
const treeData = ref([])
const treeFilter = ref('')
const treeRef = ref(null)
const fileRef = ref(null)
const dialog = ref(false)
const saving = ref(false)

const query = reactive({ page: 1, page_size: 15, keyword: '', status: '', area_code: '', device_type: '' })
const form = reactive({})

const statusOrder = ['normal', 'fault', 'stop', 'offline']
const typeOptions = Object.entries(DEVICE_TYPE_META).map(([v, m]) => ({ v, l: m.label }))
const statusLabel = (s) => STATUS_META[s]?.label || s
const typeLabel = (t) => DEVICE_TYPE_META[t]?.label || t

const tempOf = (code) => {
  const v = deviceStore.live[code]?.temperature
  return v === undefined ? '—' : `${v.toFixed(1)}°C`
}

let searchTimer = null
function debouncedSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    query.page = 1
    reload()
  }, 280)
}

async function reload() {
  loading.value = true
  try {
    const r = await api.devices.list({ ...query })
    rows.value = r.results.map((d) => ({ ...d, overdue: Math.max(0, overdueDays(d)) }))
    total.value = r.count
  } finally {
    loading.value = false
  }
}

async function loadTree() {
  await deviceStore.refreshTree()
  areas.value = deviceStore.tree
  allLines.value = deviceStore.tree.flatMap((a) => a.lines || [])
  treeData.value = deviceStore.tree.map((a) => ({
    key: `area-${a.id}`,
    label: a.name,
    type: 'area',
    count: (a.lines || []).reduce((s, l) => s + l.devices.length, 0) + a.devices.length,
    children: [
      ...(a.lines || []).map((l) => ({
        key: `line-${l.id}`,
        label: `${l.code} · ${l.name}`,
        type: 'line',
        count: l.devices.length,
        lineId: l.id,
        areaId: a.id,
        children: l.devices.map((d) => ({
          key: `dev-${d.code}`,
          label: `${d.code} ${d.name}`,
          type: 'device',
          status: d.status,
          deviceCode: d.code,
          id: d.id,
        })),
      })),
      ...a.devices.map((d) => ({ key: `dev-${d.code}`, label: `${d.code} ${d.name}`, type: 'device', status: d.status, deviceCode: d.code, id: d.id })),
    ],
  }))
}

function filterNode(value, data) {
  if (!value) return true
  return data.label.toLowerCase().includes(value.toLowerCase())
}
watch(treeFilter, (v) => treeRef.value?.filter(v))

function onNodeClick(data) {
  if (data.type === 'device') {
    query.keyword = data.deviceCode
    query.page = 1
    reload()
  } else if (data.type === 'line') {
    query.area_code = ''
    query.keyword = ''
    query.page = 1
    api.devices.list({ line_id: data.lineId, page_size: query.page_size, page: 1 }).then((r) => {
      rows.value = r.results
      total.value = r.count
    })
  } else {
    const area = areas.value.find((a) => `area-${a.id}` === data.key)
    query.area_code = area?.code || ''
    query.page = 1
    reload()
  }
}

function resetQuery() {
  Object.assign(query, { page: 1, keyword: '', status: '', area_code: '', device_type: '' })
  reload()
}

function openCreate() {
  Object.assign(form, {
    id: null,
    code: '',
    name: '',
    device_type: 'machine',
    area_id: areas.value[0]?.id,
    line_id: allLines.value[0]?.id,
    rated_power: 15,
    position_x: 0,
    position_z: 0,
    maintain_cycle_days: 90,
    is_critical: false,
    desc: '',
  })
  dialog.value = true
}

function openEdit(row) {
  Object.assign(form, { ...row })
  dialog.value = true
}

async function save() {
  if (!form.code || !form.name) return ElMessage.warning('编码与名称必填')
  saving.value = true
  try {
    await api.devices.save({ ...form })
    ElMessage.success('已保存，三维场景已同步')
    dialog.value = false
    await deviceStore.reload()
    await loadTree()
    await reload()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除设备 ${row.code}？三维场景中的节点会同时移除。`, '删除确认', { type: 'warning' })
    await api.devices.remove(row.id)
    ElMessage.success('已删除')
    await deviceStore.reload()
    await loadTree()
    await reload()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

/* ---- CSV 导入 / 导出 ---- */
function exportCsv() {
  const head = ['code', 'name', 'device_type', 'area_code', 'line_code', 'status', 'position_x', 'position_y', 'position_z', 'rated_power', 'maintain_cycle_days']
  const lines = [head.join(',')].concat(
    deviceStore.devices.map((d) => head.map((k) => `"${d[k] ?? ''}"`).join(',')),
  )
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `设备台账-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  ElMessage.success(`已导出 ${deviceStore.devices.length} 条设备台账`)
}

function triggerImport() {
  fileRef.value?.click()
}

async function onImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(Boolean)
  const head = lines.shift().split(',').map((s) => s.trim())
  let ok = 0
  for (const line of lines) {
    const cells = line.split(',').map((s) => s.replace(/^"|"$/g, '').trim())
    if (cells.length < 2) continue
    const obj = {}
    head.forEach((h, i) => (obj[h] = cells[i]))
    const area = areas.value.find((a) => a.code === obj.area_code) || areas.value[0]
    const lineRow = allLines.value.find((l) => l.code === obj.line_code)
    try {
      await api.devices.save({
        code: obj.code,
        name: obj.name,
        device_type: obj.device_type || 'machine',
        area_id: area?.id,
        line_id: lineRow?.id,
        position_x: Number(obj.position_x) || 0,
        position_z: Number(obj.position_z) || 0,
        rated_power: Number(obj.rated_power) || 0,
        maintain_cycle_days: Number(obj.maintain_cycle_days) || 90,
      })
      ok++
    } catch {
      /* 跳过重复编码 */
    }
  }
  ElMessage.success(`导入完成：成功 ${ok} 条`)
  e.target.value = ''
  await deviceStore.reload()
  await loadTree()
  await reload()
}

onMounted(async () => {
  if (!deviceStore.tree.length) await deviceStore.loadAll()
  await loadTree()
  await reload()
})
</script>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
.device-layout {
  display: grid;
  grid-template-columns: 268px 1fr;
  gap: 14px;
}
.tree-body {
  padding: 10px;
  max-height: calc(100vh - 210px);
  overflow: auto;
}
.dev-tree {
  margin-top: 8px;
  background: transparent;
  --el-tree-node-hover-bg-color: rgba(255, 255, 255, 0.04);
}
:deep(.el-tree-node__content) {
  height: 28px;
  border-radius: 5px;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  width: 100%;
}
.tree-node.area .tn-label {
  color: #cfdae6;
  font-weight: 550;
}
.tree-node.line .tn-label {
  color: #9fb0c2;
}
.tree-node.device .tn-label {
  color: #7d8b9c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-count {
  margin-left: auto;
  font-size: 10px;
  color: #4d5b6b;
  font-family: var(--mono);
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
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--txt-3);
  margin: 4px 0 0 2px;
}
</style>
