import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { HALL } from '../factory/assets'

/**
 * 渲染管理器：渲染器 / 相机 / 控制器 / 光照 / 渲染循环 / 自适应尺寸 / 降级
 * 对外只暴露 update 回调与 stats，业务层不直接碰 renderer。
 */
export class SceneManager {
  constructor(container, { quality = 'high' } = {}) {
    this.container = container
    this.quality = quality
    this.disposed = false

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#080a0f')
    this.scene.fog = new THREE.Fog('#080a0f', 110, 220)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800)
    this.camera.position.set(52, 56, 76)
    this.camera.layers.enableAll()

    this.renderer = new THREE.WebGLRenderer({
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.14
    this.renderer.shadowMap.enabled = quality !== 'low'
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // info 手动复位：后处理由多个 pass 组成，autoReset 会只统计最后一个全屏 quad
    this.renderer.info.autoReset = false
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.minDistance = 6
    this.controls.maxDistance = 190
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06
    this.controls.target.set(0, 1.5, 0)
    this.controls.zoomSpeed = 0.9
    this.controls.update()

    this._initLights()
    this._initComposer()

    this.clock = new THREE.Clock()
    this.elapsed = 0
    this.hooks = []
    this.stats = {
      fps: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      programs: 0,
      jsHeap: 0,
      quality: quality,
      degraded: false,
    }
    this._frames = 0
    this._fpsClock = 0
    this._lowFpsTime = 0

    this._onResize = () => this.resize()
    this._ro = new ResizeObserver(this._onResize)
    this._ro.observe(container)

    this.resize()
    this._loop = this._loop.bind(this)
    this._raf = requestAnimationFrame(this._loop)
  }

  _initLights() {
    const hemi = new THREE.HemisphereLight(0xbcd4ee, 0x121922, 0.95)
    this.scene.add(hemi)

    const dir = new THREE.DirectionalLight(0xdfe9f5, 2.1)
    dir.position.set(48, 72, 36)
    dir.castShadow = this.quality !== 'low'
    dir.shadow.mapSize.set(2048, 2048)
    const s = 70
    dir.shadow.camera.left = -s
    dir.shadow.camera.right = s
    dir.shadow.camera.top = s
    dir.shadow.camera.bottom = -s
    dir.shadow.camera.near = 10
    dir.shadow.camera.far = 220
    dir.shadow.bias = -0.0009
    dir.shadow.normalBias = 0.02
    this.scene.add(dir)
    this.sun = dir

    const fill = new THREE.DirectionalLight(0x2f81f7, 0.35)
    fill.position.set(-60, 30, -50)
    this.scene.add(fill)

    // 厂房内的工业光斑（青 + 琥珀），只做氛围
    const p1 = new THREE.PointLight(0x22d3ee, 90, 65, 2)
    p1.position.set(-26, 7.5, -12)
    this.scene.add(p1)
    const p2 = new THREE.PointLight(0xf0a04a, 70, 60, 2)
    p2.position.set(24, 7.5, 14)
    this.scene.add(p2)
    const p3 = new THREE.PointLight(0x2f81f7, 60, 55, 2)
    p3.position.set(4, 7.5, -20)
    this.scene.add(p3)

    this.scene.add(new THREE.AmbientLight(0x3c4a5c, 0.42))
  }

  _initComposer() {
    if (this.quality === 'low') return
    try {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.72, 0.72)
      this.composer.addPass(this.bloom)
      this.composer.addPass(new OutputPass())
      this.postEnabled = true
    } catch (e) {
      console.warn('[three] 后处理初始化失败，回退直出', e)
      this.composer = null
      this.postEnabled = false
    }
  }

  addUpdate(fn) {
    this.hooks.push(fn)
    return () => {
      const i = this.hooks.indexOf(fn)
      if (i >= 0) this.hooks.splice(i, 1)
    }
  }

  resize() {
    if (this.disposed) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    if (this.composer) this.composer.setSize(w, h)
  }

  setPostEnabled(on) {
    this.postEnabled = on && !!this.composer
  }

  /** 降级：关后处理 → 关阴影 → 降 pixelRatio */
  degrade(level = 1) {
    if (this.stats.degraded) return
    this.stats.degraded = true
    this.stats.quality = 'low'
    if (level >= 1) this.setPostEnabled(false)
    if (level >= 2) {
      this.renderer.shadowMap.enabled = false
      this.sun.castShadow = false
      this.renderer.setPixelRatio(1)
      this.scene.traverse((o) => {
        if (o.isMesh) o.castShadow = false
      })
    }
    this.resize()
  }

  _loop() {
    if (this.disposed) return
    this._raf = requestAnimationFrame(this._loop)
    const dt = Math.min(this.clock.getDelta(), 0.1)
    this.elapsed += dt

    this.controls.update(dt)
    this.hooks.forEach((fn) => fn(dt, this.elapsed))

    this.renderer.info.reset()
    if (this.postEnabled && this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)

    // 统计
    this._frames++
    this._fpsClock += dt
    if (this._fpsClock >= 0.5) {
      this.stats.fps = Math.round(this._frames / this._fpsClock)
      this._frames = 0
      this._fpsClock = 0
      const info = this.renderer.info
      this.stats.drawCalls = info.render.calls
      this.stats.triangles = info.render.triangles
      this.stats.geometries = info.memory.geometries
      this.stats.textures = info.memory.textures
      this.stats.programs = info.programs ? info.programs.length : 0
      this.stats.jsHeap = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0
      // 自动降级：连续 3 秒 FPS < 30
      if (this.stats.fps < 30 && this.stats.fps > 0) {
        this._lowFpsTime += 0.5
        if (this._lowFpsTime >= 3 && !this.stats.degraded) this.degrade(2)
      } else {
        this._lowFpsTime = 0
      }
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this._raf)
    this._ro?.disconnect()
    this.controls?.dispose()
    this.hooks = []
    this.composer?.dispose?.()
    if (this.bloom) this.bloom.dispose?.()
    this.renderer.dispose()
    this.renderer.forceContextLoss?.()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
    this.scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose()
        const m = o.material
        ;(Array.isArray(m) ? m : m ? [m] : []).forEach((mat) => {
          Object.keys(mat).forEach((k) => {
            if (mat[k] && mat[k].isTexture) mat[k].dispose()
          })
          mat.dispose?.()
        })
      }
    })
    this.scene.clear()
  }
}

export { HALL }
