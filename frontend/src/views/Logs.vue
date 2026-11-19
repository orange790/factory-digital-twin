<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>审计日志</h2>
        <p>登录、台账变更、告警处理、工单流转、场景配置均留痕（OperatorLog）</p>
      </div>
      <el-tag v-if="!auth.can('audit')" type="warning" effect="plain" size="small">当前角色无查看权限（仅管理员）</el-tag>
    </div>

    <div class="panel">
      <div class="panel-bd" style="padding: 0">
        <el-table :data="rows" size="small" v-loading="loading">
          <el-table-column label="时间" width="168">
            <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(0, 19).replace('T', ' ') }}</span></template>
          </el-table-column>
          <el-table-column prop="operator" label="操作人" width="110" />
          <el-table-column label="动作" width="200">
            <template #default="{ row }">
              <span class="tag info">{{ actionLabel(row.action) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="target" label="对象" width="180">
            <template #default="{ row }"><span class="mono tiny">{{ row.target }}</span></template>
          </el-table-column>
          <el-table-column label="变更内容" min-width="300">
            <template #default="{ row }">
              <span class="mono tiny diff">
                <span v-if="row.before" class="del">{{ short(row.before) }}</span>
                <span v-if="row.before && row.after" class="arrow">→</span>
                <span v-if="row.after" class="add">{{ short(row.after) }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="ip" label="IP" width="120">
            <template #default="{ row }"><span class="mono tiny">{{ row.ip }}</span></template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="total, prev, pager, next" size="small" @change="load" />
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

const auth = useAuthStore()
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)

const ACTION_LABELS = {
  LOGIN: '登录',
  ALARM_ACK: '确认告警',
  ALARM_CLOSE: '关闭告警',
  ALARM_RULE_UPDATE: '修改告警规则',
  DEVICE_CREATE: '新增设备',
  DEVICE_UPDATE: '修改设备',
  DEVICE_DELETE: '删除设备',
  DEVICE_COMMAND: '下发指令',
  WORKORDER_CREATE: '创建工单',
  WORKORDER_TRANSITION: '工单流转',
  INSPECTION_SUBMIT: '提交巡检',
  SCENE_CONFIG_UPDATE: '场景配置',
  SNAPSHOT_SAVE: '保存快照',
  MAINTAIN_ADD: '登记保养',
  POINT_CREATE: '新增点位',
  ROUTE_CREATE: '新增路线',
}
const actionLabel = (a) => ACTION_LABELS[a] || a

function short(obj) {
  if (!obj) return ''
  const s = JSON.stringify(obj)
  return s.length > 62 ? s.slice(0, 62) + '…' : s
}

async function load() {
  loading.value = true
  try {
    const r = await api.logs.list({ page: page.value, page_size: 20 })
    rows.value = r.results
    total.value = r.count
  } catch (e) {
    rows.value = []
    total.value = 0
    ElMessage.warning(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.diff .del {
  color: #ff9a94;
  text-decoration: line-through;
  opacity: 0.75;
}
.diff .add {
  color: #7ee2a8;
}
.diff .arrow {
  color: #4d5b6b;
  margin: 0 6px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
}
</style>
