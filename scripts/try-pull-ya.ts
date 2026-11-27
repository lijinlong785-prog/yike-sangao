/**
 * 一次性验证：真机《狼牙山五壮士》31 页 → 过 withPulls → 渲染对照图。
 *
 * 目的只有一件：让用户看见「无图页的空色块」到底被引文块填成了什么样，
 * 以及还剩几页填不上。不进门禁（门禁要绝对，这个只为看图）。
 *
 * 跑法：npx esbuild ... && node scripts/.try-pull-ya.mjs
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { findText } from '../src/data/texts'
import { place, type Placed } from '../src/lib/deck2/place'
import { FAMILY_REPS, TEMPLATES, type DeckTheme, type FontKey } from '../src/lib/deck2/theme'
import { withPulls, type StudentSlide } from '../src/lib/slides'
import type { LessonPlan } from '../src/types'

const SRC = '/tmp/yalang/slides.json'
const OUT = '/tmp/yike-pull'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const slides: StudentSlide[] = Array.isArray(raw) ? raw : raw.slides
const text = (findText('狼牙山五壮士')?.quotes ?? []).join('\n')
const plan = { meta: { topic: '狼牙山五壮士', text } } as unknown as LessonPlan

const before = slides
const after = withPulls(slides, plan)
const got = after.filter((s) => s.pull)
console.log(`31 页 · 有图 ${slides.filter((s) => s.illustration).length} 页 · 引文块 ${got.length} 页`)
after.forEach((s, i) => {
  if (s.pull) console.log(`  p${String(i + 1).padStart(2)} [${s.kind}]「${s.pull}」`)
})
const bare = after.filter(
  (s) =>
    !s.pull &&
    !s.illustration &&
    ['hook', 'words', 'close-read', 'drill', 'compare', 'goals', 'board', 'homework', 'end'].includes(s.kind)
)
console.log(`仍空着的页 ${bare.length}：${bare.map((s) => `${s.kind}「${s.title}」`).join('、')}`)

/* ------------------------------- 渲染成 SVG ------------------------------- */
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
  const body: string[] = [`<rect width="${W}" height="${H}" fill="${tpl.paper}"/>`]
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
    if (p.kind === 'image' || !p.text) continue
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${tpl.paper}"/>${body.join('')}</svg>`
}

const tpl = TEMPLATES[FAMILY_REPS.lindi]
const { Resvg } = await import('@resvg/resvg-js')
const rows: { i: number; before: string; after: string; pull: string }[] = []

for (let i = 0; i < after.length; i++) {
  if (!after[i].pull) continue
  const b = `${OUT}/p${String(i + 1).padStart(2, '0')}-before.png`
  const a = `${OUT}/p${String(i + 1).padStart(2, '0')}-after.png`
  fs.writeFileSync(b, new Resvg(svgOf(place(before[i], tpl), tpl), { fitTo: { mode: 'width', value: 1280 } }).render().asPng())
  fs.writeFileSync(a, new Resvg(svgOf(place(after[i], tpl), tpl), { fitTo: { mode: 'width', value: 1280 } }).render().asPng())
  rows.push({ i: i + 1, before: b, after: a, pull: after[i].pull ?? '' })
}

fs.writeFileSync(`${OUT}/list.json`, JSON.stringify(rows, null, 2))
if (rows.length) {
  const py = `
from PIL import Image, ImageDraw
import json
rows = json.load(open('${OUT}/list.json'))
W, H = 1280, 720
sheet = Image.new('RGB', (W * 2, (H + 46) * len(rows)), '#ffffff')
d = ImageDraw.Draw(sheet)
for k, r in enumerate(rows):
    y = k * (H + 46)
    sheet.paste(Image.open(r['before']).convert('RGB').resize((W, H)), (0, y + 46))
    sheet.paste(Image.open(r['after']).convert('RGB').resize((W, H)), (W, y + 46))
    d.text((12, y + 14), f"p{r['i']} 之前（空色块）", fill='#b03030')
    d.text((W + 12, y + 14), f"p{r['i']} 之后（引文块）：{r['pull'][:34]}", fill='#204a2c')
sheet.resize((W, (H + 46) * len(rows) // 2)).save('${OUT}/sheet.png')
print('sheet ->', '${OUT}/sheet.png', sheet.size)
`
  fs.writeFileSync(`${OUT}/sheet.py`, py)
  execFileSync('python3', [`${OUT}/sheet.py`], { stdio: 'inherit' })
}
