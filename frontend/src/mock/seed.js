/**
 * 工厂布局与设备台账种子数据
 * ------------------------------------------------------------------
 * 说明：设备的坐标不是写死在 3D 场景里的 —— 这里生成的是"台账数据"，
 * 三维场景按 device.position_* + device_type 程序化摆放节点。
 * 因此「新增设备 → 场景出现新节点」是数据驱动的自然结果（F-BE-01）。
 */

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const rand = mulberry32(20261119)

export const AREAS = [
  { id: 1, name: '机加工车间', code: 'A', sort: 1, desc: 'CNC 加工、冲压成型，粉尘与噪声较高' },
  { id: 2, name: '装配车间', code: 'B', sort: 2, desc: '总装与部装，机械臂密集' },
  { id: 3, name: '检测包装车间', code: 'C', sort: 3, desc: '视觉检测、打标、包装入库' },
]

export const LINE_LAYOUT = [
  { id: 1, area_id: 1, code: 'A1', name: '机加工一线', z: -20, capacity: 480 },
  { id: 2, area_id: 1, code: 'A2', name: '机加工二线', z: -12, capacity: 460 },
  { id: 3, area_id: 2, code: 'B1', name: '装配一线', z: -4, capacity: 320 },
  { id: 4, area_id: 2, code: 'B2', name: '装配二线', z: 4, capacity: 300 },
  { id: 5, area_id: 3, code: 'C1', name: '检测一线', z: 12, capacity: 560 },
  { id: 6, area_id: 3, code: 'C2', name: '检测二线', z: 20, capacity: 540 },
]

const STATIONS = 12
const X0 = -32
const PITCH = 5
const ROBOT_STATIONS = [1, 4, 7, 10]
const GAUGE_STATIONS = [0, 3, 6, 9]

const MACHINE_KINDS = [
  { prefix: 'CNC加工中心', rated: 22, baseTemp: 58, baseSpeed: 1200 },
  { prefix: '数控冲床', rated: 18, baseTemp: 54, baseSpeed: 900 },
  { prefix: '注塑成型机', rated: 30, baseTemp: 62, baseSpeed: 700 },
]

function pad(n, len = 2) {
  return String(n).padStart(len, '0')
}

function dayOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * 生成 200 台设备：72 机床 + 24 机械臂 + 72 传感器 + 24 检测仪 + 8 AGV
 * 每个设备都带 glb_node_name（本工程用程序化资产，等价于 GLB 节点名规范）
 */
