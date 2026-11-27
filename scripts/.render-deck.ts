/**
 * 把一份 slides.json 按真实版式渲成 PNG（用完即删的临时脚本）。
 * 位置、字号、插画框与 place() 完全一致，所以图里长什么样，pptx 里就是什么样。
 *
 * 跑法：npx esbuild --bundle --format=esm --platform=node --packages=external \
 *   --outfile=scripts/.render-deck.mjs scripts/.render-deck.ts && node scripts/.render-deck.mjs /tmp/yalang
 */
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const DIR = process.argv[2] || '/tmp/yalang'
const OUT = path.join(DIR, 'png')
fs.mkdirSync(OUT, { recursive: true })

const { place } = await import('../src/lib/deck2/place')
const { templateOf, defaultTemplateId } = await import('../src/lib/deck2/theme')
const { FOOT_SLOT } = await import('../src/lib/deck2/place')

type AnyRecord = Record<string, unknown>
const slides = JSON.parse(fs.readFileSync(path.join(DIR, 'slides.json'), 'utf8')) as AnyRecord[]
const subject = String((slides[0] as AnyRecord)?.subject ?? '语文')
const tid = defaultTemplateId(subject, '狼牙山五壮士', '第一课时')
const tpl = templateOf(tid)
console.log(`模板 ${tpl.name}（${tid}）· ${slides.length} 页`)

const W = 1280
const H = 720

const FONT: Record<string, string> = {
  song: 'Songti SC, Noto Serif CJK SC, serif',
  kai: 'Kaiti SC, STKaiti, serif',
  hei: 'PingFang SC, Noto Sans CJK SC, sans-serif',
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 中文按宽度折行：一个汉字算 1em，ASCII 算 0.55em（粗估够看版式） */
function wrapTo(text: string, widthPx: number, sizePx: number): string[] {
  const out: string[] = []
  for (const para of String(text ?? '').split('\n')) {
    let line = ''
    let w = 0
    for (const ch of [...para]) {
      const cw = /[\x00-\x7F]/.test(ch) ? sizePx * 0.55 : sizePx
      if (w + cw > widthPx && line) {
        out.push(line)
        line = ch
        w = cw
      } else {
        line += ch
        w += cw
      }
    }
    out.push(line)
  }
  return out
}

function svgOf(placed: ReturnType<typeof place>, title: string): string {
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${tpl.paper}"/>`]
  for (const p of placed) {
    const x = p.x * W
    const y = p.y * H
    const w = p.w * W
    const h = p.h * H
    if (p.kind === 'image') {
      if (p.data) {
        body.push(
          `<image x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" href="${p.data}"/>`
        )
      }
      continue
    }
    if (p.kind === 'rect' || p.kind === 'line') {
      body.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, p.kind === 'line' ? 1 : 0).toFixed(1)}" height="${Math.max(h, p.kind === 'line' ? 1 : 0).toFixed(1)}"${(p.radius ?? 0) > 0 ? ` rx="${((p.radius ?? 0) * 4 / 3).toFixed(1)}"` : ''} fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (p.kind === 'ellipse') {
      body.push(
        `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${p.fill ?? tpl.surface}" opacity="${p.opacity ?? 1}"/>`
      )
      continue
    }
    if (!p.text) continue
    const pt = p.size ?? 18
    const px = (pt * 4) / 3
    const list = wrapTo(p.text, w, px)
    const lineH = px * (p.lineHeight ?? 1.3)
    const blockH = list.length * lineH
    const top = p.valign === 'middle' ? y + (h - blockH) / 2 : y
    const anchor = p.align === 'right' ? 'end' : p.align === 'center' ? 'middle' : 'start'
    const tx = p.align === 'right' ? x + w : p.align === 'center' ? x + w / 2 : x
    list.forEach((line, i) => {
      body.push(
        `<text x="${tx.toFixed(1)}" y="${(top + lineH * i + px * 0.78).toFixed(1)}" font-family="${FONT[p.font ?? tpl.fontBody] ?? FONT.hei}" font-size="${px.toFixed(1)}"${p.bold ? ' font-weight="600"' : ''} fill="${p.color ?? tpl.ink}" text-anchor="${anchor}">${esc(line)}</text>`
      )
    })
  }
  body.push(
    `<text x="${(FOOT_SLOT.left.x * W).toFixed(0)}" y="${((FOOT_SLOT.left.y + 0.028) * H).toFixed(0)}" font-family="PingFang SC, sans-serif" font-size="12" fill="${tpl.muted}">${esc(title)}</text>`
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body.join('')}</svg>`
}

let n = 0
for (const slide of slides) {
  n += 1
  const placed = place(slide as never, tpl as never)
  const svg = svgOf(placed, `《狼牙山五壮士》${tpl.name}`)
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: true, defaultFontFamily: 'Songti SC' },
  })
  const file = path.join(OUT, `p${String(n).padStart(2, '0')}.png`)
  fs.writeFileSync(file, r.render().asPng())
}
console.log(`✓ ${n} 张 → ${OUT}`)
