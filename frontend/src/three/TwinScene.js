import * as THREE from 'three'
import { SceneManager } from './core/SceneManager'
import { createHall, collectColliders, HALL } from './factory/assets'
import { StatusMaterialPool, DEFAULT_STATUS_COLORS } from './binding/StatusMaterialPool'
import { DeviceInstances } from './binding/DeviceInstances'
import { Picker } from './interaction/Picker'
import { CameraFly } from './interaction/CameraFly'
import { FPSControls } from './interaction/FPSControls'
import { LabelLayer } from './ui/LabelLayer'
import { RoutePath } from './effect/RoutePath'
import { LAYER } from './core/Layers'

/**
 * TwinScene —— 三维场景统一门面
 * ------------------------------------------------------------------
 * 业务组件（Vue）只通过这一层与三维交互，不直接操作 mesh：
 *   setData / applyStatus / focus / setLayer / screenshot / ...
 * 内部组装：渲染器、程序化资产、实例化设备、拾取、镜头、标注、路线。
 */
export class TwinScene {
  constructor(container, opts = {}) {
    this.container = container
    this.opts = opts
    this.sm = new SceneManager(container, { quality: opts.quality || 'high' })
    this.pool = new StatusMaterialPool(opts.statusColors || DEFAULT_STATUS_COLORS)
    this.instances = new DeviceInstances({ pool: this.pool })
    this.labels = new LabelLayer(container)
    this.route = new RoutePath()
    this.cameraFly = new CameraFly(this.sm.camera, this.sm.controls)
    this.devices = []
    this.deviceMap = new Map()
    this.presets = []
    this.selected = ''
    this.hoveredCode = ''
    this._frame = 0
    this._ready = false

    this.sm.scene.add(this.instances.root)
    this.sm.scene.add(this.labels.group)
    this.sm.scene.add(this.route.root)

    this.hall = null
    this.fps = null
    this._initHelpers()

    this.picker = new Picker({
      camera: this.sm.camera,
      domElement: this.sm.renderer.domElement,
      targets: () => this.instances.raycastTargets,
      onHover: (code, hit) => this._handleHover(code, hit),
      onClick: (code) => {
        this.select(code)
        this.opts.onSelect?.(code)
      },
      onDoubleClick: (code) => {
        this.focusDevice(code)
        this.opts.onDoubleClick?.(code)
      },
      onBlank: () => {
        this.select('')
        this.opts.onSelect?.('')
      },
    })
    this.picker.setResolver((hit) => this.instances.codeFromIntersection(hit))

    this.sm.addUpdate((dt, t) => this._update(dt, t))
    this._onWinResize = () => {
      this.labels.resize(this.container.clientWidth, this.container.clientHeight)
    }
    window.addEventListener('resize', this._onWinResize)
    this.labels.resize(container.clientWidth, container.clientHeight)
  }