export function buildDevices() {
  const devices = []
  const baselines = {}
  const seq = { m: 0, s: 0, r: 0, g: 0 }
  const rnd = mulberry32(88001)

  LINE_LAYOUT.forEach((line, li) => {
    const area = AREAS.find((a) => a.id === line.area_id)
    for (let s = 0; s < STATIONS; s++) {
      const x = X0 + s * PITCH
      const z = line.z
      const kind = MACHINE_KINDS[(li + s) % MACHINE_KINDS.length]
      seq.m += 1
      const code = `M${pad(seq.m)}`
      devices.push({
        id: devices.length + 1,
        code,
        name: `${kind.prefix}-${line.code}${pad(s + 1)}`,
        device_type: 'machine',
        area_id: area.id,
        area_code: area.code,
        area_name: area.name,
        line_id: line.id,
        line_code: line.code,
        parent_id: null,
        status: 'normal',
        is_critical: s === 0 || s === 11,
        glb_node_name: `DEV_${code}`,
        position_x: x,
        position_y: 0,
        position_z: z,
        camera_preset: `line_${line.code}`,
        rated_power: kind.rated,
        install_date: dayOffset(120 + Math.floor(rnd() * 900)),
        maintain_cycle_days: [30, 60, 90][Math.floor(rnd() * 3)],
        last_maintain_date: dayOffset(Math.floor(rnd() * 120)),
        desc: `${kind.prefix}，隶属${line.name}`,
        created_at: new Date(Date.now() - 86400000 * 200).toISOString(),
        updated_at: new Date().toISOString(),
      })
      baselines[code] = {
        temperature: kind.baseTemp + rnd() * 4,
        speed: kind.baseSpeed,
        current: 8 + rnd() * 2,
        output: 40 + rnd() * 10,
      }

      // 传感器（挂装在机床上方，同规格 → 实例化渲染）
      seq.s += 1
      const scode = `S${pad(seq.s)}`
      devices.push({
        id: devices.length + 1,
        code: scode,
        name: `温振传感器-${line.code}${pad(s + 1)}`,
        device_type: 'sensor',
        area_id: area.id,
        area_code: area.code,
        area_name: area.name,
        line_id: line.id,
        line_code: line.code,
        parent_id: devices[devices.length - 1].id,
        status: 'normal',
        is_critical: false,
        glb_node_name: `DEV_${scode}`,
        position_x: x,
        position_y: 2.35,
        position_z: z,
        camera_preset: `line_${line.code}`,
        rated_power: 0.5,
        install_date: dayOffset(90 + Math.floor(rnd() * 800)),
        maintain_cycle_days: 180,
        last_maintain_date: dayOffset(Math.floor(rnd() * 150)),
        desc: '温度/振动复合传感器，1s 上报一次',
        created_at: new Date(Date.now() - 86400000 * 180).toISOString(),
        updated_at: new Date().toISOString(),
      })
      baselines[scode] = { temperature: kind.baseTemp - 6, vibration: 3.2, current: 0.2, output: 0 }

      if (ROBOT_STATIONS.includes(s)) {
        seq.r += 1
        const rcode = `R${pad(seq.r)}`
        devices.push({
          id: devices.length + 1,
          code: rcode,
          name: `六轴机械臂-${line.code}${pad(s + 1)}`,
          device_type: 'robot',
          area_id: area.id,
          area_code: area.code,
          area_name: area.name,
          line_id: line.id,
          line_code: line.code,
          parent_id: null,
          status: 'normal',
          is_critical: false,
          glb_node_name: `DEV_${rcode}`,
          position_x: x + 1.7,
          position_y: 0,
          position_z: z + 1.1,
          camera_preset: `line_${line.code}`,
          rated_power: 7.5,
          install_date: dayOffset(60 + Math.floor(rnd() * 700)),
          maintain_cycle_days: 90,
          last_maintain_date: dayOffset(Math.floor(rnd() * 100)),
          desc: '上下料与装配工位机械臂',
          created_at: new Date(Date.now() - 86400000 * 160).toISOString(),
          updated_at: new Date().toISOString(),
        })
        baselines[rcode] = { temperature: 48 + rnd() * 5, speed: 60, current: 6 + rnd() * 2, output: 0 }
      }

      if (GAUGE_STATIONS.includes(s)) {
        seq.g += 1
        const gcode = `G${pad(seq.g)}`
        devices.push({
          id: devices.length + 1,
          code: gcode,
          name: `视觉检测仪-${line.code}${pad(s + 1)}`,
          device_type: 'gauge',
          area_id: area.id,
          area_code: area.code,
          area_name: area.name,
          line_id: line.id,
          line_code: line.code,
          parent_id: null,
          status: 'normal',
          is_critical: false,
          glb_node_name: `DEV_${gcode}`,
          position_x: x - 1.5,
          position_y: 0,
          position_z: z - 1.4,
          camera_preset: `line_${line.code}`,
          rated_power: 1.2,
          install_date: dayOffset(40 + Math.floor(rnd() * 600)),
          maintain_cycle_days: 60,
          last_maintain_date: dayOffset(Math.floor(rnd() * 140)),
          desc: 'CCD 视觉外观检测，联动剔除机构',
          created_at: new Date(Date.now() - 86400000 * 150).toISOString(),
          updated_at: new Date().toISOString(),
        })
        baselines[gcode] = { temperature: 40 + rnd() * 3, speed: 300, current: 1.5, output: 0 }
      }
    }
  })

  // AGV —— 沿主通道搬运
  for (let i = 0; i < 8; i++) {
    const code = `V${pad(i + 1)}`
    const lane = i % 2 === 0 ? -8 : 8
    devices.push({
      id: devices.length + 1,
      code,
      name: `搬运AGV-${pad(i + 1)}`,
      device_type: 'agv',
      area_id: i < 3 ? 1 : i < 6 ? 2 : 3,
      area_code: i < 3 ? 'A' : i < 6 ? 'B' : 'C',
      area_name: i < 3 ? '机加工车间' : i < 6 ? '装配车间' : '检测包装车间',
      line_id: null,
      line_code: '',
      parent_id: null,
      status: 'normal',
      is_critical: false,
      glb_node_name: `DEV_${code}`,
      position_x: -28 + i * 7,
      position_y: 0,
      position_z: lane,
      camera_preset: 'overview',
      rated_power: 3,
      install_date: dayOffset(30 + i * 20),
      maintain_cycle_days: 45,
      last_maintain_date: dayOffset(10 + i * 3),
      desc: '磁条导航搬运车，负责线边仓与工位间转运',
      created_at: new Date(Date.now() - 86400000 * 100).toISOString(),
      updated_at: new Date().toISOString(),
    })
    baselines[code] = { temperature: 36 + rnd() * 3, battery: 70 + rnd() * 25, speed: 1.2, output: 0 }
  }

  // 保养周期贴合设备自身周期，避免"待保养"数量失真
  devices.forEach((d) => {
    if (d.device_type === 'machine' || d.device_type === 'gauge') {
      d.last_maintain_date = dayOffset(Math.floor(rnd() * d.maintain_cycle_days * 1.12))
    }
  })

  // 初始状态分布：大部分正常，少量故障/停机/离线，保证首页有内容
  const faults = ['M07', 'M31', 'R05', 'S44', 'G12']
  const stops = ['M18', 'M52', 'V03']
  const offline = ['M63', 'S09', 'S58', 'G21', 'R17', 'V06']
  devices.forEach((d) => {
    if (faults.includes(d.code)) d.status = 'fault'
    else if (stops.includes(d.code)) d.status = 'stop'
    else if (offline.includes(d.code)) d.status = 'offline'
  })

  return { devices, baselines }
}

export const DEVICE_TYPE_META = {
  machine: { label: '机床', icon: 'machine' },
  robot: { label: '机械臂', icon: 'robot' },
  sensor: { label: '传感器', icon: 'sensor' },
  gauge: { label: '检测仪', icon: 'gauge' },
  agv: { label: 'AGV', icon: 'agv' },
}

export const STATUS_META = {
  normal: { label: '正常运行', color: '#3FB950' },
  offline: { label: '离线', color: '#8B949E' },
  fault: { label: '故障告警', color: '#F85149' },
  stop: { label: '停机', color: '#D29922' },
}

export function overdueDays(d) {
  if (!d.last_maintain_date) return 0
  const due = new Date(d.last_maintain_date)
  due.setDate(due.getDate() + (d.maintain_cycle_days || 90))
  return Math.floor((Date.now() - due.getTime()) / 86400000)
}
