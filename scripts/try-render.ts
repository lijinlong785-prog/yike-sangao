/**
 * 一次性：把 /tmp/yalang7 的每一页按 place() 渲染成 PNG，看清「大方块」到底长什么样。
 * 不进门禁。
 */
import fs from 'node:fs'
import { place, type Placed } from '../src/lib/deck2/place'
import { FAMILY_REPS, TEMPLATES, type DeckTheme, type FontKey } from '../src/lib/deck2/theme'
import type { StudentSlide } from '../src/lib/slides'

const SRC = process.env.SRC || '/tmp/yalang7/slides.json'
const OUT = process.env.OUT || '/tmp/yike-look'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const slides: StudentSlide[] = Array.isArray(raw) ? raw : raw.slides

const CSS_FONT: Record<FontKey, string> = {
  song: 'Songti SC, SimSun, serif',
  kai: 'Kaiti SC, KaiTi, serif',
  hei: 'PingFang SC, Hiragino Sans GB, sans-serif',
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wrapTo(text: string, width: number, px: number): string[] {
  const limit = Math.max(px, width - px * 0.2)
  const out: string[] = []
  for (const rawLine of text.split('\n')) {
    let buf = ''
    let used = 0
    for (const ch of Array.from(rawLine)) {
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

function svgOf(placed: readonly Placed[], tpl: DeckTheme): string {
  const W = 1280
  const H = 720
  const body: string[] = []
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
    if (p.kind === 'rect' || p.kind === 'line') {
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 1).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'ellipse') {
      body.push(
        `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'image') {
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#cfd8d2"/>`,
        `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2).toFixed(1)}" font-family="sans-serif" font-size="22" fill="#5a6b60" text-anchor="middle">[插画]</text>`
      )
      continue
    }
    if (!p.text) continue
    const px = ((p.size ?? 18) * 4) / 3
    const list = wrapTo(p.text, w, px)
    const lineH = px * (p.lineHeight ?? 1.3)
    const blockH = list.length * lineH
    const top = p.valign === 'middle' ? y + (h - blockH) / 2 : y
    const anchor = p.align === 'right' ? 'end' : p.align === 'center' ? 'middle' : 'start'
    const tx = p.align === 'right' ? x + w : p.align === 'center' ? x + w / 2 : x
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(top + lineH * i + px * 0.78).toFixed(1)}" font-family="${CSS_FONT[p.font ?? tpl.fontBody]}" font-size="${px.toFixed(1)}" fill="${p.color ?? tpl.ink}" text-anchor="${anchor}">${esc(line)}</text>`
      )
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${tpl.paper}"/>${body.join('')}</svg>`
}

const tpl = TEMPLATES[FAMILY_REPS.lindi]
const { Resvg } = await import('@resvg/resvg-js')

for (let i = 0; i < slides.length; i++) {
  const s = slides[i]
  const svg = svgOf(place(s, tpl), tpl)
  const p = `${OUT}/p${String(i + 1).padStart(2, '0')}.png`
  fs.writeFileSync(p, new Resvg(svg, { fitTo: { mode: 'width', value: 1280 } }).render().asPng())
  console.log(
    `p${String(i + 1).padStart(2, '0')} [${s.kind}] ${(s.title ?? '').slice(0, 18)} | 图 ${s.illustration ? '有' : '无'} | pull ${s.pull ? '有' : '无'}`
  )
}
console.log('->', OUT)