  _initHelpers() {
    const ringGeo = new THREE.RingGeometry(1.15, 1.5, 40)
    this.hoverRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    )
    this.hoverRing.rotation.x = -Math.PI / 2
    this.hoverRing.position.y = 0.05
    this.hoverRing.visible = false
    this.sm.scene.add(this.hoverRing)

    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.85, 44),
      new THREE.MeshBasicMaterial({ color: 0x2f81f7, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    )
    this.selRing.rotation.x = -Math.PI / 2
    this.selRing.position.y = 0.06
    this.selRing.visible = false
    this.sm.scene.add(this.selRing)

    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0x2f81f7)
    this.selBox.visible = false
    this.sm.scene.add(this.selBox)
  }

  /* ---------------- 数据装配 ---------------- */
  setData(devices, lines = [], config = {}) {
    this.devices = devices
    this.deviceMap = new Map(devices.map((d) => [d.code, d]))
    this.linesCache = lines
    this.configCache = config
    if (config.bg_color) {
      this.sm.scene.background = new THREE.Color(config.bg_color)
      this.sm.scene.fog = new THREE.Fog(config.bg_color, 110, 220)
    }
    if (config.status_colors) {
      this.pool.setColors(config.status_colors)
    }
    if (config.camera_presets?.length) this.presets = config.camera_presets

    if (!this.hall) {
      this.hall = createHall(lines)
      this.sm.scene.add(this.hall)
      this.colliders = collectColliders(this.hall)
    }
    this.instances.build(devices)
    this.applyLayerVisibility(config.layer_visible || {})
    this._ready = true
    return this
  }

  /** 台账变更（新增/删除设备）后重建实例 */
  rebuild(devices) {
    this.devices = devices
    this.deviceMap = new Map(devices.map((d) => [d.code, d]))
    this.instances.build(devices)
  }

  applyStatusMap(map) {
    Object.entries(map).forEach(([code, status]) => this.applyStatus(code, status))
  }

  applyStatus(code, status) {
    const ok = this.instances.setStatus(code, status)
    if (ok && code === this.selected) this._updateSelectionRing()
    return ok
  }

  /* ---------------- 交互 ---------------- */
  _handleHover(code, hit) {
    this.hoveredCode = code
    this.instances.setHovered(code)
    if (!code) {
      this.hoverRing.visible = false
      this.opts.onHover?.(null)
      return
    }
    const d = this.deviceMap.get(code)
    if (!d) return
    const pos = this.instances.getWorldPosition(code)
    if (pos) {
      this.hoverRing.position.set(pos.x, 0.05, pos.z)
      this.hoverRing.visible = true
    }
    const screen = this.picker.project(pos || new THREE.Vector3())
    this.container.style.cursor = 'pointer'
    this.opts.onHover?.({ code, device: d, screen, screenPos: { x: hit?.point?.x } })
  }

  select(code) {
    this.selected = code || ''
    this.instances.setSelected(this.selected)
    if (!code) {
      this.selRing.visible = false
      this.selBox.visible = false
      this.container.style.cursor = 'default'
      return
    }
    this._updateSelectionRing()
  }

  _updateSelectionRing() {
    const pos = this.instances.getWorldPosition(this.selected)
    if (!pos) {
      this.selRing.visible = false
      this.selBox.visible = false
      return
    }
    this.selRing.position.set(pos.x, 0.06, pos.z)
    this.selRing.visible = true
    const box = this.instances.getBounding(this.selected)
    if (box) {
      this.selBox.box.copy(box)
      this.selBox.visible = true
      this.selBox.updateMatrixWorld(true)
    }
  }

  focusDevice(code, opts = {}) {
    const pos = this.instances.getWorldPosition(code)
    if (!pos) return
    this.instances.pulse(code)
    this.cameraFly.focusObject(pos, opts)
  }

  flyToPreset(name, { duration = 1000 } = {}) {
    const p = this.presets.find((x) => x.name === name)
    if (!p) return false
    this.cameraFly.flyTo(p.camPos, p.target, { duration })
    return true
  }

  flyToPoint(pos, target, duration = 900) {
    this.cameraFly.flyTo(pos, target, { duration })
  }

  /* ---------------- 图层 / 特效 ---------------- */
  applyLayerVisibility(map) {
    this.layerState = { ...map }
    if (this.hall) this.hall.visible = map.building !== false
    this.instances.root.visible = map.device !== false
    this.labels.setVisible(map.label !== false)
    this.route.root.visible = (map.effect !== false) && this.route.root.visible
    this.selRing.visible = this.selRing.visible && map.device !== false
    this.hoverRing.visible = this.hoverRing.visible && map.device !== false
  }

  setLayer(name, visible) {
    const next = { ...(this.layerState || {}), [name]: visible }
    this.layerState = next
    if (name === 'building' && this.hall) this.hall.visible = visible
    if (name === 'device') {
      this.instances.root.visible = visible
      this.selRing.visible = visible && !!this.selected
      this.hoverRing.visible = visible && !!this.hoveredCode
    }
    if (name === 'label') this.labels.setVisible(visible)
    if (name === 'effect') {
      this.route.root.visible = visible && !!this.route.curve
      this.sm.setPostEnabled(visible)
    }
    if (name === 'helper') {
      this.selBox.visible = visible && !!this.selected
    }
  }

  setBlinkEnabled(on) {
    this.pool.setBlinkEnabled(on)
    this.instances.setBlinkEnabled(on)
  }

  setPostEnabled(on) {
    this.sm.setPostEnabled(on)
  }

  setHeatmap(values) {
    if (!values) this.instances.restoreColors()
    else this.instances.setHeatValues(values)
  }

  /* ---------------- 路线 ---------------- */
  showRoute(points, { loop = true } = {}) {
    this.route.build(points, { loop })
    if (this.layerState?.effect === false) this.route.root.visible = false
    return this.route
  }
  playRoute() {
    this.route.play()
  }
  pauseRoute() {
    this.route.pause()
  }
  hideRoute() {
    this.route.stop()
  }

  /* ---------------- 漫游 ---------------- */
  enterRoam() {
    if (!this.fps) {
      this.fps = new FPSControls({
        camera: this.sm.camera,
        domElement: this.sm.renderer.domElement,
        orbit: this.sm.controls,
        colliders: this.colliders || [],
        onLockChange: (locked) => this.opts.onRoamChange?.(locked),
      })
    }
    this.sm.setPostEnabled(false)
    this.fps.enter()
  }
  exitRoam() {
    this.fps?.exit()
    this.sm.setPostEnabled(this.layerState?.effect !== false)
  }
  get roaming() {
    return !!this.fps?.enabled
  }

  /* ---------------- 快照 / 截图 ---------------- */
  screenshot() {
    this.sm.renderer.render(this.sm.scene, this.sm.camera)
    return this.sm.renderer.domElement.toDataURL('image/png')
  }

  getSnapshot() {
    return {
      camera_position: this.sm.camera.position.toArray().map((v) => +v.toFixed(3)),
      camera_target: this.sm.controls.target.toArray().map((v) => +v.toFixed(3)),
      layer_visible: { ...(this.layerState || {}) },
    }
  }

  applySnapshot(s) {
    if (!s) return
    this.cameraFly.flyTo(s.camera_position, s.camera_target, { duration: 900 })
    if (s.layer_visible) Object.entries(s.layer_visible).forEach(([k, v]) => this.setLayer(k, v))
  }

  /* ---------------- 每帧 ---------------- */
  _update(dt, t) {
    this.picker.update()
    this.cameraFly.update()
    this.instances.update(dt, t)
    this.pool.update(dt, t)
    this.route.update(dt)
    this.fps?.update(dt)
    if (this.layerState?.label !== false) {
      this._frame++
      if (this._frame % 10 === 0) {
        this.labels.sync(this.devices, (code) => this.deviceMap.get(code)?.status || 'offline', this.sm.camera)
      }
      this.labels.render(this.sm.scene, this.sm.camera)
    }
    if (this.selRing.visible) {
      this.selRing.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.28
      this.selRing.rotation.z += dt * 0.35
    }
    if (this.hoverRing.visible) {
      this.hoverRing.rotation.z -= dt * 0.6
    }
  }

  get stats() {
    return {
      ...this.sm.stats,
      pickMs: this.picker.pickMs,
      pickCount: this.picker.pickCount,
      labels: this.labels.labels.size,
      instances: this.devices.length,
    }
  }

  get cameraApi() {
    return { camera: this.sm.camera, controls: this.sm.controls }
  }

  /** 注册每帧回调（巡检相机跟随等场景内动画用） */
  onFrame(fn) {
    return this.sm.addUpdate(fn)
  }

  get routeApi() {
    return this.route
  }

  dispose() {
    window.removeEventListener('resize', this._onWinResize)
    this.picker.dispose()
    this.cameraFly.dispose()
    this.fps?.dispose()
    this.route.dispose()
    this.labels.dispose()
    this.instances.clear()
    this.pool.dispose()
    if (this.hall) {
      this.sm.scene.remove(this.hall)
      this.hall.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose()
          Object.keys(o.material || {}).forEach((k) => {
            if (o.material[k]?.isTexture) o.material[k].dispose()
          })
          o.material?.dispose?.()
        }
      })
    }
    this.hoverRing.geometry.dispose()
    this.hoverRing.material.dispose()
    this.selRing.geometry.dispose()
    this.selRing.material.dispose()
    this.sm.dispose()
    this._ready = false
  }
}

export { HALL, LAYER }
