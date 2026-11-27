/**
 * 「AI 生成」水印抹除（TASKS/11 §六）。
 *
 * 生图接口在每张图右下角印四个很淡的字，投影上是脏的。这里把那一小块补平：
 * 取水印区左边一条竖带的中位色，铺到右下角，左侧与上侧各留一段羽化。
 * 不裁切（会切掉画面）、不盖白块（雪地图上会露馅）。
 *
 * 为什么不用 canvas：导出脚本跑在 Node 里，node 没有 canvas。
 * 所以这里自带一个最小的 PNG 读写（8 位、非隔行、RGB / RGBA），
 * 浏览器与 Node 共用同一段代码：zlib 走 node:zlib，浏览器走 CompressionStream。
 */

/** 水印补丁的取色带与铺色区（相对宽高，§六 给的数） */
export const WM_BAND = { x0: 0.72, x1: 0.8, y0: 0.74 }
export const WM_PATCH = { x0: 0.8, y0: 0.76 }
/** 羽化比例：左侧 18%、上侧 35% */
export const WM_FEATHER = { left: 0.18, top: 0.35 }
/** 高斯模糊半径（像素），按盒子模糊近似 */
export const WM_BLUR = 6

export interface RgbaImage {
  width: number
  height: number
  /** RGBA，长度 = width * height * 4 */
  pixels: Uint8Array
}

/* ---------------------------- zlib（两个运行时） ---------------------------- */

/**
 * node:zlib 与浏览器 CompressionStream 的同一接口。
 * 动态 import 用变量写，打包器不会把它当静态依赖；浏览器那条分支永远走不到。
 */
async function zlib(mode: 'inflate' | 'deflate', bytes: Uint8Array): Promise<Uint8Array> {
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node)
  if (isNode) {
    const name = 'node:zlib'
    const mod = (await import(/* @vite-ignore */ name)) as {
      inflateSync: (b: Uint8Array) => Uint8Array
      deflateSync: (b: Uint8Array, o?: { level?: number }) => Uint8Array
    }
    return mode === 'inflate'
      ? new Uint8Array(mod.inflateSync(bytes))
      : new Uint8Array(mod.deflateSync(bytes, { level: 9 }))
  }
  const g = globalThis as unknown as {
    CompressionStream?: new (format: string) => ReadableWritablePair<Uint8Array, Uint8Array>
    DecompressionStream?: new (format: string) => ReadableWritablePair<Uint8Array, Uint8Array>
  }
  const Ctor = mode === 'inflate' ? g.DecompressionStream : g.CompressionStream
  if (!Ctor) throw new Error('这个环境没有 zlib，也没有 CompressionStream')
  // TS 5.6 的 BlobPart 只认 ArrayBufferView<ArrayBuffer>；这里的字节数组来自 Uint8Array，
  // 运行时就是一段普通内存，转一下类型即可
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Ctor('deflate') as never)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/* ------------------------------- CRC / 分块 ------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const head = new Uint8Array([...new TextEncoder().encode(type), ...data])
  return new Uint8Array([...u32(data.length), ...head, ...u32(crc32(head))])
}

/* --------------------------------- 解码 --------------------------------- */

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIG.every((v, i) => bytes[i] === v)
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** 解一张 8 位、非隔行的 PNG（colorType 2 / 6）。别的一律当解不动，返回 null。 */
export async function decodePng(buf: Uint8Array): Promise<RgbaImage | null> {
  if (!isPng(buf)) return null
  let at = 8
  let width = 0
  let height = 0
  let colorType = -1
  let bitDepth = 0
  let interlace = 0
  const idat: Uint8Array[] = []
  while (at + 8 <= buf.length) {
    const len = (buf[at] << 24) | (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3]
    const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7])
    const body = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      width = (body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]
      height = (body[4] << 24) | (body[5] << 16) | (body[6] << 8) | body[7]
      bitDepth = body[8]
      colorType = body[9]
      interlace = body[12]
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    at += 12 + len
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null
  if (colorType !== 2 && colorType !== 6) return null

  const channels = colorType === 6 ? 4 : 3
  const raw = await zlib('inflate', concat(idat))
  const stride = width * channels
  if (raw.length < (stride + 1) * height) return null

  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      const v =
        filter === 0
          ? line[x]
          : filter === 1
            ? line[x] + a
            : filter === 2
              ? line[x] + b
              : filter === 3
                ? line[x] + ((a + b) >> 1)
                : line[x] + paeth(a, b, c)
      cur[x] = v & 255
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = (y * width + x) * 4
      out[d] = cur[s]
      out[d + 1] = cur[s + 1]
      out[d + 2] = cur[s + 2]
      out[d + 3] = channels === 4 ? cur[s + 3] : 255
    }
    prev = cur
  }
  return { width, height, pixels: out }
}

