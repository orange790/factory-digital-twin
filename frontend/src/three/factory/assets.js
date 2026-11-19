import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LAYER } from '../core/Layers'

/* ==========================================================================
 * 程序化厂房资产库
 * --------------------------------------------------------------------------
 * 说明：作品集里 GLB 资产来自 Blender（见 README 的建模规范），但为了让项目
 * 拉下来就能跑、不依赖二进制资产，这里用 three 的几何体程序化生成等效资产，
 * 并严格遵守节点命名规范 DEV_{code}。换成真实 GLB 时只需替换
 * ResourceManager.load 的部分，绑定逻辑（DeviceMatcher）完全不用改。
 * ========================================================================== */

export const HALL = { w: 92, d: 62, h: 9, halfW: 46, halfD: 31 }

/* ---------- 几何工具 ---------- */
function box(w, h, d, x = 0, y = 0, z = 0, rot = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rot[0] || rot[1] || rot[2]) {
    const m = new THREE.Matrix4()
    const e = new THREE.Euler(rot[0], rot[1], rot[2])
    m.makeRotationFromEuler(e)
    g.applyMatrix4(m)
  }
  g.translate(x, y, z)
  return g
}
function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0, rot = [0, 0, 0]) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg)
  if (rot[0] || rot[1] || rot[2]) {
    const m = new THREE.Matrix4()
    m.makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]))
    g.applyMatrix4(m)
  }
  g.translate(x, y, z)
  return g
}
function merge(list) {
  const clean = list.filter(Boolean)
  if (!clean.length) return new THREE.BufferGeometry()
  return mergeGeometries(clean, false)
}

