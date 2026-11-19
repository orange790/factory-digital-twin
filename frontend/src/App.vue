<template>
  <div v-if="isBlank" class="blank-shell">
    <router-view />
  </div>

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4z" />
            <path d="M12 21.4V12M21 7.4 12 12 3 7.4" />
          </svg>
        </div>
        <div class="brand-txt">
          <b>FT-Twin</b>
          <span>工厂数字孪生运维平台</span>
        </div>
      </div>

      <nav class="nav">
        <template v-for="g in navGroups" :key="g.name">
          <div class="nav-group">{{ g.name }}</div>
          <router-link
            v-for="item in g.items"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item) }"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.title }}</span>
            <span v-if="item.path === '/alarm' && alarmStore.activeCount" class="nav-badge">{{ alarmStore.activeCount }}</span>
          </router-link>
        </template>
      </nav>

      <div class="side-foot">
        <div class="rt-row">
          <span class="rt-dot" :class="rtOnline ? 'on' : 'off'"></span>
          <span>实时通道</span>
          <b>{{ rtLabel }}</b>
        </div>
        <div class="rt-sub">数据源：{{ admin ? 'Django REST' : '本地模拟' }}</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="crumb">
          <span class="grp">{{ route.meta.group || '监控中心' }}</span>
          <el-icon class="sep"><ArrowRight /></el-icon>
          <span class="cur">{{ route.meta.title }}</span>
        </div>

        <div class="top-right">
          <div class="realtime-pill" :class="rtOnline ? 'ok' : 'degraded'" :title="rtHint">
            <span class="rt-dot" :class="rtOnline ? 'on' : 'off'"></span>
            {{ rtLabel }}
          </div>

          <el-button text class="icon-btn" @click="$router.push('/alarm')">
            <el-badge :value="alarmStore.activeCount" :hidden="!alarmStore.activeCount" :max="99" type="danger">
              <el-icon :size="17"><Bell /></el-icon>
            </el-badge>
          </el-button>

          <el-button text class="icon-btn" @click="$router.push('/twin')">
            <el-icon :size="17"><Monitor /></el-icon>
          </el-button>

          <el-dropdown trigger="click" @command="onCommand">
            <div class="user">
              <el-avatar :size="24" class="ava">{{ (auth.username || 'G')[0].toUpperCase() }}</el-avatar>
              <div class="user-txt">
                <b>{{ auth.username || 'guest' }}</b>
                <span>{{ auth.roleMeta.label }}</span>
              </div>
              <el-icon :size="12"><CaretBottom /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>{{ auth.roleMeta.label }} · {{ auth.role }}</el-dropdown-item>
                <el-dropdown-item command="about">项目介绍</el-dropdown-item>
                <el-dropdown-item command="source">切换数据源（{{ sourceLabel }}）</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <section class="content" :class="{ full: route.meta.full }">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElNotification, ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useAlarmStore } from '@/stores/alarm'
import { useDeviceStore } from '@/stores/device'
import { simulator } from '@/mock/simulator'
import { runtime, setSource, getToken } from '@/api'
import { createMqttChannel } from '@/api/mqtt'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const alarmStore = useAlarmStore()
const deviceStore = useDeviceStore()

const isBlank = computed(() => route.meta.layout === 'blank')
const admin = computed(() => runtime.mode === 'http')
const sourceLabel = computed(() => (runtime.mode === 'http' ? 'Django REST' : '浏览器模拟'))
const rtLabel = ref('SIM 1.2s')
const rtOnline = ref(true)
const rtHint = ref('虚拟设备模拟器正在推送数据（1.2s 心跳）')

const navGroups = [
  {
    name: '监控中心',
    items: [
      { path: '/', title: '首页总览', icon: 'Odometer' },
      { path: '/twin', title: '数字孪生', icon: 'Box' },
      { path: '/twin/bigscreen', title: '大屏模式', icon: 'FullScreen' },
    ],
  },
  {
    name: '资产与运维',
    items: [
      { path: '/device', title: '设备台账', icon: 'Cpu' },
      { path: '/alarm', title: '告警中心', icon: 'Bell' },
      { path: '/workorder', title: '运维工单', icon: 'Tickets' },
      { path: '/inspection', title: '巡检管理', icon: 'List' },
      { path: '/inspection/route', title: '巡检路线', icon: 'Guide' },
    ],
  },
  {
    name: '分析',
    items: [
      { path: '/heatmap', title: '热力分析', icon: 'DataLine' },
      { path: '/replay', title: '状态回放', icon: 'VideoPlay' },
      { path: '/report', title: '报表中心', icon: 'Document' },
    ],
  },
  {
    name: '系统',
    items: [
      { path: '/admin-config', title: '场景配置', icon: 'Setting' },
      { path: '/logs', title: '审计日志', icon: 'Files' },
      { path: '/about', title: '项目介绍', icon: 'InfoFilled' },
    ],
  },
]

