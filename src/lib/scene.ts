/**
 * 场景（TASKS 09 §十三 第 10 件）：花瓣 / 雪 / 雨，逐帧画成 RGBA 帧缓冲，
 * 再用 gifenc 编成循环 GIF，导出 .pptx 时以 base64 图片插入。
 *
 * 为什么不用 canvas 截图：幻灯片导出发生在教师机上，没有网络也不该有渲染依赖；
 * 逐帧写 RGBA 与 canvas 的 ImageData 同构，gifenc 直接吃这份缓冲，
 * 所以 node 侧的离线门禁能逐像素验（GIF 头、循环块、帧数、非透明像素数）。
 *
 * 三条纪律（第 10 件）：
 *   1. 场景由模型读完课文自己选；抽不到具体的物就留空，不许硬塞；
 *   2. 同一份里页页可以不同，但不能页页都动（sceneProblems 判）；
 *   3. 留白是常态：没有场景的页就是纯纸面，不补任何装饰。
 */
/**
 * 直接引 ESM 产物：包里的 main 是 CJS，node 侧（离线门禁）用命名导入会拿不到 GIFEncoder。
 * 浏览器与 node 都吃这一份 ESM，省掉 CJS/ESM 互操作的两种形状。
 */
import { GIFEncoder } from 'gifenc/dist/gifenc.esm.js'

export const SCENE_KINDS = ['petals', 'snow', 'rain'] as const
export type SceneKind = (typeof SCENE_KINDS)[number]
/** 一页的场景：'' = 留白（绝大多数页） */
export type SceneSlot = SceneKind | ''

export const SCENE_NAME: Record<SceneKind, string> = {
  petals: '花瓣',
  snow: '雪',
  rain: '雨',
}

export const SCENE = {
  /** 800×450 = 16:9，与 LAYOUT_WIDE 同比例；60 帧实测原样嵌入 WPS / PowerPoint 都会循环播 */
  width: 800,
  height: 450,
  frames: 60,
  /**
   * 一帧 130ms → 整段 7.8s 一循环（TASKS 10 §十一：7.5–10 秒一轮）。
   * 比网页演示的雪花慢：这是投影上的背景板，不是动画片。
   */
  delayMs: 130,
} as const

/**
 * 花瓣自己一套节拍：55 帧 × 200ms = 11.0s 一循环。
 * 比雪雨慢一拍，投影上才像落花而不是下落。
 */
export const PETALS_TIMING = { frames: 55, delayMs: 200 } as const

export const framesOf = (kind: SceneKind): number => (kind === 'petals' ? PETALS_TIMING.frames : SCENE.frames)
export const delayOf = (kind: SceneKind): number => (kind === 'petals' ? PETALS_TIMING.delayMs : SCENE.delayMs)

/** 花瓣只在 y 0.25–1 飘：上半页是标题区，必须干净 */
export const PETAL_BAND_TOP = 0.25

export const isSceneKind = (v: unknown): v is SceneKind =>
  (SCENE_KINDS as readonly unknown[]).includes(v)

/* ------------------------------ 确定性随机 ------------------------------ */

/** mulberry32：同 seed 同画面，离线与线上逐像素一致，GIF 才能被断言 */
function rand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Particle {
  /** 起点 0–1（相对宽高） */
  x0: number
  y0: number
  /** 每帧位移（相对宽高）：花瓣横向摆、雪慢飘、雨直落 */
  vx: number
  vy: number
  /** 像素尺寸 */
  size: number
  /** 取哪一档色 */
  tint: number
  /** 花瓣摆动相位 */
  phase: number
  /** 要不要再长一片小瓣（两瓣花），参考图里半数花是两瓣 */
  second?: boolean
}

/**
 * 粒子表只算一次：三种场景各自的密度按「看得见但不糊住字」定。
 *
 * 花瓣只有 13 枚：它不能是主角。一朵花先跳出来，老师的字就成了背景。
 * 位移取整数分之一屏（k / frames），一循环正好回到原点——
 * GIF 循环重播时不会整屏跳一下。
 */
