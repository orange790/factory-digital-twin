import * as THREE from 'three'
import { ARCHETYPES, archetypeOf } from '../factory/assets'
import { LAYER } from '../core/Layers'

/**
 * 设备实例化渲染 + 状态绑定
 * ------------------------------------------------------------------
 * 200 台设备如果每台一个 Mesh，光设备层就有 500+ DrawCall。
 * 这里按"原型 + 状态色"两个维度组织：
 *   - 同原型的设备合并进一个 InstancedMesh（body），状态用 instanceColor 表达
 *   - 结构件（深色零部件）再合并一个 InstancedMesh（detail）
 *   - 故障闪烁用 per-instance attribute aFault + 共享 uTime，注入到 PBR 着色器
 * 结果：200 台设备的设备层只有 14 个 DrawCall。
 */
const MAX_AGV_SPEED = 3.2

export class DeviceInstances {
  constructor({ pool }) {
    this.pool = pool
    this.root = new THREE.Group()
    this.root.name = 'DEVICE_LAYER'
    this.groups = [] // { mesh, detailMesh, codes, indexByCode, archetype }
    this.codeIndex = new Map() // code -> { groupIdx, index, device }
    this.selected = ''
    this.hovered = ''
    this.timeUniform = { value: 0 }
    this.staticBlink = false
    this._dummy = new THREE.Object3D()
    this._color = new THREE.Color()
    this._jitter = new THREE.Color()
    this.agvs = []
  }

  /* ---------- 构建 ---------- */
  build(devices) {
    this.clear()
    const buckets = new Map()
    devices.forEach((d) => {
      const key = archetypeOf(d)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(d)
    })

    buckets.forEach((list, key) => {
      const factory = ARCHETYPES[key]
      if (!factory) return
      const geo = factory()
      const count = list.length

      const bodyGeo = geo.body
      const faultAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
      faultAttr.setUsage(THREE.DynamicDrawUsage)
      bodyGeo.setAttribute('aFault', faultAttr)

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0.25,
        envMapIntensity: 0.6,
      })
      this._injectFaultShading(bodyMat)

      const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, count)
      bodyMesh.name = `DEV_INST_${key}`
      bodyMesh.castShadow = key !== 'sensor' && key !== 'agv'
      bodyMesh.receiveShadow = false
      bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      bodyMesh.frustumCulled = false
      bodyMesh.userData.isDeviceLayer = true
      bodyMesh.userData.archetype = key

      const detailMesh = new THREE.InstancedMesh(
        geo.detail,
        new THREE.MeshStandardMaterial({ color: 0x232c38, roughness: 0.62, metalness: 0.55 }),
        count,
      )
      detailMesh.name = `DEV_INST_DETAIL_${key}`
      detailMesh.castShadow = false
      detailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      detailMesh.frustumCulled = false
      detailMesh.userData.isDeviceLayer = true
      detailMesh.userData.archetype = key

      const group = { key, bodyMesh, detailMesh, codes: [], indexByCode: new Map(), devices: list, geo }
      list.forEach((d, i) => {
        const { x, y, z } = { x: d.position_x || 0, y: d.position_y || 0, z: d.position_z || 0 }
        const rotY = this._rotationFor(d)
        this._dummy.position.set(x, y, z)
        this._dummy.rotation.set(0, rotY, 0)
        this._dummy.scale.set(1, 1, 1)
        this._applyScale(this._dummy, d)
        this._dummy.updateMatrix()
        bodyMesh.setMatrixAt(i, this._dummy.matrix)
        detailMesh.setMatrixAt(i, this._dummy.matrix)
        this._color.set(this.pool.colors[d.status] || this.pool.colors.offline)
        const jitter = 0.9 + ((i * 37) % 17) / 17 * 0.18
        this._jitter.set(this._color).multiplyScalar(jitter)
        bodyMesh.setColorAt(i, this._jitter)
        faultAttr.array[i] = d.status === 'fault' ? 1 : 0
        group.codes.push(d.code)
        group.indexByCode.set(d.code, i)
        this.codeIndex.set(d.code, { group, index: i, device: d })
        if (key === 'agv') {
          this.agvs.push({ code: d.code, baseX: x, z, phase: Math.random() * 6.28, speed: 1.4 + Math.random() * 0.8, dir: Math.random() > 0.5 ? 1 : -1, mesh: bodyMesh, detailMesh, index: i, baseY: y })
        }
      })

