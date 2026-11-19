<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>巡检管理</h2>
        <p>计划下发 → 执行打点 → 提交结果 → 异常自动转工单</p>
      </div>
      <div class="actions">
        <el-button size="small" @click="$router.push('/inspection/route')"><el-icon><Guide /></el-icon> 三维巡检路线</el-button>
        <el-button size="small" type="primary" :disabled="auth.isGuest" @click="openPlan">
          <el-icon><Plus /></el-icon> 新建计划
        </el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="insp-tabs">
      <el-tab-pane label="巡检任务" name="task">
        <div class="panel">
          <div class="panel-bd" style="padding: 0">
            <el-table :data="tasks" size="small">
              <el-table-column label="任务号" width="90">
                <template #default="{ row }"><span class="mono tiny">TASK-{{ String(row.id).padStart(3, '0') }}</span></template>
              </el-table-column>
              <el-table-column prop="route_name" label="巡检路线" min-width="170" />
              <el-table-column label="点位数" width="86">
                <template #default="{ row }"><span class="mono">{{ row.point_count }}</span></template>
              </el-table-column>
              <el-table-column label="已记录" width="86">
                <template #default="{ row }"><span class="mono">{{ row.record_count }}</span></template>
              </el-table-column>
              <el-table-column prop="executor" label="执行人" width="90">
                <template #default="{ row }">{{ row.executor || '未分配' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="96">
                <template #default="{ row }">
                  <span class="tag" :class="{ pending: 'warn', doing: 'info', done: 'normal', abnormal: 'critical' }[row.status]">
                    {{ { pending: '待执行', doing: '执行中', done: '已完成', abnormal: '有异常' }[row.status] }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="创建时间" width="150">
                <template #default="{ row }"><span class="mono tiny">{{ row.created_at.slice(5, 16).replace('T', ' ') }}</span></template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button text size="small" :disabled="row.status === 'done' || auth.isGuest" @click="startTask(row)">执行</el-button>
                  <el-button text size="small" @click="$router.push('/inspection/route')">路线</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="巡检计划" name="plan">
        <div class="panel">
          <div class="panel-bd" style="padding: 0">
            <el-table :data="plans" size="small">
              <el-table-column prop="name" label="计划名称" min-width="200" />
              <el-table-column label="巡检路线" width="200">
                <template #default="{ row }">{{ routeName(row.route_id) }}</template>
              </el-table-column>
              <el-table-column label="周期" width="100">
                <template #default="{ row }">{{ { daily: '每日', weekly: '每周', custom: '自定义' }[row.cycle] }}</template>
              </el-table-column>
              <el-table-column prop="assignee" label="负责人" width="100" />
              <el-table-column label="启用" width="80">
                <template #default="{ row }"><el-switch v-model="row.enabled" size="small" disabled /></template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="巡检点位" name="point">
        <div class="panel">
          <div class="panel-hd">
            <h3>点位清单</h3>
            <span class="tiny muted">点位坐标即三维打点结果，可直接用于路线生成</span>
          </div>
          <div class="panel-bd" style="padding: 0">
            <el-table :data="points" size="small">
              <el-table-column prop="name" label="点位名称" min-width="160" />
              <el-table-column prop="device_code" label="关联设备" width="110">
                <template #default="{ row }"><span class="mono">{{ row.device_code || '—' }}</span></template>
              </el-table-column>
              <el-table-column label="三维坐标" width="200">
                <template #default="{ row }">
                  <span class="mono tiny">{{ fmtRow(row) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="检查项" min-width="280">
                <template #default="{ row }">
                  <span v-for="c in row.check_items" :key="c" class="check-chip">{{ c }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 执行巡检 -->
    <el-dialog v-model="execDialog" :title="`执行巡检 · TASK-${String(currentTask?.id || '').padStart(3, '0')}`" width="720px" append-to-body>
      <div class="exec-list">
        <div v-for="(item, idx) in execItems" :key="item.point_id" class="exec-item" :class="{ abnormal: item.is_abnormal }">
          <div class="ei-hd">
            <b>{{ idx + 1 }}. {{ item.name }}</b>
            <span class="mono tiny">{{ item.device_code }}</span>
            <el-switch v-model="item.is_abnormal" size="small" active-text="异常" style="margin-left: auto" />
          </div>
          <div class="ei-items">
            <el-checkbox v-for="c in item.check_items" :key="c" v-model="item.result[c]">{{ c }}</el-checkbox>
          </div>
          <el-input v-if="item.is_abnormal" v-model="item.remark" size="small" placeholder="异常描述（提交后自动生成巡检异常工单）" />
        </div>
      </div>
      <template #footer>
        <el-button @click="execDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTask">提交结果</el-button>
      </template>
    </el-dialog>

    <!-- 新建计划 -->
    <el-dialog v-model="planDialog" title="新建巡检计划" width="520px" append-to-body>
      <el-form :model="planForm" label-width="86px">
        <el-form-item label="计划名称"><el-input v-model="planForm.name" /></el-form-item>
        <el-form-item label="巡检路线">
          <el-select v-model="planForm.route_id" style="width: 100%">
            <el-option v-for="r in routes" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="周期">
          <el-radio-group v-model="planForm.cycle">
            <el-radio value="daily">每日</el-radio>
            <el-radio value="weekly">每周</el-radio>
            <el-radio value="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="负责人"><el-input v-model="planForm.assignee" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialog = false">取消</el-button>
        <el-button type="primary" @click="planDialog = false">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const tab = ref('task')
const tasks = ref([])
const plans = ref([])
const points = ref([])
const routes = ref([])
const execDialog = ref(false)
const planDialog = ref(false)
const submitting = ref(false)
const currentTask = ref(null)
const execItems = ref([])
const planForm = reactive({ name: '', route_id: 1, cycle: 'daily', assignee: '张伟' })

const fmtRow = (row) => `${Number(row?.position_x ?? 0).toFixed(1)}, ${Number(row?.position_z ?? 0).toFixed(1)}`

const routeName = (id) => routes.value.find((r) => r.id === id)?.name || '—'

async function loadAll() {
  const [t, pl, pts, rs] = await Promise.all([
    api.inspection.tasks(),
    api.inspection.plans(),
    api.inspection.points(),
    api.inspection.routes(),
  ])
  tasks.value = t
  plans.value = pl
  points.value = pts
  routes.value = rs
}

function startTask(task) {
  currentTask.value = task
  const route = routes.value.find((r) => r.id === task.route_id)
  execItems.value = (route?.points || []).map((p) => ({
    point_id: p.id,
    name: p.name,
    device_code: p.device_code,
    check_items: p.check_items,
    is_abnormal: false,
    remark: '',
    result: Object.fromEntries(p.check_items.map((c) => [c, true])),
  }))
  execDialog.value = true
}

async function submitTask() {
  submitting.value = true
  try {
    const r = await api.inspection.submit(currentTask.value.id, { executor: auth.username, items: execItems.value })
    ElMessage.success(`巡检已提交，${r.abnormal > 0 ? `生成 ${r.abnormal} 条异常工单` : '未发现异常'}`)
    execDialog.value = false
    await loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}

function openPlan() {
  planDialog.value = true
}

onMounted(loadAll)
</script>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
.insp-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
.check-chip {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  margin: 2px 4px 2px 0;
  border-radius: 3px;
  background: rgba(47, 129, 247, 0.1);
  color: #8fb8e8;
  border: 1px solid rgba(47, 129, 247, 0.2);
}
.exec-list {
  max-height: 58vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.exec-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--line-soft);
}
.exec-item.abnormal {
  border-color: rgba(248, 81, 73, 0.35);
  background: rgba(248, 81, 73, 0.05);
}
.ei-hd {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  margin-bottom: 8px;
}
.ei-items {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
:deep(.el-checkbox__label) {
  font-size: 11.5px;
}
</style>