function particlesOf(kind: SceneKind): Particle[] {
  const count = kind === 'petals' ? 13 : kind === 'snow' ? 70 : 90
  const r = rand(kind === 'petals' ? 20261120 : kind === 'snow' ? 19260817 : 19981219)
  return Array.from({ length: count }, () => {
    if (kind === 'petals') {
      const frames = PETALS_TIMING.frames
      return {
        x0: r(),
        y0: r(),
        // 横向 0 或 ±1 屏 / 一循环，纵向 1–2 屏 / 一循环：都是整数圈
        vx: (Math.floor(r() * 3) - 1) / frames,
        vy: (1 + Math.floor(r() * 2)) / frames,
        // 4–6px 是花身尺寸；长轴约 1.8 倍，落在 7–11px，与参考那块花瓣同大
        size: 4 + r() * 2,
        tint: Math.floor(r() * 3),
        phase: r() * Math.PI * 2,
        second: r() > 0.6,
      }
    }
    if (kind === 'snow') {
      return {
        x0: r(),
        y0: r(),
        vx: (r() - 0.5) * 0.004,
        vy: 0.002 + r() * 0.003,
        size: 1.2 + r() * 1.8,
        tint: Math.floor(r() * 2),
        phase: r() * Math.PI * 2,
      }
    }
    return {
      x0: r(),
      y0: r(),
      vx: -0.004,
      vy: 0.03 + r() * 0.02,
      size: 8 + r() * 12,
      tint: Math.floor(r() * 2),
      phase: r() * Math.PI * 2,
    }
  })
}

/** 三种场景的色板：index 0 恒为透明（GIF 的 1-bit 透明位就指它） */
const PALETTES: Record<SceneKind, [number, number, number][]> = {
  // 桂花的淡金：不是朱红。落在秋江那种暖白纸上，是「花」，不是「印」
  petals: [
    [232, 196, 106],
    [217, 164, 65],
    [240, 216, 148],
  ],
  snow: [
    [255, 255, 255],
    [232, 236, 239],
  ],
  rain: [
    [139, 152, 163],
    [109, 122, 134],
  ],
}

const PAL = SCENE.width * SCENE.height

/* ------------------------------ 逐帧绘制 ------------------------------ */

/**
 * 画第 frame 帧，返回 800×450 的 RGBA 缓冲（背景全透明，粒子才上色）。
 * 位置一律 0–1 归一化后再乘宽高，改尺寸只改 SCENE，不动绘制。
 */
export function paintSceneFrame(
  kind: SceneKind,
  frame: number,
  width: number = SCENE.width,
  height: number = SCENE.height
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4)
  const t = frame / framesOf(kind)
  const palette = PALETTES[kind]
  const parts = particlesOf(kind)
  const put = (x: number, y: number, tint: number, alpha: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return
    const at = (Math.floor(y) * width + Math.floor(x)) * 4
    const [r, g, b] = palette[tint]
    // 简单叠加（over）：粒子之间偶尔交叠也不糊成一团黑
    buf[at] = r
    buf[at + 1] = g
    buf[at + 2] = b
    buf[at + 3] = Math.max(buf[at + 3], Math.round(alpha * 255))
  }

  for (const p of parts) {
    // 摆幅是「加」不是「乘 frame」：乘以帧号会让第 55 帧与第 0 帧对不上，循环时整屏跳一下
    const sway = kind === 'petals' ? Math.sin(t * Math.PI * 4 + p.phase) * 0.015 : 0
    const x = (((p.x0 + p.vx * frame + sway) % 1) + 1) % 1
    const yRaw = (((p.y0 + p.vy * frame) % 1) + 1) % 1
    // 花瓣只在中下部飘（y 0.25–1）：上半页留给标题，一朵也不能上去
    const y = kind === 'petals' ? PETAL_BAND_TOP + (1 - PETAL_BAND_TOP) * yRaw : yRaw
    const px = x * width
    const py = y * height

    if (kind === 'rain') {
      // 雨：一根竖线，越靠下越淡（落地的感觉）
      const len = p.size
      for (let k = 0; k < len; k++) put(px, py + k, p.tint, 0.55 * (1 - k / len) + 0.15)
      continue
    }
    if (kind === 'petals') {
      // 一枚花瓣 = 一枚水滴（长轴 7–11px、花身 4–6px），四成再带一片小瓣。
      // 实心圆改水滴才有方向；两瓣拼起来才像落花，不像彩屑。
      const ry = p.size * 0.9
      const rx = p.size * 0.5
      const cos = Math.cos(p.phase)
      const sin = Math.sin(p.phase)
      const lobes: [number, number, number][] = p.second
        ? [
            [0, 0, 1],
            [-rx * 0.9, ry * 0.42, 0.62],
          ]
        : [[0, 0, 1]]
      for (const [ox0, oy0, k] of lobes) {
        const kx = rx * k
        const ky = ry * k
        for (let ly = -ky; ly <= ky; ly += 0.5) {
          const u = ly / ky
          // 水滴：一端圆、一端尖
          const wRow = kx * Math.sqrt(Math.max(0, 1 - u * u)) * (0.35 + 0.65 * (u + 1) / 2)
          for (let lx = -wRow; lx <= wRow; lx += 0.5) {
            const ox = lx + ox0
            const oy = ly + oy0
            put(px + ox * cos - oy * sin, py + ox * sin + oy * cos, p.tint, 0.92)
          }
        }
      }
      continue
    }
    // 雪是实心圆
    const rx = p.size
    const ry = p.size
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue
        put(px + dx, py + dy, p.tint, 0.9)
      }
    }
  }
  return buf
}