function isActive(item) {
  if (item.path === '/') return route.path === '/'
  return route.path === item.path || (item.path !== '/' && route.path.startsWith(item.path) && item.path !== '/twin')
}

let unsub = null
let lastNotified = 0
let inited = false

async function init() {
  if (inited || isBlank.value || !getToken()) return
  inited = true
  try {
    await deviceStore.loadAll()
    await alarmStore.loadActive()
  } catch (e) {
    inited = false
    if (e?.status === 401) return router.push('/login')
    ElMessage.error(e.message || '初始化失败')
    return
  }
  if (runtime.mode === 'http') {
    startRealtime()
    return
  }
  simulator.start()
  unsub = simulator.on((evt) => {
    if (evt.type === 'tick') deviceStore.applyTick(evt)
    if (evt.alarms?.length) {
      const a = evt.alarms[0]
      const now = Date.now()
      if (now - lastNotified > 4000) {
        lastNotified = now
        notifyAlarm(a)
      }
    }
  })
  alarmStore.bindSimulator()
}

onMounted(init)
// 登录页是同一 SPA 内的跳转，挂载钩子不会重跑，用路由变化补一次初始化
watch(() => route.path, () => init())

/* ---------------- http 模式：MQTT 优先，3s 轮询兜底 ---------------- */
let pollTimer = null
let mqttChannel = null
let knownAlarms = new Set()

/** 先试 MQTT（EMQX WebSocket）；2.6s 内连不上就退回 HTTP 轮询 */
function startRealtime() {
  mqttChannel = createMqttChannel({
    onState: (s) => {
      rtLabel.value = s === 'mqtt' ? 'MQTT' : 'POLL 3s'
      rtOnline.value = true
      if (s === 'fallback') startPolling(15000) // MQTT 已接管失败 → 轮询放慢
    },
    onStatus: (msg) => deviceStore.applyTelemetry(msg),
    onTelemetry: (msg) => deviceStore.applyTelemetry(msg),
    onAlarm: (a) => {
      const now = Date.now()
      if (now - lastNotified > 4000 && a.device_code) {
        lastNotified = now
        notifyAlarm({ level: a.level, device_code: a.device_code, content: a.content || '设备告警' })
      }
      alarmStore.loadActive()
    },
  })
  // MQTT 连接期间先用轮询保证首屏有数据
  startPolling(3000)
  setTimeout(() => {
    if (mqttChannel?.connected) {
      stopPolling()
      startPolling(30000) // 心跳，兜住漏消息
    }
  }, 3000)
}

function notifyAlarm(a) {
  ElNotification({
    title: a.level === 'critical' ? '紧急告警' : '告警提醒',
    message: `${a.device_code} · ${a.content}`,
    type: a.level === 'critical' ? 'error' : 'warning',
    duration: 4200,
    position: 'bottom-right',
  })
}

