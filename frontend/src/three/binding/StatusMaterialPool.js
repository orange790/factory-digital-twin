import * as THREE from 'three'

export const DEFAULT_STATUS_COLORS = {
  normal: '#3FB950',
  offline: '#8B949E',
  fault: '#F85149',
  stop: '#D29922',
}

export const DEFAULT_STATUS_TEXT = {
  normal: '正常运行',
  offline: '离线',
  fault: '故障告警',
  stop: '停机',
}

/**
 * 告警闪烁材质 —— 在 MeshStandardMaterial 上注入"呼吸 + 边缘 Fresnel"
 * 为什么不直接用裸 ShaderMaterial：
 *   1) 保留 PBR 光照，场景里仍有明暗与阴影，不会变成"贴纸感"；
 *   2) 200 台设备共享同一个材质实例，uTime 用一个共享 uniform 统一推进，
 *      不产生额外材质对象（对应 F-3D-04 的教训）。
 */
export function createAlarmMaterial({ baseColor = 0xf85149, blinkColor = 0xff5a4d, intensity = 1 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uBlinkColor: { value: new THREE.Color(blinkColor) },
  }
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.5,
    metalness: 0.15,
    emissive: new THREE.Color(0x33090a),
  })
  mat.userData.isAlarmMaterial = true
  mat.userData.uniforms = uniforms
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uIntensity = uniforms.uIntensity
    shader.uniforms.uBlinkColor = uniforms.uBlinkColor
    shader.fragmentShader = `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uBlinkColor;
    ` + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
       float pulse = 0.5 + 0.5 * sin(uTime * 7.5);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, uBlinkColor, pulse * uIntensity * 0.68);
       gl_FragColor.rgb += fres * uBlinkColor * (0.35 + pulse * 0.45);`,
    )
  }
  return mat
}

/**
 * 状态材质池：4 套共享材质 + 1 套告警材质
 * 切换状态只改 mesh.material 的引用，不 clone、不新建 —— DrawCall 与显存都稳。
 */
export class StatusMaterialPool {
  constructor(colors = DEFAULT_STATUS_COLORS) {
    this.colors = { ...DEFAULT_STATUS_COLORS, ...colors }
    this.materials = {}
    this.build()
  }

  build() {
    this.dispose()
    const c = this.colors
    this.materials.normal = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c.normal),
      roughness: 0.55,
      metalness: 0.2,
    })
    this.materials.offline = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c.offline),
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.55,
    })
    this.materials.stop = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c.stop),
      roughness: 0.6,
      metalness: 0.15,
    })
    this.materials.fault = createAlarmMaterial({ baseColor: new THREE.Color(c.fault).getHex() })
    this.materials.faultStatic = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c.fault),
      emissive: new THREE.Color(c.fault).multiplyScalar(0.35),
      roughness: 0.5,
    })
    this.time = this.materials.fault.userData.uniforms.uTime
    this.intensity = this.materials.fault.userData.uniforms.uIntensity
  }

  get(status, { staticBlink = false } = {}) {
    if (status === 'fault') return staticBlink ? this.materials.faultStatic : this.materials.fault
    return this.materials[status] || this.materials.offline
  }

  setColors(colors) {
    this.colors = { ...this.colors, ...colors }
    this.build()
  }

  setBlinkEnabled(on) {
    if (this.intensity) this.intensity.value = on ? 1 : 0
  }

  update(dt, elapsed) {
    if (this.time) this.time.value = elapsed
  }

  dispose() {
    Object.values(this.materials).forEach((m) => m && m.dispose())
    this.materials = {}
  }
}