/* ---------- 设备原型（body = 状态换色部分，detail = 固定深色结构件） ---------- */
function cncArchetype() {
  return {
    body: merge([
      box(2.2, 1.5, 1.85, 0, 1.32, 0),
      box(2.32, 0.24, 1.95, 0, 2.19, 0),
      box(0.09, 1.02, 1.12, 1.12, 1.3, 0),
    ]),
    detail: merge([
      box(2.55, 0.56, 2.15, 0, 0.28, 0),
      box(1.24, 0.86, 0.06, -0.28, 1.42, 0.93),
      box(0.62, 0.44, 0.09, 0.72, 1.78, 0.96, [0, 0, -0.2]),
      cyl(0.15, 0.15, 0.55, 12, 0.02, 0.95, 0),
      box(0.4, 0.5, 0.05, -0.62, 1.34, -0.96),
      cyl(0.07, 0.07, 0.85, 8, -1.14, 2.86, -0.72),
    ]),
    height: 2.5,
    radius: 1.7,
  }
}
function pressArchetype() {
  return {
    body: merge([
      box(1.95, 0.72, 1.65, 0, 0.98, 0),
      box(0.34, 1.95, 1.45, -0.78, 2.28, 0),
      box(0.34, 1.95, 1.45, 0.78, 2.28, 0),
      box(1.95, 0.58, 1.65, 0, 3.46, 0),
      box(0.74, 0.95, 0.5, 0, 1.78, 0),
      box(0.42, 0.42, 0.42, 0, 3.05, 0),
    ]),
    detail: merge([
      box(2.2, 0.62, 1.95, 0, 0.31, 0),
      box(1.5, 0.1, 1.5, 0, 1.4, 0),
      box(0.32, 0.42, 0.07, 0.72, 1.2, 0.86),
      cyl(0.05, 0.05, 0.9, 6, -0.9, 2.9, 0.68),
    ]),
    height: 3.75,
    radius: 1.35,
  }
}
function injectArchetype() {
  return {
    body: merge([
      box(1.55, 1.25, 1.55, -0.4, 1.28, 0),
      box(1.0, 0.95, 1.25, 1.0, 1.1, 0),
      box(0.95, 0.4, 1.2, 0.1, 2.1, 0),
    ]),
    detail: merge([
      box(2.8, 0.74, 2.05, 0, 0.37, 0),
      cyl(0.24, 0.24, 1.45, 12, 0.55, 1.55, 0, [0, 0, Math.PI / 2]),
      box(0.7, 0.86, 0.06, -0.5, 1.4, 0.79),
      box(0.4, 0.34, 0.06, -0.5, 1.95, 0.79),
      cyl(0.07, 0.07, 0.7, 6, 1.55, 2.4, 0.55),
    ]),
    height: 2.35,
    radius: 1.7,
  }
}
function robotArchetype() {
  return {
    body: merge([
      box(0.52, 0.5, 0.52, 0, 0.55, 0),
      box(0.3, 1.28, 0.3, 0.33, 1.34, 0, [0, 0, -0.52]),
      box(0.26, 1.0, 0.26, 1.02, 1.9, 0, [0, 0, 0.86]),
    ]),
    detail: merge([
      cyl(0.58, 0.66, 0.34, 20, 0, 0.17, 0),
      cyl(0.2, 0.2, 0.34, 14, 0, 0.62, 0, [0, 0, Math.PI / 2]),
      box(0.36, 0.2, 0.5, 1.42, 1.42, 0),
      box(0.1, 0.34, 0.42, 1.55, 1.24, 0.18),
      box(0.1, 0.34, 0.42, 1.55, 1.24, -0.18),
      cyl(0.09, 0.09, 0.6, 8, -0.36, 0.9, 0),
    ]),
    height: 2.1,
    radius: 1.0,
  }
}
function sensorArchetype() {
  return {
    body: merge([cyl(0.15, 0.15, 0.28, 12, 0, 0, 0)]),
    detail: merge([cyl(0.05, 0.05, 0.3, 8, 0, -0.28, 0), cyl(0.02, 0.1, 0.06, 10, 0, 0.17, 0)]),
    height: 0.6,
    radius: 0.35,
  }
}
function gaugeArchetype() {
  return {
    body: merge([box(1.25, 1.5, 0.95, 0, 0.9, 0)]),
    detail: merge([
      box(1.45, 0.16, 1.15, 0, 1.72, 0),
      cyl(0.17, 0.24, 0.3, 14, 0, 1.6, 0.2),
      box(0.55, 0.4, 0.05, 0, 1.05, 0.49),
      cyl(0.05, 0.05, 0.6, 6, -0.5, 2.0, -0.35),
    ]),
    height: 1.9,
    radius: 0.95,
  }
}
function agvArchetype() {
  return {
    body: merge([box(1.75, 0.3, 1.05, 0, 0.34, 0), box(1.1, 0.5, 0.85, -0.1, 0.74, 0)]),
    detail: merge([
      cyl(0.22, 0.22, 0.14, 12, 0.6, 0.16, 0.52, [Math.PI / 2, 0, 0]),
      cyl(0.22, 0.22, 0.14, 12, 0.6, 0.16, -0.52, [Math.PI / 2, 0, 0]),
      cyl(0.22, 0.22, 0.14, 12, -0.6, 0.16, 0.52, [Math.PI / 2, 0, 0]),
      cyl(0.22, 0.22, 0.14, 12, -0.6, 0.16, -0.52, [Math.PI / 2, 0, 0]),
      box(0.1, 0.12, 0.9, 0.86, 0.34, 0),
    ]),
    height: 1.0,
    radius: 1.2,
  }
}

export const ARCHETYPES = {
  machine_cnc: cncArchetype,
  machine_press: pressArchetype,
  machine_inject: injectArchetype,
  robot: robotArchetype,
  sensor: sensorArchetype,
  gauge: gaugeArchetype,
  agv: agvArchetype,
}

export function archetypeOf(device) {
  if (device.device_type === 'machine') {
    if (device.name?.includes('冲床')) return 'machine_press'
    if (device.name?.includes('注塑')) return 'machine_inject'
    return 'machine_cnc'
  }
  if (device.device_type === 'robot') return 'robot'
  if (device.device_type === 'sensor') return 'sensor'
  if (device.device_type === 'gauge') return 'gauge'
  if (device.device_type === 'agv') return 'agv'
  return 'machine_cnc'
}

