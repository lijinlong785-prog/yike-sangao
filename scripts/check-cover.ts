/**
 * TASKS/20b §三 的离线验收：满版封面。
 *
 * 五条判据（缺一条不算完成）+ 三件交付物：
 *   1. 有图时：封面必须有 image，且 w * h ≥ 0.95 * 页面面积（铺满，不留纸边）
 *   2. 无图时：封面不得只有纯色——标题 / 副题 / 短杠 / 线稿合计 ≥ 3 件
 *   3. 文字可读：纸色压底（.78）压在图上，标题块底色的 luma 差 ≥ 4.5:1
 *   4. 三种构图各渲一次：coverLayoutOf 选对了，且标题块与主体包围盒重叠面积 = 0
 *   5. 封面提示词：`no text, no letters, no characters` 在，banner|frame|title area 不在
 *
 * 交付物：/tmp/cover-score.png（三种构图横排）、/tmp/q20b.pptx、/tmp/cover-placed.txt
 *
 * 跑法：npm run check:cover
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { findText } from '../src/data/texts'
import { limitsFor } from '../src/lib/scale'
import { getBuiltinStudentSlides, type StudentSlide } from '../src/lib/slides'
import { skeletonPlan } from '../src/lib/skeleton'
import { downloadTemplatedPptx } from '../src/lib/pptx'
import { TEMPLATES, type DeckTheme as TemplateTheme } from '../src/lib/deck2/theme'
import {
  coverArchOf,
  coverLayoutOf,
  place,
  type CoverArch,
  type EmptyQuad,
  type Placed,
} from '../src/lib/deck2/place'
import { composePrompt, COVER_COMPOSITION } from '../src/lib/illustrate'
import { MOTIFS, motifOf, type MotifKey } from '../src/lib/motifs'
import { measureArt } from '../src/lib/inspect'
import { bytesToDataUrl, encodePng, type RgbaImage } from '../src/lib/watermark'
import { contrastRatio } from '../src/lib/scheme'
import type { LessonInput } from '../src/types'

const OUT = '/tmp'
const FAIL: string[] = []
const fail = (msg: string) => FAIL.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

/** 素课那张纸（封面吃同一个纸色，压底也是它） */
const PAPER: [number, number, number] = [0xfb, 0xf8, 0xf1]
const W = 1024
const H = 576

/** 在纸上画一块暖色主体（水彩的意思），位置用 0–1 的相对坐标给 */
function artWith(rect: { x0: number; y0: number; x1: number; y1: number }): RgbaImage {
  const pixels = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      pixels[i] = PAPER[0]
      pixels[i + 1] = PAPER[1]
      pixels[i + 2] = PAPER[2]
      pixels[i + 3] = 255
    }
  }
  const x0 = Math.round(W * rect.x0)
  const x1 = Math.round(W * rect.x1)
  const y0 = Math.round(H * rect.y0)
  const y1 = Math.round(H * rect.y1)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const edge = x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1
      const i = (y * W + x) * 4
      pixels[i] = edge ? 96 : 150
      pixels[i + 1] = edge ? 70 : 118
      pixels[i + 2] = edge ? 52 : 86
    }
  }
  return { width: W, height: H, pixels }
}

async function dataUrlOf(img: RgbaImage): Promise<string> {
  return bytesToDataUrl(await encodePng(img))
}

/** 这块主体的包围盒（0–1）：fixture 是我们自己画的，位置就是它 */
interface Fixture {
  name: string
  arch: CoverArch
  rect: { x0: number; y0: number; x1: number; y1: number }
}

const FIXTURES: Fixture[] = [
  { name: '左空', arch: 'left', rect: { x0: 0.62, y0: 0.18, x1: 0.95, y1: 0.82 } },
  { name: '下空', arch: 'bottom', rect: { x0: 0.1, y0: 0.05, x1: 0.9, y1: 0.55 } },
  { name: '右上空', arch: 'rightTop', rect: { x0: 0.08, y0: 0.45, x1: 0.55, y1: 0.95 } },
]

/** 两个块的重叠面积（0–1 相对纸面） */
function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return x * y
}

