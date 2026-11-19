import { createRouter, createWebHashHistory } from 'vue-router'
import { parseToken } from '@/api'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true, layout: 'blank' } },
  { path: '/', name: 'overview', component: () => import('@/views/Overview.vue'), meta: { title: '首页总览', group: '监控中心' } },
  { path: '/twin', name: 'twin', component: () => import('@/views/Twin.vue'), meta: { title: '数字孪生', group: '监控中心', full: true } },
  { path: '/twin/bigscreen', name: 'bigscreen', component: () => import('@/views/BigScreen.vue'), meta: { title: '大屏模式', layout: 'blank' } },
  { path: '/device', name: 'device', component: () => import('@/views/DeviceList.vue'), meta: { title: '设备台账', group: '资产与运维' } },
  { path: '/device/:id', name: 'device-detail', component: () => import('@/views/DeviceDetail.vue'), meta: { title: '设备详情', group: '资产与运维', hidden: true } },
  { path: '/alarm', name: 'alarm', component: () => import('@/views/AlarmCenter.vue'), meta: { title: '告警中心', group: '资产与运维' } },
  { path: '/workorder', name: 'workorder', component: () => import('@/views/WorkOrder.vue'), meta: { title: '运维工单', group: '资产与运维' } },
  { path: '/inspection', name: 'inspection', component: () => import('@/views/Inspection.vue'), meta: { title: '巡检管理', group: '资产与运维' } },
  { path: '/inspection/route', name: 'inspection-route', component: () => import('@/views/InspectRoute.vue'), meta: { title: '巡检路线', group: '资产与运维' } },
  { path: '/heatmap', name: 'heatmap', component: () => import('@/views/Heatmap.vue'), meta: { title: '热力分析', group: '分析' } },
  { path: '/replay', name: 'replay', component: () => import('@/views/Replay.vue'), meta: { title: '状态回放', group: '分析' } },
  { path: '/report', name: 'report', component: () => import('@/views/Report.vue'), meta: { title: '报表中心', group: '分析' } },
  { path: '/admin-config', name: 'admin-config', component: () => import('@/views/SceneConfig.vue'), meta: { title: '场景配置', group: '系统' } },
  { path: '/logs', name: 'logs', component: () => import('@/views/Logs.vue'), meta: { title: '审计日志', group: '系统' } },
  { path: '/about', name: 'about', component: () => import('@/views/About.vue'), meta: { title: '项目介绍', group: '系统' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!parseToken()) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
export { routes }
