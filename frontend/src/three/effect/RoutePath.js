import * as THREE from 'three'
import { LAYER } from '../core/Layers'

/**
 * 巡检路线可视化 + 路径动画回放
 * 点位 → CatmullRom 曲线 → 管状路径 + 站点标记 + 流动光点
 */
export class RoutePath {
  constructor() {
    this.root = new THREE.Group()
    this.root.name = 'ROUTE_LAYER'
    this.root.visible = false
    this.curve = null
    this.t = 0
    this.playing = false
    this.speed = 0.08
    this.loop = true
    this.onArrive = null
    this._arrived = new Set()

    this.traveler = null
    this.markers = []
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.55 })
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  }

  build(points, { loop = true } = {}) {
    this.clear()
    if (!points || points.length < 2) return this.root
    const vecs = points.map((p) => new THREE.Vector3(p.x, 1.05, p.z))
    this.curve = new THREE.CatmullRomCurve3(vecs, loop, 'catmullrom', 0.35)
    this.loop = loop

    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 160, 0.075, 6, loop), this.lineMat)
    tube.layers.enable(LAYER.EFFECT)
    this.root.add(tube)

    vecs.forEach((v, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 32), this.markerMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(v.x, 0.06, v.z)
      ring.layers.enable(LAYER.EFFECT)
      this.root.add(ring)
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
      )
      beam.position.set(v.x, 1.05, v.z)
      this.root.add(beam)
      this.markers.push(ring)
    })

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x9ae6ff }),
    )
    const glow = new THREE.PointLight(0x22d3ee, 12, 9, 2)
    sphere.add(glow)
    this.traveler = sphere
    this.root.add(sphere)

    this.t = 0
    this._arrived.clear()
    this.root.visible = true
    this.update(0)
    return this.root
  }

  play() {
    this.playing = true
    this.t = 0
    this._arrived.clear()
  }
  pause() {
    this.playing = false
  }
  stop() {
    this.playing = false
    this.t = 0
    this._arrived.clear()
    this.root.visible = false
  }

  update(dt) {
    if (!this.curve || !this.traveler) return
    if (this.playing) {
      const step = dt * this.speed
      this.t += step
      if (this.t > 1) {
        if (this.loop) this.t -= 1
        else {
          this.t = 1
          this.playing = false
        }
      }
      // 到达站点回调（每圈每个点只触发一次）
      const idx = Math.floor(this.t * (this.markers.length - 1))
      if (!this._arrived.has(idx)) {
        this._arrived.add(idx)
        this.onArrive?.(idx)
      }
      if (this._arrived.size > this.markers.length * 2) this._arrived.clear()
    }
    const p = this.curve.getPointAt(Math.min(this.t, 1))
    this.traveler.position.copy(p).setY(1.15)
  }

  clear() {
    this.root.children.slice().forEach((c) => {
      this.root.remove(c)
      c.geometry?.dispose?.()
      if (c.material && c.material !== this.lineMat && c.material !== this.markerMat) c.material.dispose?.()
    })
    this.markers = []
    this.traveler = null
    this.curve = null
  }

  dispose() {
    this.clear()
    this.lineMat.dispose()
    this.markerMat.dispose()
    this.root.clear()
  }
}