      bodyMesh.instanceMatrix.needsUpdate = true
      detailMesh.instanceMatrix.needsUpdate = true
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true
      faultAttr.needsUpdate = true
      bodyMesh.computeBoundingSphere()
      detailMesh.computeBoundingSphere()

      bodyMesh.layers.enable(LAYER.DEVICE)
      detailMesh.layers.enable(LAYER.DEVICE)
      this.root.add(bodyMesh, detailMesh)
      this.groups.push(group)
    })
  }

  _rotationFor(d) {
    if (d.device_type === 'machine') {
      const n = parseInt(String(d.code).replace(/\D/g, ''), 10) || 0
      return n % 3 === 0 ? Math.PI : 0
    }
    if (d.device_type === 'robot') return 0
    return 0
  }

  _applyScale(obj, d) {
    // 新建设备按额定功率微调体量，避免场景里出现"复制粘贴感"
    const k = d.device_type === 'machine' ? 0.92 + Math.min(1, (d.rated_power || 20) / 40) * 0.22 : 1
    obj.scale.set(k, k, k)
  }

  /** 把故障呼吸 + Fresnel 边缘光注入标准材质（保留 PBR 光照） */
  _injectFaultShading(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform
      shader.vertexShader =
        'attribute float aFault;\nvarying float vFault;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFault = aFault;')
      shader.fragmentShader =
        'uniform float uTime;\nvarying float vFault;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           if (vFault > 0.001) {
             float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
             float pulse = 0.5 + 0.5 * sin(uTime * 7.5);
             gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.34, 0.28), pulse * 0.42 * vFault);
             gl_FragColor.rgb += vec3(1.0, 0.36, 0.3) * fres * (0.22 + pulse * 0.55) * vFault;
           }`,
        )
    }
    mat.customProgramCacheKey = () => 'device-fault-v1'
  }

  /* ---------- 状态更新（单帧内生效） ---------- */
  setStatus(code, status) {
    const rec = this.codeIndex.get(code)
    if (!rec) return false
    const { group, index } = rec
    rec.device.status = status
    this._color.set(this.pool.colors[status] || this.pool.colors.offline)
    if (status === 'offline') this._color.multiplyScalar(0.62)
    group.bodyMesh.setColorAt(index, this._color)
    group.bodyMesh.instanceColor.needsUpdate = true
    const attr = group.bodyMesh.geometry.getAttribute('aFault')
    attr.array[index] = status === 'fault' ? 1 : 0
    attr.needsUpdate = true
    return true
  }

  setBlinkEnabled(on) {
    this.staticBlink = !on
    this.groups.forEach((g) => {
      const attr = g.bodyMesh.geometry.getAttribute('aFault')
      if (!on) attr.array.fill(0)
      else
        g.codes.forEach((code, i) => {
          attr.array[i] = g.devices[i]?.status === 'fault' ? 1 : 0
        })
      attr.needsUpdate = true
    })
  }

  setSelected(code) {
    const prev = this.selected
    this.selected = code || ''
    if (prev && prev !== code) this._scaleOne(prev, 1)
    if (this.selected) this._scaleOne(this.selected, 1.06)
  }

  setHovered(code) {
    if (this.hovered && this.hovered !== code && this.hovered !== this.selected) this._scaleOne(this.hovered, 1)
    this.hovered = code || ''
    if (this.hovered && this.hovered !== this.selected) this._scaleOne(this.hovered, 1.035)
  }

  _scaleOne(code, scale) {
    const rec = this.codeIndex.get(code)
    if (!rec) return
    const d = rec.device
    this._dummy.position.set(d.position_x || 0, d.position_y || 0, d.position_z || 0)
    this._dummy.rotation.set(0, this._rotationFor(d), 0)
    const k = (d.device_type === 'machine' ? 0.92 + Math.min(1, (d.rated_power || 20) / 40) * 0.22 : 1) * scale
    this._dummy.scale.set(k, k, k)
    this._dummy.updateMatrix()
    rec.group.bodyMesh.setMatrixAt(rec.index, this._dummy.matrix)
    rec.group.detailMesh.setMatrixAt(rec.index, this._dummy.matrix)
    rec.group.bodyMesh.instanceMatrix.needsUpdate = true
    rec.group.detailMesh.instanceMatrix.needsUpdate = true
  }

  /** 高亮（用于告警定位：让目标设备轻微上浮） */
  pulse(code) {
    this._scaleOne(code, 1.08)
    setTimeout(() => {
      if (code !== this.selected) this._scaleOne(code, 1)
    }, 420)
  }

  /* ---------- 每帧更新 ---------- */
  update(dt, elapsed) {
    this.timeUniform.value = elapsed
    // AGV 沿主通道往复行驶
    if (this.agvs.length) {
      this.agvs.forEach((a) => {
        const x = a.baseX + Math.sin(elapsed * 0.12 * a.speed + a.phase) * 26
        this._dummy.position.set(x, a.baseY, a.z)
        this._dummy.rotation.set(0, Math.cos(elapsed * 0.12 * a.speed + a.phase) > 0 ? 0 : Math.PI, 0)
        this._dummy.scale.set(1, 1, 1)
        this._dummy.updateMatrix()
        a.mesh.setMatrixAt(a.index, this._dummy.matrix)
        a.detailMesh.setMatrixAt(a.index, this._dummy.matrix)
        a.device_x = x
      })
      this.agvs.forEach((a) => {
        a.mesh.instanceMatrix.needsUpdate = true
        a.detailMesh.instanceMatrix.needsUpdate = true
      })
    }
  }

  /* ---------- 查询 ---------- */
  getWorldPosition(code) {
    const rec = this.codeIndex.get(code)
    if (!rec) return null
    const d = rec.device
    const agv = this.agvs.find((a) => a.code === code)
    return new THREE.Vector3(agv ? agv.device_x ?? agv.baseX : d.position_x || 0, (d.position_y || 0) + 1.6, d.position_z || 0)
  }

  getBounding(code) {
    const rec = this.codeIndex.get(code)
    if (!rec) return null
    const d = rec.device
    const g = rec.group.geo
    const r = g.radius || 1.4
    const h = g.height || 2
    const c = this.getWorldPosition(code)
    return new THREE.Box3(new THREE.Vector3(c.x - r, 0, c.z - r), new THREE.Vector3(c.x + r, h, c.z + r))
  }

  get raycastTargets() {
    return this.root.children
  }

  codeFromIntersection(hit) {
    if (!hit?.object?.userData?.isDeviceLayer) return null
    const group = this.groups.find((g) => g.bodyMesh === hit.object || g.detailMesh === hit.object)
    if (!group) return null
    return group.codes[hit.instanceId] || null
  }

  setHeatValues(map) {
    // map: code -> 0..1
    const ramp = [
      [0.0, 0x1f6feb],
      [0.35, 0x22d3ee],
      [0.55, 0x3fb950],
      [0.75, 0xd29922],
      [1.0, 0xf85149],
    ]
    const lerpColor = (v) => {
      for (let i = 1; i < ramp.length; i++) {
        if (v <= ramp[i][0]) {
          const [a, ca] = ramp[i - 1]
          const [b, cb] = ramp[i]
          const t = (v - a) / (b - a || 1)
          return new THREE.Color(ca).lerp(new THREE.Color(cb), t)
        }
      }
      return new THREE.Color(0xf85149)
    }
    this.groups.forEach((g) => {
      g.codes.forEach((code, i) => {
        const v = map[code]
        const c = v === undefined ? new THREE.Color(0x394152) : lerpColor(v)
        g.bodyMesh.setColorAt(i, c)
      })
      g.bodyMesh.instanceColor.needsUpdate = true
    })
  }

  restoreColors() {
    this.groups.forEach((g) => {
      g.codes.forEach((code, i) => {
        this._color.set(this.pool.colors[g.devices[i].status] || this.pool.colors.offline)
        g.bodyMesh.setColorAt(i, this._color)
      })
      g.bodyMesh.instanceColor.needsUpdate = true
    })
  }

  clear() {
    this.groups.forEach((g) => {
      this.root.remove(g.bodyMesh, g.detailMesh)
      g.bodyMesh.geometry.dispose()
      g.bodyMesh.material.dispose()
      g.detailMesh.geometry.dispose()
      g.detailMesh.material.dispose()
      g.bodyMesh.dispose()
      g.detailMesh.dispose()
    })
    this.groups = []
    this.codeIndex.clear()
    this.agvs = []
  }
}
