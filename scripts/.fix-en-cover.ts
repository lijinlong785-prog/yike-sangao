/* 临时补丁：只重画英语封面。原稿的四线三格伸出了右侧色块、Aa Bb 压在线上。
 * 跑完即删。
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const W = 1280
const H = 720

const PAPER = '#FFFDF8'
const SURFACE = '#F2F6EC'
const INK = '#2B3026'
const MUTED = '#7C8474'
const ACCENT = '#E07A5F'
const LINE = '#DDE5D4'

type Node = {
  kind: 'rect' | 'text'
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
}

const CSS_FONT = { hei: 'PingFang SC, Hiragino Sans GB, sans-serif' }
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
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${PAPER}"/>`]
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
    if (p.kind === 'rect') {
      const r = w > 40 ? 18 : 0
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="${r}" fill="${p.fill ?? SURFACE}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (!p.text) continue
    const pt = p.size ?? 18
    const px = (pt * 4) / 3
    const list = wrapTo(p.text, w, px)
    const lineH = px * (p.lineHeight ?? 1.3)
    const anchor = p.align === 'right' ? 'end' : p.align === 'center' ? 'middle' : 'start'
    const tx = p.align === 'right' ? x + w : p.align === 'center' ? x + w / 2 : x
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(y + lineH * i + px * 0.78).toFixed(1)}" font-family="${CSS_FONT.hei}" font-size="${px.toFixed(1)}"${p.bold ? ' font-weight="bold"' : ''} fill="${p.color ?? INK}" text-anchor="${anchor}">${esc(line)}</text>`
      )
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body.join('')}</svg>`
}

/* 四线三格的线与字都和右侧色块对齐：起点 x、宽度取自色块内缩后的范围 */
const CARD_X = 0.64
const CARD_W = 0.3
const RULE_X = CARD_X + 0.025
const RULE_W = CARD_W - 0.05
const RULES = [0.4, 0.45, 0.5, 0.55]

const page: Node[] = [
  { kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: SURFACE, opacity: 0.5 },
  { kind: 'rect', x: 0.06, y: 0.12, w: 0.54, h: 0.76, fill: PAPER },
  { kind: 'rect', x: 0.09, y: 0.26, w: 0.06, h: 0.012, fill: ACCENT },
  { kind: 'text', x: 0.09, y: 0.3, w: 0.48, h: 0.06, text: 'Unit 1 · Let’s learn', size: 20, color: MUTED },
  { kind: 'text', x: 0.09, y: 0.37, w: 0.48, h: 0.14, text: 'What’s he like?', size: 54, color: INK, bold: true },
  { kind: 'text', x: 0.09, y: 0.53, w: 0.48, h: 0.05, text: '小学英语 · 五年级上册', size: 21, color: INK },
  { kind: 'text', x: 0.09, y: 0.6, w: 0.48, h: 0.05, text: '五年级　　班', size: 18, color: MUTED },
  { kind: 'rect', x: 0.09, y: 0.68, w: 0.48, h: 0.09, fill: '#FBF1EC' },
  { kind: 'text', x: 0.11, y: 0.7, w: 0.44, h: 0.06, text: 'tall · kind · funny · shy …', size: 17, color: ACCENT },
  { kind: 'rect', x: CARD_X, y: 0.12, w: CARD_W, h: 0.76, fill: '#EAF0E2' },
  ...RULES.map((y, i) => ({
    kind: 'rect' as const,
    x: RULE_X,
    y,
    w: RULE_W,
    h: i === 1 || i === 2 ? 0.0018 : 0.0012,
    fill: LINE,
    opacity: 1,
  })),
  // Aa Bb 写在中间那一格里：基线压在第三条线上，不穿线
  { kind: 'text', x: RULE_X + 0.015, y: 0.442, w: 0.22, h: 0.05, text: 'Aa Bb', size: 22, color: '#9DB48B' },
  { kind: 'text', x: 0.06, y: 0.925, w: 0.6, h: 0.04, text: "Unit 1 What's he like?", size: 11, color: MUTED },
  { kind: 'text', x: 0.86, y: 0.925, w: 0.08, h: 0.04, text: '1 / 10', size: 11, color: MUTED, align: 'right' },
]

const svg = svgOf(page)
const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng()
writeFileSync('screenshots/styles/C-english-1-cover.png', png)
console.log('✓ C-english-1-cover.png 重画')
rmSync(fileURLToPath(import.meta.url), { force: true })