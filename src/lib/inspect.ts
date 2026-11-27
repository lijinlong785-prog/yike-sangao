/**
 * 回读一张插画：把「图上能看见什么」变成四个数字（TASKS/12 §二）。
 *
 * DeepSeek 看不见图，所以第二遍只能吃这里的数：主体包围盒、四象限空占比、
 * 非纸色像素比、边缘密度。数必须是同一套——浏览器用 canvas 取 ImageData，
 * 导出脚本（Node，没有 canvas）用 watermark.ts 自带的 PNG 编解码，
 * 两条路最后都走 measureImage()，判据只写一份。
 *
 * 另一件事：把图片四边 3% 的边带归一成本页纸色并羽化。生图模型给的白底
 * 与会话纸色永远差一口气，直接贴上就是一块「贴纸」；归一之后图自己化进纸里。
 */
import { bytesToDataUrl, dataUrlToBytes, decodePng, encodePng, isPng, type RgbaImage } from './watermark'

export interface ArtNumbers {
  /** 主体包围盒占画面宽 / 高的比例 */
  subjectW: number
  subjectH: number
  /** 主体包围盒面积占画面的比例（>0.55 时第二遍必须把条目降到 1–2 条） */
  subjectArea: number
  /** 四个象限里「纸色像素」的占比（越大越空） */
  quad: { tl: number; tr: number; bl: number; br: number }
  /** 非纸色像素比（有画多少东西） */
  ink: number
  /** 边缘密度（强梯度像素占比） */
  edge: number
  /** 带字判据的原始值：320×32 窗口里最多挤了多少个「中性字色」像素（阈值 1500 判带字） */
  glyph: number
  /** 带字风险：命中就在同一条 brief 上重投一次，再命中就这一页不画 */
  textRisk: boolean
  /** 实测更空的那半边：第二遍的文字优先落这里 */
  empty: 'left' | 'right'
}

/** 边带归一的宽度与羽化（§二：四边 3% 羽化） */
export const EDGE_BAND = 0.03
export const EDGE_FEATHER = 0.03

/** 「是不是纸色」的 RGB 欧氏距离阈值：水彩纸的脏点也在这之内 */
const PAPER_TOL = 26
/** 强梯度阈值（luma 差，0–255） */
const EDGE_STEP = 26
/**
 * 判带字："中性深色小笔画"在 320×32 窗口里的最多像素数。
 * 为什么不是纯边缘密度：水彩的铅笔线本身就很密（实测 6 张真图边缘密度 0.034–0.107），
 * 拿密度当判据会把好图全判废。字与画的分界在另外两件事上：
 *   ① 字是中性色（黑 / 灰），我们的画风要求"never pure black"，暗部都带颜色；
 *   ② 字是小块里挤满短笔画，四十来字的一行在这个窗口里能到 3000 上下，
 *      而实测最密的插画（深色头发 + 描线）只有 968。阈值取 1500，两边都留余量。
 */
const GLYPH_DARK = 70
/** 深纸上的字是亮的：判据方向反过来（浅底暗字 → 暗底亮字） */
const GLYPH_BRIGHT = 200
const GLYPH_CHROMA = 18
const GLYPH_W = 320
const GLYPH_H = 32
const GLYPH_RISK = 1500

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function chroma(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx === 0 ? 0 : ((mx - mn) / mx) * 100
}