/** 一张图里「不是纸」的像素的尺寸包围盒（用来算标题块压没压到主体） */
function inkBox(img: RgbaImage): { x: number; y: number; w: number; h: number } {
  let minX = img.width
  let minY = img.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const d = Math.abs(img.pixels[i] - PAPER[0]) + Math.abs(img.pixels[i + 1] - PAPER[1]) + Math.abs(img.pixels[i + 2] - PAPER[2])
      if (d <= 30) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return {
    x: minX / img.width,
    y: minY / img.height,
    w: (maxX - minX + 1) / img.width,
    h: (maxY - minY + 1) / img.height,
  }
}

const hex = (c: [number, number, number]): string =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

const coverOf = (extra: Partial<StudentSlide>): StudentSlide => ({
  kind: 'cover',
  title: '桂花雨',
  line: '琦君',
  notes: '',
  ...extra,
})

const tpl: TemplateTheme = TEMPLATES.suke

/* ------------------------------ 1 · 铺满整页 ------------------------------ */

console.log('\n=== 1. 有图时：一张画铺满整页（w*h ≥ 0.95） ===')
const withArt = await dataUrlOf(artWith(FIXTURES[0].rect))
const nums = await measureArt(withArt, hex(PAPER))
if (!nums) fail('1 读不回 fixture：这张图本身就坏了')
const lay = coverLayoutOf(nums?.quad)

const coverPlaced = place(coverOf({ illustration: withArt, coverArch: lay.arch, coverScrim: lay.scrim }), tpl)
const img = coverPlaced.find((p) => p.kind === 'image')
if (!img) fail('1 封面页没有 image 元素（还是那张「纸上一块方图」）')
else {
  const area = img.w * img.h
  if (area < 0.95) fail(`1 封面图只占 ${(area * 100).toFixed(1)}%，要求 ≥ 95%`)
  else ok('1 一张画铺满整页', `image ${img.w}×${img.h} = ${(area * 100).toFixed(1)}% 版心，起点 (${img.x}, ${img.y})`)
}
if (img && (img.x !== 0 || img.y !== 0)) fail(`1 封面图的起点是 (${img.x}, ${img.y})，应贴到 (0, 0)`)

/* ------------------------- 2 · 无图兜底不许白卡 ------------------------- */

console.log('\n=== 2. 无图时：标题 / 副题 / 短杠 / 线稿合计 ≥ 3 件 ===')
const bare = place(coverOf({ coverArch: 'left' }), tpl)
if (bare.some((p) => p.kind === 'image')) fail('2 无图页却排了 image')
const strokes = bare.filter((p) => p.kind === 'line' && p.y < 0.9)
const texts = bare.filter((p) => p.kind === 'text')
const accent = bare.filter((p) => p.kind === 'rect' && p.fill === tpl.accent)
const parts = strokes.length + texts.length + accent.length
if (parts < 3) fail(`2 无图封面只有 ${parts} 件非背景元素，会是一张白卡`)
else
  ok(
    '2 无图也不是白卡',
    `${parts} 件：字 ${texts.length}（标题+副题）/ 短杠 ${accent.length} / 线稿 ${strokes.length} 笔`
  )
if (strokes.length < 5) fail(`2 线稿只有 ${strokes.length} 笔，兜底太薄`)
if (!strokes.every((s) => s.opacity === 0.28)) fail('2 线稿透明度不是 28%')
if (strokes.some((s) => s.fill === undefined || s.fill === '#000000')) fail('2 线稿用了黑色，会脏')

/* ------------------------------ 3 · 文字可读 ------------------------------ */

console.log('\n=== 3. 文字可读：压底之后标题块与字的 luma 对比 ≥ 4.5:1 ===')
const scrim = lay.scrim
/** 压底之后的合成色 = 纸 * alpha + 图（主体那块的平均色）* (1 - alpha) */
const blob: [number, number, number] = [118, 86, 52]
const mix: [number, number, number] = [
  PAPER[0] * scrim + blob[0] * (1 - scrim),
  PAPER[1] * scrim + blob[1] * (1 - scrim),
  PAPER[2] * scrim + blob[2] * (1 - scrim),
]
const ratio = contrastRatio(tpl.ink, hex(mix))
if (!(ratio >= 4.5)) fail(`3 标题压在图上只剩 ${ratio.toFixed(2)}:1，要求 ≥ 4.5:1（压底 ${scrim}）`)
else ok('3 字压得住', `压底 ${(scrim * 100).toFixed(0)}% 不透明 → 合成底 ${hex(mix)}，对比 ${ratio.toFixed(2)}:1`)
if (coverPlaced.some((p) => p.kind === 'rect' && p.opacity === 1 && p.fill !== tpl.accent))
  fail('3 压底是一层不透明蒙版（会把整页压成一块死色）')

