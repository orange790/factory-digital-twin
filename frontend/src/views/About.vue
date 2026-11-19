<template>
  <div class="page about">
    <div class="hero">
      <div class="hero-txt">
        <div class="tag info">作品集项目 · v1.1</div>
        <h1>基于 Three.js 的轻量化工厂数字孪生运维平台</h1>
        <p>
          设备上报 → 状态渲染 → 告警联动 → 工单闭环 → 数据回流。
          三维场景是业务数据的<strong>视图层</strong>，不是静态模型展示。
        </p>
        <div class="stack-row">
          <span>Vue 3</span><span>Three.js r170</span><span>Django REST</span><span>MQTT</span><span>ECharts</span><span>Element Plus</span>
        </div>
      </div>
      <div class="hero-kpi">
        <div v-for="k in heroKpis" :key="k.k">
          <b class="mono">{{ k.v }}</b>
          <span>{{ k.k }}</span>
          <i>{{ k.d }}</i>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd"><h3>系统架构</h3><span class="tiny muted">前后端分离 · 三维与业务严格分层</span></div>
      <div class="panel-bd">
        <div class="layers">
          <div v-for="l in layers" :key="l.name" class="layer">
            <div class="ly-name">{{ l.name }}</div>
            <div class="ly-items">
              <span v-for="i in l.items" :key="i">{{ i }}</span>
            </div>
            <div class="ly-note">{{ l.note }}</div>
          </div>
          <div class="ly-arrow">▼</div>
          <div class="flow">
            <span>虚拟设备</span>
            <i>telemetry</i>
            <span>告警规则</span>
            <i>Alarm</i>
            <span>工单闭环</span>
            <i>材质恢复</i>
            <span>状态回流</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-hd"><h3>关键技术决策</h3></div>
        <div class="panel-bd decisions">
          <div v-for="d in decisions" :key="d.t" class="decision">
            <div class="dc-t">
              <el-icon :size="14"><component :is="d.icon" /></el-icon>
              {{ d.t }}
            </div>
            <p>{{ d.c }}</p>
            <div class="dc-metric">{{ d.metric }}</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd"><h3>性能指标（实测口径）</h3></div>
        <div class="panel-bd" style="padding: 0">
          <table class="kpi-table">
            <thead>
              <tr><th>指标</th><th>目标</th><th>测量方式</th></tr>
            </thead>
            <tbody>
              <tr v-for="k in kpis" :key="k.n">
                <td>{{ k.n }}</td>
                <td class="mono">{{ k.v }}</td>
                <td class="muted">{{ k.m }}</td>
              </tr>
            </tbody>
          </table>
          <p class="tiny muted" style="padding: 8px 14px 12px; margin: 0">
            打开三维页左下的 PERFORMANCE 面板可实时对照 DrawCall / 三角面 / 拾取耗时
          </p>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd"><h3>3 分钟演示脚本</h3><span class="tiny muted">按这个顺序讲，闭环能完整落到"数据驱动"上</span></div>
      <div class="panel-bd">
        <div class="script">
          <div v-for="(s, i) in script" :key="i" class="sc-item">
            <div class="sc-time mono">{{ s.t }}</div>
            <div class="sc-main">
              <b>{{ s.a }}</b>
              <span>{{ s.q }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd"><h3>面试高频问题</h3></div>
      <div class="panel-bd">
        <el-collapse v-model="openQ" accordion class="qa">
          <el-collapse-item v-for="(q, i) in qa" :key="i" :name="i" :title="q.q">
            <p>{{ q.a }}</p>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <div class="panel">
      <div class="panel-hd"><h3>数据源与运行方式</h3></div>
      <div class="panel-bd">
        <div class="run-grid">
          <div class="run-card">
            <b>① 浏览器模拟（当前默认）</b>
            <code>npm install && npm run dev</code>
            <p>内置 200 台虚拟设备、告警规则引擎与状态流水，零依赖打开即用。业务数据落 localStorage，刷新不丢。</p>
          </div>
          <div class="run-card">
            <b>② 接 Django REST</b>
            <code>VITE_DATA_SOURCE=http npm run dev</code>
            <p>右上角用户菜单可一键切换数据源。前端 api 门面接口形状一致，切换无需改业务代码。</p>
          </div>
          <div class="run-card">
            <b>③ MQTT 实时通道</b>
            <code>factory/{area}/{device}/telemetry</code>
            <p>前端 mqtt.js over WebSocket 直连 EMQX；不可用时自动降级为 3s 轮询，界面显示通道徽标。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const openQ = ref(0)

const heroKpis = [
  { v: '200', k: '同屏设备', d: '实例化渲染' },
  { v: '≤16', k: 'DrawCall', d: '设备层' },
  { v: '14', k: '业务模型', d: 'DRF' },
  { v: '<500ms', k: '状态延迟', d: '推送链路' },
]

const layers = [
  { name: '展示层', items: ['Vue3', 'Element Plus', 'ECharts', '3D Canvas'], note: '业务页面 + 三维视图层' },
  { name: '通信层', items: ['axios/fetch REST', 'mqtt.js', '3s 轮询兜底'], note: '双通道自动降级' },
  { name: '服务层', items: ['DRF ViewSet', 'JWT 鉴权', '角色权限', 'CSV 导出'], note: 'Device / Alarm / WorkOrder / Inspection' },
  { name: '数据层', items: ['MySQL / SQLite', 'DeviceMetric', 'DeviceStatusLog', 'SceneConfig'], note: '台账 + 时序 + 配置' },
  { name: '模拟层', items: ['虚拟设备上报', '阈值判定', '状态流水'], note: '等价于 IoT 网关 + 订阅落库' },
]

const decisions = [
  {
    icon: 'Cpu',
    t: '状态材质池：只换引用，不 clone',
    c: '每台设备 clone 材质会产生 N 份 GPU 材质与频繁的状态切换。改为 4 套共享材质 + 实例化 instanceColor，状态更新只改引用/顶点色。',
    metric: '材质对象 200+ → 6',
  },
  {
    icon: 'Grid',
    t: '设备层全实例化',
    c: '同原型设备合并进 InstancedMesh：body 承载状态色、detail 承载结构件，故障呼吸用 per-instance attribute 注入 PBR 着色器。',
    metric: 'DrawCall 500+ → 14',
  },
  {
    icon: 'Aim',
    t: '分层拾取 + 单帧一次射线',
    c: 'Raycaster.layers 只开设备层，建筑/桁架完全不参与；pointermove 只记录坐标，每帧最多一次射线；拖动超过 5px 不算点击。',
    metric: '拾取 < 2ms',
  },
  {
    icon: 'MagicStick',
    t: '告警闪烁保留 PBR 光照',
    c: '不用裸 ShaderMaterial（会失去明暗与阴影），而是在标准材质上注入正弦呼吸 + Fresnel 边缘光，uTime 共享给所有故障设备。',
    metric: '1.2Hz，单 uniform',
  },
  {
    icon: 'Delete',
    t: '统一销毁，路由进出不泄漏',
    c: 'disposeObject 递归释放 geometry / material / texture；组件卸载取消 RAF、移除监听、销毁 renderer 并 forceContextLoss。',
    metric: '20 次进出后 textures 归零',
  },
  {
    icon: 'DataAnalysis',
    t: '配置化而非写死',
    c: '状态色、图层可见性、视角预设、告警阈值全部落库。改配置 → 刷新页面即生效，代码零改动。',
    metric: '5 类配置项',
  },
]

const kpis = [
  { n: '同屏设备数', v: '≥ 200', m: '压测脚本' },
  { n: 'DrawCall', v: '≤ 150', m: 'renderer.info.render.calls' },
  { n: '三角面数', v: '≤ 500k', m: 'renderer.info.render.triangles' },
  { n: '桌面帧率', v: '≥ 55 FPS', m: 'PerfHUD 采样' },
  { n: '拾取响应', v: '≤ 16ms', m: '点击 100 次计时' },
  { n: '状态更新延迟', v: '≤ 500ms', m: '时间戳比对' },
  { n: '场景资源', v: '≤ 10MB / 区域', m: 'du -h' },
]

const script = [
  { t: '0:00', a: '打开首页总览', q: '这是设备台账—告警—工单的完整业务系统，3D 是它的视图层' },
  { t: '0:20', a: '进入 /twin 转动场景', q: '按台账坐标程序化摆放设备，200 台设备 14 个 DrawCall' },
  { t: '0:50', a: '展开性能 HUD', q: 'FPS / DrawCall / 三角面 / 拾取耗时实时可见，不是嘴上说性能' },
  { t: '1:20', a: '告警中心注入故障', q: '超阈值 → 生成告警 → 三维 1 帧内变红呼吸，链路 < 500ms' },
  { t: '1:50', a: '点设备 → 建工单 → 闭环', q: '工单闭环自动关告警、材质回绿，这是数据驱动而不是写死' },
  { t: '2:20', a: '告警定位 + 第一人称漫游', q: 'tween 镜头飞行，漫游带 AABB 碰撞，ESC 退出' },
  { t: '2:45', a: '切路由再切回看内存', q: '统一 dispose，几何/材质/纹理全部释放' },
]

const qa = [
  {
    q: '为什么不用 Unity WebGL / UE？',
    a: '包体大（>30MB）、首屏慢，且 UI 与业务系统割裂。这类"业务为主、三维为辅"的运维系统，Three.js 与 Vue 同栈、迭代快、可按需裁剪，更合适。影视级渲染不是本项目的目标。',
  },
  {
    q: '状态换色为什么不用 clone 材质？',
    a: 'clone 会产生 N 份材质对象，显存与 GPU 状态切换成本随设备数线性增长。这里用 4 套共享材质池 + InstancedMesh 的 instanceColor，切换只改引用或顶点色属性，材质数量恒定。',
  },
  {
    q: '200 台设备怎么保证不卡？',
    a: '实例化（同原型合并）+ 共享材质 + 分层拾取（建筑不参与射线）+ 单帧一次射线 + 标注抽稀（故障/关键设备优先）+ pixelRatio 上限 + FPS 低于 30 自动降级（关后处理、关阴影、降 DPR）。',
  },
  {
    q: '内存泄漏怎么排查？',
    a: '对比 renderer.info.memory 的 geometries/textures 在路由进出前后的数值；再用 Chrome Memory Snapshot 做堆对比。代码上所有 geometry/material/texture 走统一 disposeObject，RAF 与事件监听在 onBeforeUnmount 中成对清理。',
  },
  {
    q: '实时数据为什么用 MQTT 而不是纯轮询？',
    a: '轮询有延迟且请求量随设备数放大；MQTT 发布订阅延迟低、适合海量设备。但演示环境不能依赖 Broker，所以保留 3s 轮询兜底，前端显示"实时通道"徽标，断线自动重连。',
  },
  {
    q: '数据和模型节点怎么对应？',
    a: '建模阶段强制命名规范 DEV_{device_code}，后端 Device.glb_node_name 存储；加载后遍历场景建 Map<code, Object3D>，未匹配的节点在配置页标红。本项目为了让仓库可直接运行，用程序化资产代替 GLB，但绑定层（DeviceMatcher 思路）与真实 GLB 管线一致。',
  },
]
</script>

<style scoped>
.about {
  max-width: 1320px;
}
.hero {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  padding: 26px 28px;
  border-radius: 12px;
  background: radial-gradient(700px 320px at 8% 0%, rgba(47, 129, 247, 0.16), transparent 70%),
    linear-gradient(160deg, #121b26 0%, #0c1219 100%);
  border: 1px solid var(--line-soft);
  margin-bottom: 14px;
}
.hero-txt h1 {
  margin: 10px 0 12px;
  font-size: 24px;
  line-height: 1.42;
  font-weight: 600;
  letter-spacing: -0.01em;
  max-width: 620px;
}
.hero-txt p {
  margin: 0 0 18px;
  color: var(--txt-2);
  font-size: 12.5px;
  line-height: 1.85;
  max-width: 600px;
}
.hero-txt strong {
  color: #9fd0ff;
  font-weight: 550;
}
.stack-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.stack-row span {
  font-size: 10.5px;
  padding: 3px 9px;
  border-radius: 4px;
  color: #7d8b9c;
  border: 1px solid rgba(80, 105, 135, 0.28);
  background: rgba(255, 255, 255, 0.02);
}
.hero-kpi {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: center;
}
.hero-kpi div {
  padding: 12px 13px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.028);
  border: 1px solid rgba(80, 105, 135, 0.22);
}
.hero-kpi b {
  display: block;
  font-size: 20px;
  font-weight: 550;
  color: #dbe8f6;
}
.hero-kpi span {
  font-size: 11px;
  color: var(--txt-2);
}
.hero-kpi i {
  display: block;
  font-style: normal;
  font-size: 9.5px;
  color: #4d5b6b;
  margin-top: 2px;
}

.layers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.layer {
  display: grid;
  grid-template-columns: 84px 1fr 230px;
  align-items: center;
  gap: 12px;
  padding: 9px 13px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.022);
  border: 1px solid var(--line-soft);
  border-left: 2px solid rgba(47, 129, 247, 0.45);
}
.ly-name {
  font-size: 12px;
  font-weight: 550;
  color: #cfdae6;
}
.ly-items {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ly-items span {
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(47, 129, 247, 0.1);
  color: #8fb8e8;
  border: 1px solid rgba(47, 129, 247, 0.18);
}
.ly-note {
  font-size: 10.5px;
  color: var(--txt-3);
  text-align: right;
}
.ly-arrow {
  text-align: center;
  color: #2b3a4d;
  font-size: 11px;
}
.flow {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 13px;
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.05);
  border: 1px dashed rgba(34, 211, 238, 0.24);
  font-size: 11.5px;
  color: #9fb6ce;
}
.flow i {
  font-style: normal;
  font-size: 9.5px;
  color: #4d6a80;
  font-family: var(--mono);
}

