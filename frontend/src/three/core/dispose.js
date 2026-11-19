/**
 * 统一资源销毁（面试必问：路由进出为什么没有内存泄漏）
 * ------------------------------------------------------------------
 * three.js 的 geometry / material / texture 是显存对象，不会被 GC 回收，
 * 必须显式 dispose。这里递归处理，并处理材质的贴图字段 + 自定义 uniform。
 */
export function disposeMaterial(mat) {
  if (!mat) return
  Object.keys(mat).forEach((k) => {
    const v = mat[k]
    if (v && v.isTexture) v.dispose()
  })
  if (mat.uniforms) {
    Object.values(mat.uniforms).forEach((u) => {
      if (u?.value?.isTexture) u.value.dispose()
    })
  }
  mat.dispose()
}

export function disposeObject(root, { keepMaterials } = {}) {
  if (!root) return
  const materials = new Set()
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const m = o.material
    const mats = Array.isArray(m) ? m : m ? [m] : []
    mats.forEach((x) => materials.add(x))
    if (o.isInstancedMesh && o.dispose) o.dispose()
  })
  // 共享材质只销毁一次；状态材质池由 TwinScene 统一管理，不在此销毁
  if (!keepMaterials) materials.forEach(disposeMaterial)
}
