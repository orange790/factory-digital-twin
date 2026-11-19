import * as THREE from 'three'
import { Tween, Easing, Group as TweenGroup } from '@tweenjs/tween.js'

/**
 * 镜头缓动飞行
 * - 重复点击会打断上一次动画（对应 F-3D-08 验收：可打断、不丢失目标）
 * - 用 tween.js 的 Group 管理生命周期，组件销毁时 stop 掉
 */
export class CameraFly {
  constructor(camera, controls) {
    this.camera = camera
    this.controls = controls
    this.group = new TweenGroup()
    this.current = null
    this.flying = false
  }

  update() {
    this.group.update()
  }

  stop() {
    if (this.current) {
      this.current.stop()
      this.current = null
    }
    this.flying = false
  }

  /**
   * @param {THREE.Vector3|number[]} position 相机目标位置
   * @param {THREE.Vector3|number[]} target 观察点
   */
  flyTo(position, target, { duration = 900, onComplete } = {}) {
    this.stop()
    const p = Array.isArray(position) ? new THREE.Vector3(...position) : position
    const t = Array.isArray(target) ? new THREE.Vector3(...target) : target
    const from = {
      px: this.camera.position.x,
      py: this.camera.position.y,
      pz: this.camera.position.z,
      tx: this.controls.target.x,
      ty: this.controls.target.y,
      tz: this.controls.target.z,
    }
    this.flying = true
    this.current = new Tween(from, this.group)
      .to({ px: p.x, py: p.y, pz: p.z, tx: t.x, ty: t.y, tz: t.z }, duration)
      .easing(Easing.Cubic.InOut)
      .onUpdate((o) => {
        this.camera.position.set(o.px, o.py, o.pz)
        this.controls.target.set(o.tx, o.ty, o.tz)
      })
      .onComplete(() => {
        this.flying = false
        this.current = null
        onComplete?.()
      })
      .start()
    return this.current
  }

  /** 聚焦某台设备：沿"当前视线方向"退到合适距离，避免穿模 */
  focusObject(worldPos, { distance = 13, height = 6.5, duration = 850 } = {}) {
    const dir = new THREE.Vector3().subVectors(this.camera.position, worldPos).normalize()
    if (dir.lengthSq() < 0.001) dir.set(0.6, 0.7, 0.6).normalize()
    dir.y = Math.max(dir.y, 0.42)
    dir.normalize()
    const pos = worldPos.clone().add(dir.multiplyScalar(distance))
    pos.y = Math.max(pos.y, height)
    return this.flyTo(pos, worldPos.clone().setY(1.6), { duration })
  }

  dispose() {
    this.stop()
    this.group.removeAll()
  }
}