.grid {
  display: grid;
  grid-template-columns: 1.28fr 1fr;
  gap: 14px;
  margin-top: 14px;
}
.decisions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.decision {
  padding: 11px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.022);
  border: 1px solid var(--line-soft);
}
.dc-t {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 550;
  color: #d3dde8;
  margin-bottom: 6px;
}
.decision p {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--txt-3);
}
.dc-metric {
  font-family: var(--mono);
  font-size: 10px;
  color: #7ee2a8;
  padding: 2px 7px;
  border-radius: 3px;
  background: rgba(63, 185, 80, 0.09);
  display: inline-block;
}
.kpi-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.kpi-table th {
  text-align: left;
  font-weight: 500;
  font-size: 10.5px;
  color: var(--txt-3);
  padding: 8px 14px;
  border-bottom: 1px solid var(--line-soft);
}
.kpi-table td {
  padding: 8px 14px;
  border-bottom: 1px solid var(--line-soft);
  color: #c3cfdb;
}
.kpi-table td.mono {
  color: #9fd0ff;
}

.script {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.sc-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.022);
  border: 1px solid var(--line-soft);
}
.sc-time {
  font-size: 10.5px;
  color: #5f7d9e;
  flex: none;
  padding-top: 1px;
}
.sc-main b {
  display: block;
  font-size: 11.5px;
  font-weight: 550;
  color: #d3dde8;
  margin-bottom: 4px;
}
.sc-main span {
  font-size: 10.5px;
  color: var(--txt-3);
  line-height: 1.6;
}
.qa {
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
  border: none;
}
:deep(.el-collapse-item__header) {
  background: transparent;
  font-size: 12px;
  color: #c3cfdb;
  border-color: var(--line-soft);
}
:deep(.el-collapse-item__wrap) {
  background: transparent;
  border-color: var(--line-soft);
}
:deep(.el-collapse-item__content) {
  font-size: 11.5px;
  color: var(--txt-2);
  line-height: 1.85;
  padding-bottom: 14px;
}
.run-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.run-card {
  padding: 13px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.022);
  border: 1px solid var(--line-soft);
}
.run-card b {
  display: block;
  font-size: 12px;
  margin-bottom: 8px;
  color: #d3dde8;
}
.run-card code {
  display: block;
  font-family: var(--mono);
  font-size: 10.5px;
  color: #7ee2a8;
  background: rgba(0, 0, 0, 0.35);
  padding: 5px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  word-break: break-all;
}
.run-card p {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--txt-3);
}
.panel + .panel {
  margin-top: 14px;
}
@media (max-width: 1300px) {
  .grid,
  .hero {
    grid-template-columns: 1fr;
  }
  .script {
    grid-template-columns: 1fr 1fr;
  }
  .run-grid {
    grid-template-columns: 1fr;
  }
}
</style>
