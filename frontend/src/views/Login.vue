<template>
  <div class="login">
    <div class="bg-grid"></div>
    <div class="glow g1"></div>
    <div class="glow g2"></div>

    <div class="left">
      <div class="brand">
        <div class="logo">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4z" />
            <path d="M12 21.4V12M21 7.4 12 12 3 7.4" />
          </svg>
        </div>
        <div>
          <h1>FT-Twin</h1>
          <p>Factory Digital Twin · Ops Platform</p>
        </div>
      </div>

      <h2 class="slogan">
        让三维场景成为<br /><span>业务数据的一层视图</span>
      </h2>
      <p class="desc">
        设备上报 → 状态渲染 → 告警联动 → 工单闭环 → 数据回流。
        3D 不是炫技 Demo，而是与后端状态强绑定、可双向交互的运行时视图层。
      </p>

      <div class="metrics">
        <div v-for="m in metrics" :key="m.k" class="m-card">
          <i></i>
          <b>{{ m.v }}</b>
          <span>{{ m.k }}</span>
        </div>
      </div>

      <div class="stack">
        <span>Vue 3</span><span>Three.js r170</span><span>Django REST</span><span>MQTT</span><span>ECharts</span>
      </div>
    </div>

    <div class="right">
      <div class="card">
        <h3>登录运维平台</h3>
        <p class="sub">演示环境已内置三组账号，也支持一键只读进入</p>

        <el-form :model="form" @submit.prevent="submit" class="form">
          <el-form-item>
            <el-input v-model="form.username" size="large" placeholder="账号" :prefix-icon="User" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" size="large" placeholder="密码" show-password :prefix-icon="Lock" @keyup.enter="submit" />
          </el-form-item>
          <el-button type="primary" size="large" class="btn-main" :loading="loading" @click="submit">登 录</el-button>
        </el-form>

        <div class="divider"><span>或</span></div>

        <el-button size="large" class="btn-demo" :loading="demoLoading" @click="enterDemo">
          <el-icon><View /></el-icon>
          访客一键进入（只读）
        </el-button>

        <div class="accounts">
          <div class="acc" v-for="a in accounts" :key="a.u" @click="fill(a)">
            <b>{{ a.u }}</b>
            <span>{{ a.p }}</span>
            <em>{{ a.r }}</em>
          </div>
        </div>

        <p class="tips">
          <el-icon><InfoFilled /></el-icon>
          面试官请用「访客一键进入」，30 秒内可直接看到三维场景
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const form = reactive({ username: 'admin', password: 'admin123' })
const loading = ref(false)
const demoLoading = ref(false)

const metrics = [
  { v: '200', k: '设备同屏' },
  { v: '14', k: 'DrawCall' },
  { v: '60', k: 'FPS 目标' },
  { v: '≤500ms', k: '状态延迟' },
]

const accounts = [
  { u: 'admin', p: 'admin123', r: '管理员' },
  { u: 'operator', p: 'operator123', r: '运维' },
  { u: 'demo', p: 'demo', r: '访客' },
]

function fill(a) {
  form.username = a.u
  form.password = a.p
}

async function submit() {
  loading.value = true
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.replace(route.query.redirect || '/')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}

async function enterDemo() {
  demoLoading.value = true
  try {
    await auth.demo()
    router.replace('/twin')
  } catch (e) {
    ElMessage.error(e.message || '进入失败')
  } finally {
    demoLoading.value = false
  }
}
</script>

