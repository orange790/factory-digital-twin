/**
 * 场景分层：建筑 / 设备 / 标注 / 特效 / 辅助
 * 拾取只对 DEVICE 层生效（Raycaster.layers.set(LAYER.DEVICE)）
 */
export const LAYER = {
  DEFAULT: 0,
  BUILDING: 1,
  DEVICE: 2,
  LABEL: 3,
  EFFECT: 4,
  HELPER: 5,
}

export const LAYER_KEY_BY_NAME = {
  building: LAYER.BUILDING,
  device: LAYER.DEVICE,
  label: LAYER.LABEL,
  effect: LAYER.EFFECT,
  helper: LAYER.HELPER,
}

export const SCENE_LAYERS = ['building', 'device', 'label', 'effect', 'helper']

/** 递归设置图层（保留 layer 0，保证相机可见） */
export function setLayerDeep(root, layer) {
  root.traverse((o) => {
    o.layers.enable(layer)
    if (layer !== LAYER.DEVICE) o.layers.disable(LAYER.DEVICE)
  })
  return root
}
