import * as THREE from 'three'
import { LAYER } from '../core/Layers'

/**
 * 拾取器：只对 DEVICE 层做 Raycaster，建筑层完全不参与开销
 * - 每帧最多一次射线（pointermove 高频事件只记录坐标）
 * - 拖动超过阈值不算点击（避免旋转场景时误选设备）
 * - 悬浮/点击/双击/空白 四类事件回调给业务层
 */
export class Picker {
  constructor({ camera, domElement, targets, onHover, onClick, onDoubleClick, onBlank }) {
    this.camera = camera
    this.dom = domElement
    this.targets = targets // () => Object3D[]
    this.onHover = onHover || (() => {})
    this.onClick = onClick || (() => {})
    this.onDoubleClick = onDoubleClick || (() => {})
    this.onBlank = onBlank || (() => {})

    this.raycaster = new THREE.Raycaster()
    this.raycaster.layers.set(LAYER.DEVICE)
    this.raycaster.params.Points.threshold = 0.4
    this.pointer = new THREE.Vector2(-10, -10)
    this.hasPointer = false
    this.needsPick = false
    this.lastHovered = null
    this.pickCount = 0
    this.pickMs = 0

    this._down = { x: 0, y: 0, t: 0, moved: false }
    this._onMove = (e) => this._pointerMove(e)
    this._onDown = (e) => this._pointerDown(e)
    this._onUp = (e) => this._pointerUp(e)
    this._onLeave = () => {
      this.hasPointer = false
      if (this.lastHovered) {
        this.onHover(null)
        this.lastHovered = null
      }
    }
    this._onDbl = (e) => this._doubleClick(e)

    this.dom.addEventListener('pointermove', this._onMove)
    this.dom.addEventListener('pointerdown', this._onDown)
    this.dom.addEventListener('pointerup', this._onUp)
    this.dom.addEventListener('pointerleave', this._onLeave)
    this.dom.addEventListener('dblclick', this._onDbl)
  }

  _setPointer(e) {
    const r = this.dom.getBoundingClientRect()
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
  }

  _pointerMove(e) {
    this._setPointer(e)
    this.hasPointer = true
    this.needsPick = true
    if (Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 5) this._down.moved = true
  }

  _pointerDown(e) {
    this._down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }
  }

  _pointerUp(e) {
    if (this._down.moved || e.button !== 0) return
    this._setPointer(e)
    const hit = this.pick()
    if (hit) this.onClick(hit.code, hit)
    else this.onBlank()
  }

  _doubleClick(e) {
    this._setPointer(e)
    const hit = this.pick()
    if (hit) this.onDoubleClick(hit.code, hit)
  }

  pick() {
    const t0 = performance.now()
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const list = typeof this.targets === 'function' ? this.targets() : this.targets
    const hits = this.raycaster.intersectObjects(list, false)
    this.pickMs = +(performance.now() - t0).toFixed(2)
    this.pickCount++
    if (!hits.length) return null
    return hits[0]
  }

  /** 每帧调用：处理悬浮态变化 */
  update() {
    if (!this.hasPointer || !this.needsPick) return
    this.needsPick = false
    const hit = this.pick()
    const code = hit ? this.codeOf(hit) : null
    if (code !== this.lastHovered) {
      this.lastHovered = code
      this.onHover(code, hit)
    }
  }

  codeOf(hit) {
    return this._resolver ? this._resolver(hit) : null
  }

  setResolver(fn) {
    this._resolver = fn
  }

  /** 屏幕坐标（供 DOM Tooltip 定位） */
  project(worldPos) {
    const v = worldPos.clone().project(this.camera)
    const r = this.dom.getBoundingClientRect()
    return {
      x: (v.x * 0.5 + 0.5) * r.width,
      y: (-v.y * 0.5 + 0.5) * r.height,
      visible: v.z < 1,
    }
  }

  dispose() {
    this.dom.removeEventListener('pointermove', this._onMove)
    this.dom.removeEventListener('pointerdown', this._onDown)
    this.dom.removeEventListener('pointerup', this._onUp)
    this.dom.removeEventListener('pointerleave', this._onLeave)
    this.dom.removeEventListener('dblclick', this._onDbl)
  }
}