function paperRgb(img: RgbaImage): [number, number, number] {
  // 四条 3% 边带的中位色：边带一定是纸（画的主体不让贴边）
  const band = Math.max(2, Math.round(Math.min(img.width, img.height) * EDGE_BAND))
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const push = (x: number, y: number) => {
    const i = (y * img.width + x) * 4
    rs.push(img.pixels[i])
    gs.push(img.pixels[i + 1])
    bs.push(img.pixels[i + 2])
  }
  for (let y = 0; y < img.height; y++) {
    for (let d = 0; d < band; d++) {
      push(d, y)
      push(img.width - 1 - d, y)
    }
  }
  for (let x = 0; x < img.width; x++) {
    for (let d = 0; d < band; d++) {
      push(x, d)
      push(x, img.height - 1 - d)
    }
  }
  const mid = (arr: number[]) => {
    const sorted = arr.slice().sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 255
  }
  return [mid(rs), mid(gs), mid(bs)]
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function isPaperAt(img: RgbaImage, x: number, y: number, paper: [number, number, number]): boolean {
  const i = (y * img.width + x) * 4
  const dr = img.pixels[i] - paper[0]
  const dg = img.pixels[i + 1] - paper[1]
  const db = img.pixels[i + 2] - paper[2]
  return Math.sqrt(dr * dr + dg * dg + db * db) <= PAPER_TOL
}

/**
 * 从像素算四个数。paperHex 传这一页的纸色（主题纸），不传就取边带中位色。
 * 判带字用的是「小块边缘密度」：字是一小块里挤满短笔画，水彩是一大片缓变化。
 */
export function measureImage(img: RgbaImage, paperHex?: string): ArtNumbers {
  const paper = parseHex(paperHex ?? '') ?? paperRgb(img)
  const paperLuma = luma(paper[0], paper[1], paper[2])
  let ink = 0
  let edge = 0
  let minX = img.width
  let minY = img.height
  let maxX = -1
  let maxY = -1
  const quad = { tl: 0, tr: 0, bl: 0, br: 0 }
  const quadAll = { tl: 0, tr: 0, bl: 0, br: 0 }

  const lum = new Float32Array(img.width * img.height)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      lum[y * img.width + x] = luma(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2])
    }
  }
  // 字形掩码（中性、且与纸拉开一截的像素）：整图积分图，最后取最密的 320×32 窗口。
  // 深纸（投影那套纸、夜墨）上字是亮的，判据必须跟着翻——
  // 否则会把字判成背景、把背景判成字，整页图就废了（TASKS/12 §六④）。
  const inverted = paperLuma < 128
  const mark = new Uint8Array(img.width * img.height)
  const integral = new Float64Array((img.width + 1) * (img.height + 1))
  for (let y = 0; y < img.height; y++) {
    let rowSum = 0
    for (let x = 0; x < img.width; x++) {
      const p = y * img.width + x
      const i = p * 4
      const r = img.pixels[i]
      const g = img.pixels[i + 1]
      const b = img.pixels[i + 2]
      const glyphPx = inverted
        ? lum[p] > GLYPH_BRIGHT && chroma(r, g, b) < GLYPH_CHROMA && lum[p] - paperLuma > 90
        : lum[p] < GLYPH_DARK && chroma(r, g, b) < GLYPH_CHROMA && paperLuma - lum[p] > 90
      if (glyphPx) mark[p] = 1
      rowSum += mark[p]
      integral[(y + 1) * (img.width + 1) + (x + 1)] = integral[y * (img.width + 1) + (x + 1)] + rowSum
    }
  }
  const boxSum = (x0: number, y0: number, w: number, h: number): number => {
    const x1 = Math.min(img.width, x0 + w)
    const y1 = Math.min(img.height, y0 + h)
    const a = integral[y0 * (img.width + 1) + x0]
    const b = integral[y0 * (img.width + 1) + x1]
    const c = integral[y1 * (img.width + 1) + x0]
    const d = integral[y1 * (img.width + 1) + x1]
    return d - b - c + a
  }
  let glyphMax = 0
  for (let y = 0; y + GLYPH_H <= img.height; y += 8) {
    for (let x = 0; x + GLYPH_W <= img.width; x += 32) {
      const n = boxSum(x, y, GLYPH_W, GLYPH_H)
      if (n > glyphMax) glyphMax = n
    }
  }

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const q = (y < img.height / 2 ? (x < img.width / 2 ? 'tl' : 'tr') : x < img.width / 2 ? 'bl' : 'br') as
        | 'tl'
        | 'tr'
        | 'bl'
        | 'br'
      quadAll[q] += 1
      const paperPx = isPaperAt(img, x, y, paper)
      if (paperPx) {
        quad[q] += 1
        continue
      }
      ink += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y

      // 强梯度：与右邻 / 下邻的 luma 差，任一超过阈值就算一条边
      const here = lum[y * img.width + x]
      const right = x + 1 < img.width ? lum[y * img.width + x + 1] : here
      const down = y + 1 < img.height ? lum[(y + 1) * img.width + x] : here
      if (Math.abs(here - right) >= EDGE_STEP || Math.abs(here - down) >= EDGE_STEP) edge += 1
    }
  }

  const total = img.width * img.height
  const bw = maxX >= minX ? maxX - minX + 1 : 0
  const bh = maxY >= minY ? maxY - minY + 1 : 0

  const emptyOf = (l: number, r: number): 'left' | 'right' => (l >= r ? 'left' : 'right')
  const leftEmpty = (quad.tl / Math.max(1, quadAll.tl) + quad.bl / Math.max(1, quadAll.bl)) / 2
  const rightEmpty = (quad.tr / Math.max(1, quadAll.tr) + quad.br / Math.max(1, quadAll.br)) / 2

  return {
    subjectW: bw / img.width,
    subjectH: bh / img.height,
    subjectArea: (bw * bh) / total,
    quad: {
      tl: quad.tl / Math.max(1, quadAll.tl),
      tr: quad.tr / Math.max(1, quadAll.tr),
      bl: quad.bl / Math.max(1, quadAll.bl),
      br: quad.br / Math.max(1, quadAll.br),
    },
    ink: ink / total,
    edge: edge / total,
    glyph: glyphMax,
    textRisk: glyphMax >= GLYPH_RISK,
    empty: emptyOf(leftEmpty, rightEmpty),
  }
}