function concat(list: Uint8Array[]): Uint8Array {
  const total = list.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const b of list) {
    out.set(b, at)
    at += b.length
  }
  return out
}

/** 编回 PNG：每行 filter 0（不猜最优滤波，省得再错一次） */
export async function encodePng(img: RgbaImage): Promise<Uint8Array> {
  const { width, height, pixels } = img
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1)
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0])
  const body = await zlib('deflate', raw)
  return concat([
    new Uint8Array(PNG_SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', body),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/* ------------------------------- 水印补丁 ------------------------------- */

function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** #rrggbb → [r,g,b]；不是六位色值就 null（调用方退回中位色） */
function paperRgb(hex?: string): number[] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * 把右下角那块补平。返回新的像素（不改原数组）。
 * 取色带 = 水印左边一条竖带的中位色；补丁 = 右下角；左侧 18% / 上侧 35% 羽化；6px 模糊。
 *
 * paperHex：这一页的纸色（TASKS/12 §六②）。给了就优先用它——纸换了、补丁还是旧纸色，
 * 那块补丁在深纸上就是一块亮斑。但只在「取色带确实就是纸」时用：
 * 竖带压到画上时仍走中位色，不能拿纸色盖掉一块画。
 */
export function patchWatermark(img: RgbaImage, paperHex?: string): RgbaImage {
  const { width: w, height: h } = img
  const src = img.pixels
  const out = new Uint8Array(src)

  const bx0 = Math.floor(WM_BAND.x0 * w)
  const bx1 = Math.max(bx0 + 1, Math.floor(WM_BAND.x1 * w))
  const by0 = Math.floor(WM_BAND.y0 * h)
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let y = by0; y < h; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = (y * w + x) * 4
      rs.push(src[i])
      gs.push(src[i + 1])
      bs.push(src[i + 2])
    }
  }
  const band = [medianOf(rs), medianOf(gs), medianOf(bs)]
  const fill = paperRgb(paperHex) ?? band
  if (paperHex && Math.hypot(fill[0] - band[0], fill[1] - band[1], fill[2] - band[2]) > 60) {
    // 竖带与这一页的纸差太远：那里已经有画了，补丁跟着画走，别拿纸色盖上去
    fill.splice(0, 3, ...band)
  }

  const px0 = Math.floor(WM_PATCH.x0 * w)
  const py0 = Math.floor(WM_PATCH.y0 * h)
  const pw = w - px0
  const ph = h - py0
  const featherX = Math.max(1, Math.floor(pw * WM_FEATHER.left))
  const featherY = Math.max(1, Math.floor(ph * WM_FEATHER.top))

  // 先把 alpha 蒙版算出来（0 = 原样，1 = 全换成补丁色），再糊一遍当模糊
  const mask = new Float32Array(pw * ph)
  for (let y = 0; y < ph; y++) {
    const fy = Math.min(1, y / featherY)
    for (let x = 0; x < pw; x++) {
      const fx = Math.min(1, x / featherX)
      mask[y * pw + x] = Math.min(fx, fy)
    }
  }
  const blurred = boxBlur(mask, pw, ph, WM_BLUR)

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const a = blurred[y * pw + x]
      if (a <= 0.002) continue
      const i = ((py0 + y) * w + (px0 + x)) * 4
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(src[i + c] * (1 - a) + fill[c] * a)
    }
  }
  return { width: w, height: h, pixels: out }
}

/** 盒子模糊近似高斯：两趟（横、竖）滑动窗口，半径 r */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const win = r * 2 + 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))]
      tmp[y * w + x] = sum / win
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]
      out[y * w + x] = sum / win
    }
  }
  return out
}

/* -------------------------------- data URL -------------------------------- */

export function bytesToDataUrl(bytes: Uint8Array, mime = 'image/png'): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || !/;base64,/.test(dataUrl.slice(0, comma + 8))) return null
  try {
    const bin = atob(dataUrl.slice(comma + 1))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/**
 * 抹水印：解不动（不是 PNG / 压缩方式不认识）就原样返回，绝不把图弄坏。
 * 失败一律不抛——降级规则见 §八。
 */
export async function stripWatermark(dataUrl: string, paperHex?: string): Promise<string> {
  try {
    const bytes = dataUrlToBytes(dataUrl)
    if (!bytes || !isPng(bytes)) return dataUrl
    const img = await decodePng(bytes)
    if (!img) return dataUrl
    const patched = patchWatermark(img, paperHex)
    return bytesToDataUrl(await encodePng(patched))
  } catch {
    return dataUrl
  }
}