<style scoped>
.login {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7vw;
  background: radial-gradient(900px 600px at 18% 40%, #0d1a29 0%, #070a0f 62%);
  overflow: hidden;
  padding: 24px;
}
.bg-grid {
  position: absolute;
  inset: -20%;
  background-image: linear-gradient(rgba(47, 129, 247, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(47, 129, 247, 0.07) 1px, transparent 1px);
  background-size: 46px 46px;
  transform: perspective(620px) rotateX(58deg);
  mask-image: radial-gradient(circle at 30% 45%, #000 0%, transparent 68%);
}
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.5;
}
.g1 {
  width: 460px;
  height: 460px;
  background: rgba(47, 129, 247, 0.28);
  left: 4%;
  top: 12%;
}
.g2 {
  width: 380px;
  height: 380px;
  background: rgba(34, 211, 238, 0.16);
  left: 34%;
  bottom: 2%;
}

.left {
  position: relative;
  z-index: 2;
  max-width: 520px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 42px;
}
.logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #7fc4ff;
  background: linear-gradient(140deg, rgba(47, 129, 247, 0.3), rgba(34, 211, 238, 0.08));
  border: 1px solid rgba(47, 129, 247, 0.4);
}
.brand h1 {
  margin: 0;
  font-size: 19px;
  letter-spacing: 0.16em;
  font-weight: 600;
}
.brand p {
  margin: 2px 0 0;
  font-size: 10.5px;
  color: var(--txt-3);
  letter-spacing: 0.08em;
}
.slogan {
  font-size: 34px;
  line-height: 1.32;
  font-weight: 600;
  margin: 0 0 18px;
  letter-spacing: -0.01em;
}
.slogan span {
  background: linear-gradient(96deg, #7fc4ff, #22d3ee);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.desc {
  color: var(--txt-2);
  font-size: 13px;
  line-height: 1.85;
  margin: 0 0 30px;
  max-width: 460px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 26px;
}
.m-card {
  padding: 11px 12px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(80, 105, 135, 0.24);
  position: relative;
}
.m-card i {
  position: absolute;
  left: 12px;
  top: 0;
  width: 18px;
  height: 2px;
  background: var(--accent);
  border-radius: 0 0 2px 2px;
}
.m-card b {
  display: block;
  font-family: var(--mono);
  font-size: 17px;
  color: #dbe8f6;
}
.m-card span {
  font-size: 10.5px;
  color: var(--txt-3);
}
.stack {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.stack span {
  font-size: 10.5px;
  padding: 3px 9px;
  border-radius: 4px;
  color: #7d8b9c;
  border: 1px solid rgba(80, 105, 135, 0.28);
  background: rgba(255, 255, 255, 0.02);
}

.right {
  position: relative;
  z-index: 2;
  width: 372px;
  flex: none;
}
.card {
  padding: 28px 26px 22px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(19, 26, 36, 0.94), rgba(12, 17, 24, 0.96));
  border: 1px solid rgba(70, 95, 125, 0.32);
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(12px);
}
.card h3 {
  margin: 0 0 5px;
  font-size: 17px;
  font-weight: 600;
}
.sub {
  margin: 0 0 22px;
  font-size: 11.5px;
  color: var(--txt-3);
}
.btn-main {
  width: 100%;
  letter-spacing: 0.3em;
  font-size: 13px;
}
.divider {
  position: relative;
  text-align: center;
  margin: 18px 0;
}
.divider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--line-soft);
}
.divider span {
  position: relative;
  padding: 0 10px;
  background: #0d1219;
  font-size: 11px;
  color: var(--txt-3);
}
.btn-demo {
  width: 100%;
  background: rgba(47, 129, 247, 0.12);
  border-color: rgba(47, 129, 247, 0.38);
  color: #a9d1ff;
}
.btn-demo:hover {
  background: rgba(47, 129, 247, 0.2);
  color: #cfe3ff;
}
.accounts {
  display: flex;
  gap: 6px;
  margin-top: 16px;
}
.acc {
  flex: 1;
  padding: 7px 8px;
  border-radius: 6px;
  border: 1px solid var(--line-soft);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.acc:hover {
  border-color: rgba(47, 129, 247, 0.4);
  background: rgba(47, 129, 247, 0.08);
}
.acc b {
  display: block;
  font-size: 11.5px;
  font-family: var(--mono);
}
.acc span {
  display: block;
  font-size: 10px;
  color: var(--txt-3);
  margin-top: 1px;
}
.acc em {
  display: block;
  font-style: normal;
  font-size: 9.5px;
  color: #5d7fa8;
  margin-top: 2px;
}
.tips {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 16px 0 0;
  font-size: 10.5px;
  color: #5f6d7d;
  line-height: 1.6;
}

@media (max-width: 1080px) {
  .left {
    display: none;
  }
}
</style>
