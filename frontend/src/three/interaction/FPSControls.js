import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { HALL } from '../factory/assets'

/**
 * 第一人称漫游：PointerLock + WASD + 简易 AABB 碰撞
 * 漫游期间关闭 OrbitControls，退出（ESC）后恢复；相机高度固定 1.65m。
 */
export class FPSControls {
  constructor({ camera, domElement, orbit, colliders = [], onLockChange }) {
    this.camera = camera
    this.orbit = orbit
    this.colliders = colliders
    this.onLockChange = onLockChange || (() => {})
    this.eyeHeight = 1.65
    this.speed = 9
    this.velocity = new THREE.Vector3()
    this.keys = {}
    this.enabled = false

    this.controls = new PointerLockControls(camera, domElement)
    this.controls.pointerSpeed = 0.9
    this.controls.addEventListener('lock', () => {
      this.enabled = true
      orbit.enabled = false
      this.onLockChange(true)
    })
    this.controls.addEventListener('unlock', () => {
      this.enabled = false
      orbit.enabled = true
      // 退出时把轨道控制的目标移到相机前方，避免视角跳变
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      orbit.target.copy(camera.position).add(dir.multiplyScalar(8))
      orbit.update()
      this.onLockChange(false)
    })

    this._kd = (e) => {
      this.keys[e.code] = true
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'].includes(e.code) && this.enabled) e.preventDefault()
    }
    this._ku = (e) => (this.keys[e.code] = false)
    window.addEventListener('keydown', this._kd, { passive: false })
    window.addEventListener('keyup', this._ku)
  }

  enter() {
    this.camera.position.set(-6, this.eyeHeight, 0)
    this.controls.lock()
  }
  exit() {
    this.controls.unlock()
  }

  _blocked(pos) {
    const pad = 0.42
    if (Math.abs(pos.x) > HALL.halfW - 1.2 || Math.abs(pos.z) > HALL.halfD - 1.2) return true
    for (const b of this.colliders) {
      if (
        pos.x > b.min.x - pad &&
        pos.x < b.max.x + pad &&
        pos.z > b.min.z - pad &&
        pos.z < b.max.z + pad &&
        pos.y < b.max.y
      )
        return true
    }
    return false
  }

  update(dt) {
    if (!this.enabled) return
    const k = this.keys
    const forward = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    const strafe = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const boost = k.ShiftLeft ? 1.9 : 1

    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3().addScaledVector(dir, forward).addScaledVector(right, strafe)
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(this.speed * boost * dt)

    const pos = this.camera.position.clone()
    const nextX = pos.clone()
    nextX.x += move.x
    if (!this._blocked(nextX)) pos.x = nextX.x
    const nextZ = pos.clone()
    nextZ.z += move.z
    if (!this._blocked(nextZ)) pos.z = nextZ.z

    this.camera.position.set(pos.x, this.eyeHeight, pos.z)
  }

  dispose() {
    window.removeEventListener('keydown', this._kd)
    window.removeEventListener('keyup', this._ku)
    this.controls.dispose()
  }
}