/** RGBA → 调色板索引（透明像素一律 0；不透明像素取最近色） */
export function indexSceneFrame(buf: Uint8ClampedArray, palette: [number, number, number][]): Uint8Array {
  const n = buf.length / 4
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const at = i * 4
    if (buf[at + 3] < 128) {
      out[i] = 0
      continue
    }
    let best = 0
    let bestD = Infinity
    for (let c = 0; c < palette.length; c++) {
      const [r, g, b] = palette[c]
      const d = (r - buf[at]) ** 2 + (g - buf[at + 1]) ** 2 + (b - buf[at + 2]) ** 2
      if (d < bestD) {
        bestD = d
        best = c + 1
      }
    }
    out[i] = best
  }
  return out
}

/* ------------------------------ 编成循环 GIF ------------------------------ */

/** gifenc 的调色板：第 0 格留给透明 */
function gifPalette(kind: SceneKind): [number, number, number, number][] {
  return [[0, 0, 0, 0], ...PALETTES[kind].map(([r, g, b]) => [r, g, b, 255] as [number, number, number, number])]
}

const cache = new Map<SceneKind, Uint8Array>()

/** 编一次就缓存：同一节课往往同一场景用在多页，不必重编 */
export function sceneGif(kind: SceneKind): Uint8Array {
  const hit = cache.get(kind)
  if (hit) return hit
  const gif = GIFEncoder()
  const palette = gifPalette(kind)
  for (let f = 0; f < framesOf(kind); f++) {
    const index = indexSceneFrame(paintSceneFrame(kind, f), PALETTES[kind])
    gif.writeFrame(index, SCENE.width, SCENE.height, {
      palette,
      transparent: true,
      transparentIndex: 0,
      delay: delayOf(kind),
      // repeat 只在第一帧写进逻辑屏幕描述符：0 = 无限循环
      ...(f === 0 ? { repeat: 0 } : {}),
      // dispose 2：每帧先清回背景，不拖尾
      dispose: 2,
    })
  }
  gif.finish()
  const bytes = gif.bytes()
  cache.set(kind, bytes)
  return bytes
}

/** data URL：pptxgenjs 的 addImage 与网页的 <img> 吃同一份 */
export function sceneDataUrl(kind: SceneKind): string {
  const bytes = sceneGif(kind)
  let bin = ''
  // btoa 只吃 latin1，分块拼；node 18+ 与浏览器都有 btoa
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:image/gif;base64,${btoa(bin)}`
}

/* ------------------------------ 场景表的口径 ------------------------------ */

/** 模型给的场景表按页数对齐：多的截掉，少的留白 */
export function alignScenes(list: readonly (SceneKind | string | undefined)[] | undefined, total: number): SceneSlot[] {
  return Array.from({ length: Math.max(0, total) }, (_, i) => {
    const v = list?.[i]
    return isSceneKind(v) ? v : ''
  })
}

/**
 * 场景表体检：只守两条硬线——
 *   ① 出现不认识的场景名（不许自造「枫叶」「烟花」）；
 *   ② 页页都动（第 10 件原话：同一份里页页可以不同，但不能页页都动）。
 * 留白（整份一张场景都没有）永远合法：抽不到具体的物就该安安静静。
 */
export function sceneProblems(slots: readonly (SceneKind | '')[]): string[] {
  const out: string[] = []
  if (!Array.isArray(slots) || slots.length === 0) return ['一页都没有']
  slots.forEach((s, i) => {
    if (s !== '' && !isSceneKind(s)) out.push(`第 ${i + 1} 页的场景「${String(s)}」不在 petals / snow / rain 里`)
  })
  const moving = slots.filter((s) => s !== '').length
  if (moving === slots.length && slots.length > 0) {
    out.push(`整份 ${slots.length} 页全都在动：页页都动等于没有留白，必须至少留一页静止`)
  }
  return out
}

/** 有几页会动 / 用了哪几种场景（验收表与界面提示共用） */
export function sceneSummary(slots: readonly SceneSlot[]): string {
  const moving = slots.filter((s) => s !== '').length
  const kinds = [...new Set(slots.filter((s) => s !== ''))] as SceneKind[]
  if (moving === 0) return '整份留白（没有场景）'
  return `${moving}/${slots.length} 页动 · ${kinds.map((k) => SCENE_NAME[k]).join('/')}`
}

/** 验收/自检用：一帧里非透明像素数（证明场景真的画上了东西） */
export function opaquePixels(buf: Uint8ClampedArray): number {
  let n = 0
  for (let i = 3; i < buf.length; i += 4) if (buf[i] >= 128) n++
  return n
}

export { PAL as SCENE_PIXELS }