/* --------------------------- 4 · 三种构图各渲一次 --------------------------- */

console.log('\n=== 4. 三种构图：选对了，且标题块与主体 0 重叠 ===')
interface Panel {
  item: Fixture
  img: RgbaImage
  got: ReturnType<typeof coverLayoutOf>
  box: { x: number; y: number; w: number; h: number }
  hit: number
  title: { x: number; y: number; w: number; h: number }
}
const panels: Panel[] = []
for (const item of FIXTURES) {
  const imgArt = artWith(item.rect)
  const url = await dataUrlOf(imgArt)
  const n = await measureArt(url, hex(PAPER))
  if (!n) {
    fail(`4 ${item.name}：fixture 读不回来`)
    continue
  }
  const got = coverLayoutOf(n.quad as EmptyQuad)
  if (got.arch !== item.arch) fail(`4 ${item.name}：应选 ${item.arch}，实得 ${got.arch}`)
  const placed = place(coverOf({ illustration: url, coverArch: got.arch, coverScrim: got.scrim }), tpl)
  const title = placed.find((p) => p.kind === 'text' && p.size === 46)
  if (!title) {
    fail(`4 ${item.name}：找不到 46pt 的标题块`)
    continue
  }
  const box = inkBox(imgArt)
  const hit = overlap(title, box)
  if (hit > 0) fail(`4 ${item.name}：标题块与主体重叠 ${(hit * 100).toFixed(2)}%，要求 0`)
  panels.push({ item, img: imgArt, got, box, hit, title })
  ok(
    `4 ${item.name}`,
    `量到 quad(tl=${n.quad.tl.toFixed(2)} tr=${n.quad.tr.toFixed(2)} bl=${n.quad.bl.toFixed(2)} br=${n.quad.br.toFixed(2)}) → ${got.arch}，标题在 x=${title.x} y=${title.y}，重叠 ${(hit * 100).toFixed(2)}%`
  )
}

/* ------------------------------ 5 · 提示词 ------------------------------ */

console.log('\n=== 5. 封面提示词：一定有一整块空着，且不许招来边框 ===')
const BRIEF = 'a woman under an osmanthus tree, petals falling'
for (const arch of ['left', 'bottom', 'rightTop'] as CoverArch[]) {
  const prompt = composePrompt(BRIEF, { cover: arch, paper: tpl.paper })
  if (!prompt.includes(COVER_COMPOSITION[arch])) fail(`5 ${arch}：构图句没进提示词`)
  if (!prompt.includes('no text, no letters, no characters')) fail(`5 ${arch}：缺「no text, no letters, no characters」`)
  if (/banner|frame|title area|white border|empty card/i.test(prompt)) {
    fail(`5 ${arch}：提示词里出现了会招边框的词`)
  }
  if (/paper background/i.test(prompt)) fail(`5 ${arch}：封面仍在要求「画在纸上」（它自己就是纸）`)
}
ok('5 三条构图句都在，且没有 banner / frame / title area')

/* ------------------------------- 交付物 ------------------------------- */

mkdirSync(OUT, { recursive: true })