/* ==========================================================================
 * 厂房静态建筑
 * ========================================================================== */
function makeFloorTexture() {
  const size = 512
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#232e3d'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#31415a'
  ctx.lineWidth = 2.5
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * size
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, size)
    ctx.moveTo(0, p)
    ctx.lineTo(size, p)
    ctx.stroke()
  }
  // 细微噪点，避免大面积纯色
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(10, 7)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * 建筑层：地面 / 墙体 / 立柱 / 桁架 / 产线导轨 / 安全通道
 * 返回的 group.userData.colliders 供第一人称漫游做 AABB 碰撞
 */
export function createHall(lines = []) {
  const group = new THREE.Group()
  group.name = 'BUILDING'
  group.userData.colliders = []

  const floorTex = makeFloorTexture()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.w, HALL.d),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.86, metalness: 0.08, color: 0xffffff }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.name = 'ENV_Ground'
  group.add(floor)

  // 墙体
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b3a4d, roughness: 0.72, metalness: 0.3 })
  const wallSpec = [
    [HALL.w, HALL.h, 0.7, 0, HALL.h / 2, -HALL.halfD],
    [HALL.w, HALL.h, 0.7, 0, HALL.h / 2, HALL.halfD],
    [0.7, HALL.h, HALL.d, -HALL.halfW, HALL.h / 2, 0],
    [0.7, HALL.h, HALL.d, HALL.halfW, HALL.h / 2, 0],
  ]
  wallSpec.forEach(([w, h, d, x, y, z], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
    m.position.set(x, y, z)
    m.name = `BLD_Wall_${i}`
    m.receiveShadow = true
    group.add(m)
    group.userData.colliders.push(new THREE.Box3().setFromObject(m))
  })

  // 高窗（发光条），让厂房墙体有"建筑感"而不是四块黑板
  const winMat = new THREE.MeshBasicMaterial({ color: 0x86bdf0, transparent: true, opacity: 0.24 })
  const winGeos = []
  for (let x = -38; x <= 38; x += 9.5) {
    winGeos.push(box(6.2, 2.2, 0.12, x, 6.3, -HALL.halfD + 0.36))
    winGeos.push(box(6.2, 2.2, 0.12, x, 6.3, HALL.halfD - 0.36))
  }
  for (let z = -22; z <= 22; z += 11) {
    winGeos.push(box(0.12, 2.2, 6.4, -HALL.halfW + 0.36, 6.3, z))
    winGeos.push(box(0.12, 2.2, 6.4, HALL.halfW - 0.36, 6.3, z))
  }
  const windows = new THREE.Mesh(merge(winGeos), winMat)
  windows.name = 'BLD_Windows'
  group.add(windows)

  // 墙脚踢脚线
  const kickMat = new THREE.MeshStandardMaterial({ color: 0x394b61, roughness: 0.5, metalness: 0.5 })
  const kickGeos = [
    box(HALL.w, 0.5, 0.2, 0, 0.25, -HALL.halfD + 0.45),
    box(HALL.w, 0.5, 0.2, 0, 0.25, HALL.halfD - 0.45),
    box(0.2, 0.5, HALL.d, -HALL.halfW + 0.45, 0.25, 0),
    box(0.2, 0.5, HALL.d, HALL.halfW - 0.45, 0.25, 0),
  ]
  group.add(new THREE.Mesh(merge(kickGeos), kickMat))

  // 顶部裙边（视觉上收口）
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x2b3a4d, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.55 })
  const skirtSpec = [
    [HALL.w, 0.5, 0.9, 0, HALL.h - 0.4, -HALL.halfD],
    [HALL.w, 0.5, 0.9, 0, HALL.h - 0.4, HALL.halfD],
    [0.9, 0.5, HALL.d, -HALL.halfW, HALL.h - 0.4, 0],
    [0.9, 0.5, HALL.d, HALL.halfW, HALL.h - 0.4, 0],
  ]
  skirtSpec.forEach(([w, h, d, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skirtMat)
    m.position.set(x, y, z)
    group.add(m)
  })

  // 立柱
  const colMat = new THREE.MeshStandardMaterial({ color: 0x243040, roughness: 0.55, metalness: 0.55 })
  for (let x = -40; x <= 40; x += 16) {
    for (const z of [-26, 26]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, HALL.h, 0.6), colMat)
      col.position.set(x, HALL.h / 2, z)
      col.castShadow = false
      group.add(col)
    }
  }

  // 屋架（只保留主梁，避免近距离视角被斜撑切割）
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x2a3646, roughness: 0.7, metalness: 0.4 })
  const trussGeos = []
  for (let x = -40; x <= 40; x += 16) {
    trussGeos.push(box(0.22, 0.28, HALL.d - 2, x, HALL.h - 0.75, 0))
    trussGeos.push(box(0.14, 0.14, HALL.d - 2, x, HALL.h - 1.05, 0))
  }
  const truss = new THREE.Mesh(merge(trussGeos), trussMat)
  truss.name = 'BLD_Truss'
  group.add(truss)

  // 产线导轨 + 工位地标
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.5, metalness: 0.6 })
  const markMat = new THREE.MeshBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.24 })
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xd29922, transparent: true, opacity: 0.22 })
  const railGeos = []
  const markGeos = []
  const yellowGeos = []
  lines.forEach((l) => {
    railGeos.push(box(70, 0.14, 0.5, -4, 0.07, l.z + 2.3))
    railGeos.push(box(70, 0.14, 0.5, -4, 0.07, l.z - 2.3))
    markGeos.push(box(68, 0.02, 0.1, -4, 0.012, l.z + 3.6))
    yellowGeos.push(box(3.2, 0.02, 2.6, -32 + 0 * 5, 0.014, l.z))
  })
  // 主通道护栏（AGV 行驶道）
  for (const z of [-8, 8]) {
    yellowGeos.push(box(88, 0.02, 0.14, 0, 0.014, z - 1.6))
    yellowGeos.push(box(88, 0.02, 0.14, 0, 0.014, z + 1.6))
  }
  const rails = new THREE.Mesh(merge(railGeos), railMat)
  rails.name = 'BLD_Rails'
  group.add(rails)
  group.add(new THREE.Mesh(merge(markGeos), markMat))
  group.add(new THREE.Mesh(merge(yellowGeos), yellowMat))

  // 产线标识牌（用 canvas 贴图，避免额外字体依赖）
  lines.forEach((l) => {
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = 128
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#0d1620'
    ctx.fillRect(0, 0, 512, 128)
    ctx.strokeStyle = '#2f81f7'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, 504, 120)
    ctx.fillStyle = '#7fc4ff'
    ctx.font = 'bold 62px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${l.code} · ${l.name}`, 256, 70)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.25),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    )
    sign.position.set(-36, 4.2, l.z + 3.9)
    sign.rotation.y = 0.22
    sign.name = `BLD_Sign_${l.code}`
    group.add(sign)
  })

  // 吊顶灯带（纯视觉，营造工业照明层次）
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.32 })
  const lampGeos = []
  for (let z = -24; z <= 24; z += 12) {
    lampGeos.push(box(72, 0.06, 0.34, -2, HALL.h - 1.4, z))
  }
  const lamps = new THREE.Mesh(merge(lampGeos), lampMat)
  lamps.name = 'BLD_Lamps'
  group.add(lamps)

  group.traverse((o) => o.layers.enable(LAYER.BUILDING))
  return group
}

/** 供第一人称漫游使用的碰撞盒（墙体 + 建筑立柱近似） */
export function collectColliders(hallGroup) {
  const boxes = [...(hallGroup?.userData.colliders || [])]
  for (let x = -40; x <= 40; x += 16) {
    for (const z of [-26, 26]) {
      boxes.push(new THREE.Box3(new THREE.Vector3(x - 0.5, 0, z - 0.5), new THREE.Vector3(x + 0.5, HALL.h, z + 0.5)))
    }
  }
  return boxes
}