/** 读图：浏览器走 canvas，Node 走自带 PNG 编解码；两条路交出同一种 RgbaImage */
async function readImage(dataUrl: string): Promise<RgbaImage | null> {
  const canvas = makeCanvas()
  if (canvas) {
    /* canvas 这条路任何一步失败都不许直接判死：退回纯 JS 解码（2026-11-23 真机
       Safari 学生版 0 图——服务器 6 张全交付，浏览器收尾时读图失败把图全扔了）。
       两条路读的是同一张 PNG，像素一致，量出来的数也一致。 */
    try {
      const img = await loadImage(dataUrl)
      if (img) {
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
          return { width: canvas.width, height: canvas.height, pixels: new Uint8Array(data.data.buffer.slice(0)) }
        }
      }
    } catch {
      // 落到下面纯 JS 解码
    }
  }
  const bytes = dataUrlToBytes(dataUrl)
  if (!bytes || !isPng(bytes)) return null
  return decodePng(bytes)
}

/** 写图：与 readImage 对称 */
async function writeImage(img: RgbaImage): Promise<string> {
  const canvas = makeCanvas()
  if (canvas) {
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const data = ctx.createImageData(img.width, img.height)
      data.data.set(img.pixels)
      ctx.putImageData(data, 0, 0)
      return canvas.toDataURL('image/png')
    }
  }
  return bytesToDataUrl(await encodePng(img))
}

type AnyCanvas = {
  width: number
  height: number
  getContext: (id: '2d') => {
    drawImage: (img: unknown, x: number, y: number) => void
    getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray }
    createImageData: (w: number, h: number) => { data: Uint8ClampedArray }
    putImageData: (d: unknown, x: number, y: number) => void
  } | null
  toDataURL: (type?: string) => string
} | null

function makeCanvas(): AnyCanvas {
  if (typeof document === 'undefined') return null
  try {
    return document.createElement('canvas') as unknown as AnyCanvas
  } catch {
    return null
  }
}

async function loadImage(dataUrl: string): Promise<(HTMLImageElement & { width: number }) | null> {
  if (typeof Image === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/**
 * 水平镜像一张图。用在「相邻两页留白撞在同一边」时：
 * 不删页、不重画（重画要再花一次钱且人像未必更好），把图翻一下，空的那半边就换过来了。
 * 画里没有字（带字的已经判废），所以翻面不会出现反字。
 */
export async function mirrorArt(dataUrl: string): Promise<string> {
  const img = await readImage(dataUrl)
  if (!img) return dataUrl
  const row = img.width * 4
  const line = new Uint8Array(row)
  for (let y = 0; y < img.height; y++) {
    const at = y * row
    line.set(img.pixels.subarray(at, at + row))
    for (let x = 0; x < img.width; x++) {
      const from = (img.width - 1 - x) * 4
      const to = at + x * 4
      img.pixels[to] = line[from]
      img.pixels[to + 1] = line[from + 1]
      img.pixels[to + 2] = line[from + 2]
      img.pixels[to + 3] = line[from + 3]
    }
  }
  return writeImage(img)
}

/** 量一张 dataURL 图片，失败返回 null（调用方按「这页不画」处理） */
export async function measureArt(dataUrl: string, paperHex?: string): Promise<ArtNumbers | null> {
  const img = await readImage(dataUrl)
  return img ? measureImage(img, paperHex) : null
}

/**
 * 四边归一：把 3% 边带混向纸色，并留 3% 羽化。
 * 不裁切、不盖白块——只把「贴纸边」化掉，画面本身一个像素不动（内侧 alpha=0）。
 */
export async function normalizeArt(dataUrl: string, paperHex: string): Promise<string> {
  const img = await readImage(dataUrl)
  const paper = parseHex(paperHex)
  if (!img || !paper) return dataUrl
  const bw = Math.max(1, Math.round(img.width * EDGE_BAND))
  const bh = Math.max(1, Math.round(img.height * EDGE_BAND))
  const fw = Math.max(1, Math.round(img.width * EDGE_FEATHER))
  const fh = Math.max(1, Math.round(img.height * EDGE_FEATHER))

  const weight = (d: number, band: number, feather: number): number => {
    if (d >= band + feather) return 0
    if (d < band) return 1
    return 1 - (d - band) / feather
  }

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const w = Math.max(
        weight(x, bw, fw),
        weight(img.width - 1 - x, bw, fw),
        weight(y, bh, fh),
        weight(img.height - 1 - y, bh, fh)
      )
      if (w <= 0) continue
      const i = (y * img.width + x) * 4
      img.pixels[i] = Math.round(img.pixels[i] * (1 - w) + paper[0] * w)
      img.pixels[i + 1] = Math.round(img.pixels[i + 1] * (1 - w) + paper[1] * w)
      img.pixels[i + 2] = Math.round(img.pixels[i + 2] * (1 - w) + paper[2] * w)
      img.pixels[i + 3] = 255
    }
  }
  return writeImage(img)
}