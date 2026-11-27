/* 临时设计稿（第三轮）：数学《长方体的认识》换底板 —— 从黑板深绿换成淡天蓝。
 * 内容一个字没改，只换「底板」（纸色/强调色/字体/卡片形态/装饰），用来验证同一课换底板
 * 整套会变样，而不是换个颜色还留着一身黑板的骨。
 * 跑完即删。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const W = 1280
const H = 720
const OUT = 'screenshots/styles'

/** 淡天蓝 · 数学底：白里透蓝的纸 + 中蓝做线与强调 + 暖橙只给数字与答案 */
const P = {
  paper: '#F5FAFE',
  surface: '#E6F1FB',
  soft: '#DCEAF7',
  ink: '#1B2A38',
  muted: '#6E869C',
  accent: '#2C7FB8',
  warm: '#D98A2B',
  line: '#C6DCEF',
}
const FONT = 'PingFang SC, Hiragino Sans GB, sans-serif'
const RADIUS = 10

type Node = {
  kind: 'rect' | 'text' | 'path'
  x: number
  y: number
  w: number
  h: number
  text?: string
  size?: number
  color?: string
  fill?: string
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  lineHeight?: number
  opacity?: number
  path?: string
  stroke?: string
  strokeWidth?: number
  radius?: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wrapTo(text: string, width: number, px: number): string[] {
  const limit = Math.max(px, width - px * 0.2)
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let buf = ''
    let used = 0
    for (const ch of raw) {
      const cw = /[\u3400-\u4DBF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? px : px * 0.55
      if (used + cw > limit && buf) {
        out.push(buf)
        buf = ''
        used = 0
      }
      buf += ch
      used += cw
    }
    out.push(buf)
  }
  return out
}

function svgOf(placed: readonly Node[]): string {
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${P.paper}"/>`]
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
    if (p.kind === 'path' && p.path) {
      body.push(
        `<path d="${p.path}" fill="none" stroke="${p.stroke ?? P.line}" stroke-width="${p.strokeWidth ?? 2.4}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'rect') {
      const r = p.radius ?? (w > 40 ? RADIUS : 0)
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="${r}" fill="${p.fill ?? P.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (!p.text) continue
    const pt = p.size ?? 18
    const px = (pt * 4) / 3
    const list = wrapTo(p.text, w, px)
    const lineH = px * (p.lineHeight ?? 1.3)
    const blockH = list.length * lineH
    const top = p.h > 0 && blockH < h && p.align === 'center' ? y : y
    const anchor = p.align === 'right' ? 'end' : p.align === 'center' ? 'middle' : 'start'
    const tx = p.align === 'right' ? x + w : p.align === 'center' ? x + w / 2 : x
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(top + lineH * i + px * 0.78).toFixed(1)}" font-family="${FONT}" font-size="${px.toFixed(1)}"${p.bold ? ' font-weight="bold"' : ''} fill="${p.color ?? P.ink}" text-anchor="${anchor}">${esc(line)}</text>`
      )
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body.join('')}</svg>`
}

/* ------------------------------ 共用件 ------------------------------ */

/** 页头：小标签 + 大标题 + 一条蓝线 + 一条更淡的线（同母版，换底板也认得出来） */
function head(label: string, title: string): Node[] {
  return [
    { kind: 'text', x: 0.06, y: 0.055, w: 0.5, h: 0.04, text: label, size: 15, color: P.accent, bold: true },
    { kind: 'text', x: 0.06, y: 0.095, w: 0.84, h: 0.07, text: title, size: 34, color: P.ink, bold: true },
    { kind: 'rect', x: 0.06, y: 0.178, w: 0.88, h: 0.0035, fill: P.accent, opacity: 0.85 },
    { kind: 'rect', x: 0.06, y: 0.1875, w: 0.88, h: 0.0015, fill: P.line },
  ]
}

function foot(no: number): Node[] {
  return [
    { kind: 'text', x: 0.06, y: 0.925, w: 0.6, h: 0.04, text: '长方体的认识', size: 11, color: P.muted },
    { kind: 'text', x: 0.86, y: 0.925, w: 0.08, h: 0.04, text: `${no} / 10`, size: 11, color: P.muted, align: 'right' },
  ]
}

/** 真 2.5D 长方体：三条 path 轮廓，斜边走真斜线 */
function cuboid(x: number, y: number, w: number, h: number, d: number, color: string, label?: string[]): Node[] {
  const X = x * W
  const B = (y + h) * H
  const WW = w * W
  const HH = h * H
  const DD = d * W
  const DY = DD * 0.62
  const ln = (s: string): Node => ({ kind: 'path', x: 0, y: 0, w: 0, h: 0, path: s, stroke: color, strokeWidth: 2.6 })
  const out: Node[] = [
    ln(`M ${X} ${B - HH} h ${WW} v ${HH} h ${-WW} Z`),
    ln(`M ${X} ${B - HH} l ${DD} ${-DY} h ${WW} l ${-DD} ${DY}`),
    ln(`M ${X + WW} ${B - HH} l ${DD} ${-DY} v ${HH} l ${-DD} ${DY}`),
  ]
  if (label) {
    out.push({ kind: 'text', x: x + (w - 0.16) / 2, y: y + h + 0.014, w: 0.16, h: 0.035, text: label[0], size: 15, color: P.muted, align: 'center' })
    out.push({ kind: 'text', x: x + w + 0.02, y: y + h / 2 - 0.02, w: 0.12, h: 0.035, text: label[1], size: 15, color: P.muted })
    out.push({ kind: 'text', x: x + w * 0.55 + d * 0.5, y: y - d * 0.62 - 0.075, w: 0.12, h: 0.035, text: label[2], size: 15, color: P.muted })
  }
  return out
}

/* ------------------------------ 五页 ------------------------------ */

/** 1 · 封面：白里透蓝的纸，右侧一个线框长方体当题图，不铺满、不喧哗 */
function cover(): Node[] {
  return [
    // 右侧淡蓝色块：像练习册封面的色带，只占三分之一
    { kind: 'rect', x: 0.68, y: 0, w: 0.32, h: 1, fill: P.soft, opacity: 0.75 },
    { kind: 'text', x: 0.09, y: 0.22, w: 0.55, h: 0.04, text: '人教版 · 五年级下册 · 第三单元', size: 16, color: P.muted },
    { kind: 'text', x: 0.09, y: 0.29, w: 0.58, h: 0.14, text: '长方体的认识', size: 60, color: P.ink, bold: true },
    { kind: 'rect', x: 0.09, y: 0.45, w: 0.08, h: 0.008, fill: P.accent, radius: 4 },
    { kind: 'text', x: 0.09, y: 0.49, w: 0.58, h: 0.05, text: '6 个面 · 12 条棱 · 8 个顶点', size: 25, color: P.accent },
    { kind: 'text', x: 0.09, y: 0.58, w: 0.5, h: 0.05, text: '五年级　　班', size: 18, color: P.muted },
    { kind: 'text', x: 0.09, y: 0.68, w: 0.5, h: 0.05, text: '今天先数一数，再算一算', size: 17, color: P.muted },
    ...cuboid(0.71, 0.56, 0.16, 0.2, 0.07, P.accent),
    ...foot(1),
  ]
}

/** 2 · 先看看：三个大小不同的线框，一页只问一句 */
function hook(): Node[] {
  return [
    ...head('一、先看看', '生活里，哪些东西是长方体？'),
    ...cuboid(0.08, 0.34, 0.15, 0.24, 0.06, P.accent),
    ...cuboid(0.36, 0.4, 0.2, 0.18, 0.075, P.muted),
    ...cuboid(0.68, 0.32, 0.13, 0.28, 0.055, P.accent),
    { kind: 'rect', x: 0.06, y: 0.74, w: 0.88, h: 0.09, fill: P.surface, radius: RADIUS },
    { kind: 'text', x: 0.09, y: 0.76, w: 0.82, h: 0.05, text: '问：它们的形状，有什么共同的地方？', size: 24, color: P.accent, bold: true },
    ...foot(2),
  ]
}

/** 3 · 数一数：大线框 + 三行数字，数字用暖橙，一眼看到答案 */
function count(): Node[] {
  const rows: [string, string][] = [
    ['面', '6 个'],
    ['棱', '12 条'],
    ['顶点', '8 个'],
  ]
  const out: Node[] = [...head('二、数一数', '面、棱、顶点，各有多少？'), ...cuboid(0.09, 0.34, 0.26, 0.3, 0.11, P.accent)]
  rows.forEach(([k, v], i) => {
    const y = 0.3 + i * 0.14
    out.push({ kind: 'text', x: 0.54, y, w: 0.14, h: 0.09, text: k, size: 34, color: P.muted })
    out.push({ kind: 'text', x: 0.68, y: y - 0.012, w: 0.28, h: 0.1, text: v, size: 46, color: P.warm, bold: true })
    if (i < rows.length - 1) out.push({ kind: 'rect', x: 0.54, y: y + 0.105, w: 0.4, h: 0.002, fill: P.line })
  })
  out.push({ kind: 'rect', x: 0.06, y: 0.76, w: 0.88, h: 0.09, fill: P.surface, radius: RADIUS })
  out.push({ kind: 'text', x: 0.09, y: 0.78, w: 0.84, h: 0.05, text: '摸一摸：面是平的，棱是边，顶点是尖的。', size: 18, color: P.ink })
  return [...out, ...foot(3)]
}

/** 4 · 试一试：图上标数据，右边四行算式，答案用暖橙压住 */
function example(): Node[] {
  const lines: [string, number, string][] = [
    ['棱长总和 =（长 + 宽 + 高）× 4', 22, P.ink],
    ['= （6 + 4 + 3）× 4', 26, P.ink],
    ['= 13 × 4', 26, P.ink],
    ['= 52（cm）', 32, P.warm],
  ]
  const out: Node[] = [
    ...head('三、试一试', '一个长方体，棱长总和是多少？'),
    { kind: 'rect', x: 0.06, y: 0.215, w: 0.88, h: 0.075, fill: P.surface, radius: RADIUS },
    { kind: 'text', x: 0.09, y: 0.228, w: 0.82, h: 0.05, text: '长 6 cm，宽 4 cm，高 3 cm。', size: 23, color: P.accent, bold: true },
    ...cuboid(0.08, 0.62, 0.26, 0.2, 0.09, P.accent, ['6 cm', '3 cm', '4 cm']),
  ]
  lines.forEach(([t, size, color], i) => {
    out.push({ kind: 'text', x: 0.48, y: 0.33 + i * 0.115, w: 0.46, h: 0.07, text: t, size, color, bold: color === P.warm })
  })
  out.push({ kind: 'text', x: 0.48, y: 0.79, w: 0.46, h: 0.04, text: '答：棱长总和是 52 cm。', size: 17, color: P.muted })
  return [...out, ...foot(4)]
}

/** 5 · 小结：三张横卡，每张一个词 + 一句话，最后一行压一句总结 */
function board(): Node[] {
  const rows: [string, string][] = [
    ['面', '6 个，相对的面完全相同'],
    ['棱', '12 条，相对的棱长度相等'],
    ['顶点', '8 个，三条棱交在一起'],
  ]
  const out: Node[] = [...head('四、小结', '记住这三行就够用')]
  rows.forEach(([k, v], i) => {
    const y = 0.24 + i * 0.16
    out.push({ kind: 'rect', x: 0.06, y, w: 0.88, h: 0.125, fill: P.surface, radius: RADIUS })
    out.push({ kind: 'text', x: 0.1, y: y + 0.028, w: 0.12, h: 0.08, text: k, size: 34, color: P.accent, bold: true })
    out.push({ kind: 'text', x: 0.26, y: y + 0.04, w: 0.64, h: 0.06, text: v, size: 24, color: P.ink })
  })
  out.push({ kind: 'text', x: 0.06, y: 0.76, w: 0.88, h: 0.06, text: '长方体的认识 = 面 · 棱 · 顶点', size: 27, color: P.warm, bold: true })
  return [...out, ...foot(10)]
}

/* ------------------------------ 出图 ------------------------------ */

mkdirSync(OUT, { recursive: true })
const jobs: [string, () => Node[]][] = [
  ['D-tianlan-1-cover', cover],
  ['D-tianlan-2-hook', hook],
  ['D-tianlan-3-count', count],
  ['D-tianlan-4-example', example],
  ['D-tianlan-5-board', board],
]
for (const [name, fn] of jobs) {
  const png = new Resvg(svgOf(fn()), { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng()
  writeFileSync(`${OUT}/${name}.png`, png)
}
console.log(`✓ ${jobs.length} 张淡天蓝 → ${OUT}`)
rmSync(fileURLToPath(import.meta.url), { force: true })