function startPolling(interval = 3000) {
  stopPolling()
  const tick = async () => {
    if (!getToken()) return
    try {
      await deviceStore.refreshLive()
      const list = await alarmStore.loadActive()
      const now = Date.now()
      ;(list || []).forEach((a) => {
        if (!knownAlarms.has(a.id)) {
          knownAlarms.add(a.id)
          if (now - lastNotified > 4000 && knownAlarms.size > 1) {
            lastNotified = now
            notifyAlarm(a)
          }
        }
      })
    } catch (e) {
      if (e?.status === 401) {
        stopPolling()
        auth.logout()
        router.push('/login')
      }
    }
  }
  tick()
  pollTimer = setInterval(tick, interval)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

onUnmounted(() => {
  unsub?.()
  stopPolling()
  mqttChannel?.close()
})

function onCommand(cmd) {
  if (cmd === 'logout') {
    stopPolling()
    mqttChannel?.close()
    mqttChannel = null
    unsub?.()
    unsub = null
    inited = false
    auth.logout()
    router.push('/login')
  } else if (cmd === 'about') {
    router.push('/about')
  } else if (cmd === 'source') {
    setSource(runtime.mode === 'http' ? 'mock' : 'http')
    ElMessage.success(`数据源已切换为 ${runtime.mode === 'http' ? 'Django REST' : '浏览器模拟'}，正在重新加载`)
    setTimeout(() => location.reload(), 500)
  }
}
</script>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.blank-shell {
  height: 100%;
}

/* ---------- 侧栏 ---------- */
.sidebar {
  width: 212px;
  flex: none;
  background: linear-gradient(180deg, #0a0e14 0%, #080b10 100%);
  border-right: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
}
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line-soft);
}
.logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #7fc4ff;
  background: linear-gradient(140deg, rgba(47, 129, 247, 0.26), rgba(34, 211, 238, 0.1));
  border: 1px solid rgba(47, 129, 247, 0.35);
}
.brand-txt {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.brand-txt b {
  font-size: 13.5px;
  letter-spacing: 0.06em;
}
.brand-txt span {
  font-size: 9.5px;
  color: var(--txt-3);
  letter-spacing: 0.02em;
}

.nav {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px 16px;
}
.nav-group {
  font-size: 10px;
  color: #4d5b6b;
  letter-spacing: 0.1em;
  padding: 12px 8px 6px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 10px;
  border-radius: 7px;
  color: #93a1b1;
  font-size: 12.5px;
  position: relative;
  transition: all 0.15s;
  margin-bottom: 1px;
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.035);
  color: #d4e0ec;
}
.nav-item.active {
  background: linear-gradient(90deg, rgba(47, 129, 247, 0.2), rgba(47, 129, 247, 0.05));
  color: #cfe3ff;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 8px;
  bottom: 8px;
  width: 2.5px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.nav-badge {
  margin-left: auto;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(248, 81, 73, 0.2);
  color: #ff8b84;
  font-size: 10px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(248, 81, 73, 0.35);
}

.side-foot {
  padding: 10px 14px 12px;
  border-top: 1px solid var(--line-soft);
}
.rt-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--txt-3);
}
.rt-row b {
  margin-left: auto;
  color: #8fb8e8;
  font-weight: 500;
  font-family: var(--mono);
  font-size: 10.5px;
}
.rt-sub {
  font-size: 10px;
  color: #46525f;
  margin-top: 5px;
}
.rt-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--normal);
  box-shadow: 0 0 7px rgba(63, 185, 80, 0.7);
}
.rt-dot.off {
  background: var(--stop);
  box-shadow: none;
}

/* ---------- 主区 ---------- */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  height: 52px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 0 22px;
  border-bottom: 1px solid var(--line-soft);
  background: rgba(10, 14, 20, 0.86);
  backdrop-filter: blur(8px);
}
.crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.crumb .grp {
  color: var(--txt-3);
}
.crumb .sep {
  font-size: 10px;
  color: #3d4855;
}
.crumb .cur {
  color: var(--txt-1);
  font-weight: 550;
}
.top-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.realtime-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 11px;
  font-family: var(--mono);
  border: 1px solid var(--line);
  color: #9aa7b6;
  background: rgba(255, 255, 255, 0.02);
}
.realtime-pill.ok {
  border-color: rgba(63, 185, 80, 0.3);
  color: #7bd889;
  background: rgba(63, 185, 80, 0.07);
}
.realtime-pill.degraded {
  border-color: rgba(210, 153, 34, 0.35);
  color: #e3b341;
}
.icon-btn {
  padding: 5px 7px;
  color: var(--txt-2);
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px 3px 4px;
  border-radius: 16px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.user:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--line);
}
.ava {
  background: linear-gradient(140deg, #2f81f7, #22d3ee);
  color: #04121c;
  font-weight: 700;
  font-size: 12px;
}
.user-txt {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.user-txt b {
  font-size: 12px;
  font-weight: 550;
}
.user-txt span {
  font-size: 9.5px;
  color: var(--txt-3);
}
.content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.content.full {
  overflow: hidden;
}
</style>