/** 三种构图横排一张：纸 + 主体 + 标题块（用 accent 半透明画出来，就是眼睛看到的位置） */
if (panels.length === 3) {
  const pw = 320
  const ph = 180
  const sheet: RgbaImage = { width: pw * 3, height: ph, pixels: new Uint8Array(pw * 3 * ph * 4) }
  panels.forEach((p, k) => {
    const ox = k * pw
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * sheet.width + ox + x) * 4
        const sx = Math.min(p.img.width - 1, Math.round((x / pw) * p.img.width))
        const sy = Math.min(p.img.height - 1, Math.round((y / ph) * p.img.height))
        const si = (sy * p.img.width + sx) * 4
        sheet.pixels[i] = p.img.pixels[si]
        sheet.pixels[i + 1] = p.img.pixels[si + 1]
        sheet.pixels[i + 2] = p.img.pixels[si + 2]
        sheet.pixels[i + 3] = 255
      }
    }
    // 标题块：铺 60% 的朱红，位置就是 place() 给的那个框
    const t = p.title
    const x0 = ox + Math.round(t.x * pw)
    const x1 = x0 + Math.round(t.w * pw)
    const y0 = Math.round(t.y * ph)
    const y1 = y0 + Math.round(t.h * ph)
    for (let y = y0; y < Math.min(ph, y1); y++) {
      for (let x = Math.max(ox, x0); x < Math.min(ox + pw, x1); x++) {
        const i = (y * sheet.width + x) * 4
        sheet.pixels[i] = Math.round(sheet.pixels[i] * 0.4 + 0x9c * 0.6)
        sheet.pixels[i + 1] = Math.round(sheet.pixels[i + 1] * 0.4 + 0x3a * 0.6)
        sheet.pixels[i + 2] = Math.round(sheet.pixels[i + 2] * 0.4 + 0x2f * 0.6)
      }
    }
  })
  writeFileSync(`${OUT}/cover-score.png`, Buffer.from(await encodePng(sheet)))
  writeFileSync(
    `${OUT}/cover-score.txt`,
    panels
      .map(
        (p) =>
          `${p.item.name} → ${p.got.arch}，标题 (${p.title.x}, ${p.title.y}, ${p.title.w}×${p.title.h})，主体 (${p.box.x.toFixed(2)}, ${p.box.y.toFixed(2)}, ${p.box.w.toFixed(2)}×${p.box.h.toFixed(2)})，重叠 ${(p.hit * 100).toFixed(2)}%`
      )
      .join('\n') + '\n',
    'utf8'
  )
  console.log(`  交付：${OUT}/cover-score.png（三种构图横排，朱红块 = 标题位置）`)
}

writeFileSync(
  `${OUT}/cover-placed.txt`,
  coverPlaced
    .map((p: Placed) => {
      const at = `[${p.kind}] x=${p.x} y=${p.y} w=${p.w} h=${p.h}`
      return `${at}${p.text ? ` text=${p.text}` : ''}${p.size ? ` size=${p.size}` : ''}${p.fill ? ` fill=${p.fill}` : ''}`
    })
    .join('\n') + '\n',
  'utf8'
)
console.log(`  交付：${OUT}/cover-placed.txt（封面 Placed[] 全文）`)

/* 真导出一份：封面必须是第一张图，铺满，且没有页脚 */
const entry = findText('观潮')
if (!entry) fail('6 找不到内置《观潮》，导不出满版封面样张')
else {
  const input: LessonInput = {
    topic: '观潮',
    subject: '语文',
    stage: '小学',
    grade: '四年级',
    period: '第一课时',
    textbook: '部编版',
    duration: 2400,
    text: entry.quotes.join('\n'),
  }
  const base = getBuiltinStudentSlides(skeletonPlan(input), limitsFor('standard', 'lesson', 2400))
  const lessonLimits = limitsFor('standard', 'lesson', 2400)
  // 薄教案可能少于 pagesMin（TASKS/25 起不凑页），校验时就按实际页数放宽下限
  const limited = base.length < lessonLimits.pagesMin ? { ...lessonLimits, pagesMin: base.length } : lessonLimits
  const slides: StudentSlide[] = base.map((s, i) =>
    i === 0 ? { ...s, illustration: withArt, coverArch: lay.arch, coverScrim: lay.scrim } : s
  )
  const file = `${OUT}/q20b.pptx`
  rmSync(file, { force: true })
  try {
    await downloadTemplatedPptx(slides, tpl, undefined, file, { animated: false, limits: limited })
    console.log(`  交付：${file}（${slides.length} 页，封面满版）`)
  } catch (e) {
    fail(`6 满版封面导出失败 —— ${e instanceof Error ? e.message : String(e)}`)
  }
}

/* --------------------- 7 · 无图线稿按学科（TASKS/24 §三） --------------------- */

