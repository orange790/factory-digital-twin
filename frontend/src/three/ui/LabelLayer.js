import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { LAYER } from '../core/Layers'

/**
 * 三维标注层（CSS2D）
 * ------------------------------------------------------------------
 * 200 台设备全量打标签会直接拖垮 DOM，这里按优先级抽稀：
 *   故障 > 停机 > 关键设备 > 其它（超过 MAX_LABELS 时截断）
 * 远距离只保留状态点，近距离才出全名 —— 对应 F-3D-07。
 */
const MAX_LABELS = 34
const NEAR_DISTANCE = 46

export class LabelLayer {
  constructor(container) {
    this.container = container
    this.renderer = new CSS2DRenderer()
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.pointerEvents = 'none'
    this.renderer.domElement.className = 'twin-label-layer'
    container.appendChild(this.renderer.domElement)
    this.group = new THREE.Group()
    this.group.name = 'LABEL_LAYER'
    this.labels = new Map() // code -> {obj, el}
    this.enabled = true
  }

  _el(device, status) {
    const el = document.createElement('div')
    el.className = `twin-label is-${status}`
    el.innerHTML = `
      <span class="tw-dot"></span>
      <span class="tw-code mono">${device.code}</span>
      <span class="tw-name">${device.name}</span>
    `
    return el
  }

  /** 根据当前状态挑选要显示的标签并增量更新 */
  sync(devices, statusOf, camera) {
    if (!this.enabled) {
      this.group.visible = false
      return
    }
    this.group.visible = true
    const priority = (d) => {
      const s = statusOf(d.code)
      if (s === 'fault') return 0
      if (s === 'stop') return 1
      if (d.is_critical) return 2
      return 3
    }
    const camPos = camera.position
    const candidates = devices
      .map((d) => {
        const dist = Math.hypot(d.position_x - camPos.x, d.position_z - camPos.z)
        return { d, p: priority(d), dist }
      })
      .filter((x) => x.p < 3 || x.dist < NEAR_DISTANCE)
      .sort((a, b) => a.p - b.p || a.dist - b.dist)
      .slice(0, MAX_LABELS)

    const keep = new Set()
    candidates.forEach(({ d, dist }) => {
      const status = statusOf(d.code)
      keep.add(d.code)
      let rec = this.labels.get(d.code)
      if (!rec) {
        const el = this._el(d, status)
        const obj = new CSS2DObject(el)
        obj.position.set(d.position_x || 0, (d.position_y || 0) + 2.9, d.position_z || 0)
        obj.layers.enable(LAYER.LABEL)
        this.group.add(obj)
        rec = { obj, el }
        this.labels.set(d.code, rec)
      }
      rec.obj.position.set(d.position_x || 0, (d.position_y || 0) + 2.9, d.position_z || 0)
      const cls = `twin-label is-${status}${dist > NEAR_DISTANCE ? ' is-far' : ''}`
      if (rec.el.className !== cls) rec.el.className = cls
    })

    // 移除不再需要的标签
    for (const [code, rec] of this.labels) {
      if (!keep.has(code)) {
        this.group.remove(rec.obj)
        rec.obj.element?.remove()
        this.labels.delete(code)
      }
    }
  }

  setVisible(on) {
    this.enabled = on
    this.group.visible = on
    if (!on) {
      for (const [, rec] of this.labels) rec.obj.element?.remove()
      this.labels.clear()
    }
  }

  render(scene, camera) {
    this.renderer.render(scene, camera)
  }

  resize(w, h) {
    this.renderer.setSize(w, h)
  }

  dispose() {
    for (const [, rec] of this.labels) rec.obj.element?.remove()
    this.labels.clear()
    this.group.clear()
    this.renderer.domElement.remove()
  }
}