console.log('\n=== 7. 无图线稿按学科：语文雨丝 / 数学方格 / 英语四线格 / 科学柱 / 史地经纬网 ===')
{
  const cases: [string, MotifKey][] = [
    ['语文', 'chinese'],
    ['数学', 'math'],
    ['英语', 'english'],
    ['物理', 'science'],
    ['化学', 'science'],
    ['生物', 'science'],
    ['科学', 'science'],
    ['地理', 'humanities'],
    ['历史', 'humanities'],
    ['', 'neutral'],
  ]
  const wrong = cases.filter(([s, want]) => motifOf(s) !== want)
  if (wrong.length) fail(`7 学科判定不对：${wrong.map(([s, w]) => `${s || '（空）'}→${motifOf(s)}（应 ${w}）`).join('；')}`)
  else ok('7 学科 → 线稿判定', cases.map(([s, k]) => `${s || '（空）'}→${k}`).join(' '))

  /* 每套线稿渲一次独立封面（不靠骨架层，直接给 slide.motif） */
  const prints = new Map<MotifKey, string>()
  for (const key of Object.keys(MOTIFS) as MotifKey[]) {
    const page = place(coverOf({ coverArch: 'left', motif: key }), tpl)
    const strokes = page.filter((p) => p.kind === 'line' && p.y < 0.9)
    if (strokes.length < 5) fail(`7 ${key} 线稿只有 ${strokes.length} 笔，兜底太薄`)
    if (!strokes.every((s) => s.opacity === 0.28)) fail(`7 ${key} 线稿透明度不是 28%`)
    prints.set(key, strokes.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.w.toFixed(3)},${s.h.toFixed(3)}`).join('|'))
  }
  const dup = [...prints.entries()].filter(([k, v]) => [...prints.entries()].some(([k2, v2]) => k2 !== k && v2 === v))
  if (dup.length) fail(`7 有学科线稿几何完全相同：${dup.map(([k]) => k).join('/')}`)
  else ok('7 六套线稿几何两两不同', [...prints.keys()].map((k) => `${k} ${MOTIFS[k].strokes.length + 1} 笔`).join(' '))

  /* 语文仍是 20b 那套（地平线 + 6 根雨丝，7 笔），一个数都没改。
     注意：上面那条 bare 夹具不带 motif，走的是 neutral 六笔——这里必须显式给 chinese 再量 */
  const cnCover = place(coverOf({ coverArch: 'left', motif: 'chinese' }), tpl)
  const cn = cnCover.filter((p) => p.kind === 'line' && p.y < 0.9)
  if (cn.length !== 7) fail(`7 语文封面线稿从 7 笔变成了 ${cn.length} 笔（20b 的口径被改了）`)
  else ok('7 语文仍是 20b 那一套', '地平线 + 6 根雨丝 = 7 笔')

  /* 接线：骨架出来的一叠封面已经带 motif（语文课 → chinese），不用等人手填 */
  const entry2 = findText('观潮')
  if (!entry2) fail('7 找不到内置《观潮》，验不了骨架层的 motif 接线')
  else {
    const slides2 = getBuiltinStudentSlides(
      skeletonPlan({
        topic: '观潮',
        subject: '语文',
        stage: '小学',
        grade: '四年级',
        period: '第一课时',
        textbook: '部编版',
        duration: 2400,
        text: entry2.quotes.join('\n'),
      }),
      limitsFor('standard', 'lesson', 2400)
    )
    const coverPage = slides2[0]
    if (coverPage?.motif !== 'chinese') fail(`7 骨架层的封面 motif = ${String(coverPage?.motif)}，应为 chinese`)
    else ok('7 withMotif 接线', '《观潮》封面 motif=chinese，其余页不带这个字段')
    const others = slides2.slice(1).filter((s) => s.motif)
    if (others.length) fail(`7 除封面外有 ${others.length} 页也带了 motif，应只动封面`)
  }
}

/* -------------------------------- 收尾 -------------------------------- */

console.log('')
if (FAIL.length) {
  for (const f of FAIL) console.log(`✗ ${f}`)
  console.log(`\n封面门禁：${FAIL.length} 条未通过`)
  process.exit(1)
}
console.log('封面门禁：七条全过（满版 / 兜底 / 可读 / 三构图 / 提示词 / 按学科线稿）')
