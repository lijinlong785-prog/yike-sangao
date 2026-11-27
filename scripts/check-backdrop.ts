/**
 * 底景（TASKS 10 §九）的离线门禁。
 *
 * 这不是「看一眼好不好看」，是把六节规格里禁止的那几件事钉死：
 *   1. 六种构图 × 五套纸：一个形状都不许进正文带（y 0.136–0.833 且 x 0–0.86）。
 *      反向用例同时证明 backdropProblems 真会报「压带」与「两处强调」。
 *   2. 同一份里相邻两页不同构图——封面、正文、收尾三类页连起来看。
 *   3. 一页的强调色最多一处（一间门 / 一轮月，不许有第二块朱红）。
 *   4. 最深一档底景与纸的对比度落在 2.0–2.6:1——看得见，又不抢字。
 *      任何纸（含 AI 现配）都必须落在区间内：档位基准落不进去就在 shapeColor 里按对比度反解。
 *   5. 五套纸全部过 schemeIssues；数学课拿帘纹那张必须被学科红线打回。
 *   6. 桂花雨（无 Key）必须认得出 petals，花瓣页 ≥1、≤3，且不退回默认纸。
 *      注意这里喂给 builtinScheme 的必须是**课件页型**（buildDeck 的产出），
 *      学生版页型（stack / compare / words）是旁路，验不出「候选永远为空」那个 bug。
 *   7. 真实链路（40 分钟）：planForScale → buildDeck → builtinScheme →
 *      assignDeckLayouts → applySlideScenes，学生版页数落在 16–24 档里、场景 1–3 页；
 *      真出片后动态版 ppt/media 至少 1 个 GIF、静态版 0 个。
 *   8. 一叠 24 页里出现过的构图 ≥ 4 种（别又退回每张纸只用两种）。
 *   9. 花瓣页：一帧非透明像素 ≤ 12%，落在 y<0.25 标题区的 ≤ 2%（页序不写死，随页数口径）
 *  10. 任意纸（内置浅纸 / AI 浅中深纸）每页都拿得到底景，且 kind 恒为 picture；
 *      留白只能由排版层显式要（kind='blank'），不许从「纸不认识」里冒出来。
 *  11. 真出片后逐页解压 slideN.xml：除封面外，只有 <p:bg> 纯色的页一律 fail。
 *
 * 另有一段「三处同源」的接线检查（第三节的验收）：导出走 pptx 原生形状，
 * 网页演示与 PPT 预览走同一个 BackdropSvg + backdropShapes，谁都不许另画一套。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { biDaXiao } from '../src/data/bidaxiao'
import { changFangTi } from '../src/data/changfangti'
import { qiLvChangZheng } from '../src/data/changzheng'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'
import {
  BACKDROPS,
  TEXT_BAND,
  backdropFor,
  backdropProblems,
  mixHex,
  shapeColor,
  type Backdrop,
  type BgShape,
} from '../src/lib/backdrop'
import {
  BUILTIN_THEMES,
  builtinLayouts,
  builtinSceneSlots,
  builtinScheme,
  lessonText,
  paperScores,
  sceneVerdictOf,
} from '../src/lib/builtinScheme'
import { DEFAULT_THEME, paperOf, type DeckTheme } from '../src/lib/theme'
import { schemeIssues, subjectProblems } from '../src/lib/scheme'
import { contrastRatio } from '../src/lib/scheme'
import { assignDeckLayouts, buildDeck } from '../src/lib/deck'
import { limitsFor, scaleOf, slideRangeFor } from '../src/lib/scale'
import {
  PETAL_BAND_TOP,
  SCENE,
  framesOf,
  paintSceneFrame,
} from '../src/lib/scene'
import { applySlideScenes, getBuiltinStudentSlides, type StudentSlide } from '../src/lib/slides'
import { downloadPptx } from '../src/lib/pptx'
import type { LessonPlan } from '../src/types'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)

const PLANS: [string, LessonPlan][] = [
  ['桂花雨', guihuaYu],
  ['比大小', biDaXiao],
  ['长方体的认识', changFangTi],
  ['七律·长征', qiLvChangZheng],
]

/** 一叠页面：演示与导出读的是同一份学生版 */
function pagesOf(plan: LessonPlan): StudentSlide[] {
  return getBuiltinStudentSlides(plan)
}

/**
 * builtinScheme 要的页序：必须走 buildDeck 的**课件页型**——
 * 界面与导出两条路交给它的都是这份 kind（见 student.ts / scheme.ts 的调用点）。
 */
function deckBriefs(deck: readonly { kind: string; title: string }[]): { index: number; kind: string; title: string }[] {
  return deck.map((p, i) => ({ index: i + 1, kind: String(p.kind), title: p.title }))
}

/** 正文带：与 backdropProblems 同一条判据，这里独立写一遍，免得「自己验自己」 */
function inTextBand(s: BgShape): boolean {
  const overlapY = s.y < TEXT_BAND.bottom && s.y + s.h > TEXT_BAND.top
  const overlapX = s.x < TEXT_BAND.right && s.x + s.w > 0
  return overlapY && overlapX
}

/* ------------------------- 三处同源（第三节） ------------------------- */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const svgSrc = read('src/components/BackdropSvg.tsx')
if (!/backdropShapes\(/.test(svgSrc)) fail('BackdropSvg 没用 backdropShapes：网页那层会各画各的')
if (!/className="bd-svg"/.test(svgSrc)) fail('BackdropSvg 没挂 .bd-svg 类：底景会盖在字上或钻到纸下')
for (const [name, file] of [
  ['PptPreview', 'src/components/PptPreview.tsx'],
  ['SlideShow', 'src/components/SlideShow.tsx'],
] as const) {
  const src = read(file)
  if (!/<BackdropSvg/.test(src)) fail(`${name} 没渲染 BackdropSvg：预览/演示看不到底景`)
  if (/<polygon|<ellipse|<rect/.test(src)) fail(`${name} 自己画了形状：网页那两层必须同一份画法`)
  if (/shapeColor\(|mixHex\(/.test(src)) fail(`${name} 自己算颜色：应交给 backdropShapes 统一取色`)
}

/** 导出侧：background → drawBackdrop → GIF → 文字，顺序不许换 */
const pptxSrc = read('src/lib/pptx.ts')
const sliceOf = (start: string, end: string): string => {
  const a = pptxSrc.indexOf(start)
  const b = pptxSrc.indexOf(end, a + start.length)
  return a >= 0 && b > a ? pptxSrc.slice(a, b) : ''
}
const drawSlideBody = sliceOf('function drawSlide(', 'type Slide =')
const deckStart = pptxSrc.indexOf('function drawDeckPage(')
const drawDeckBody = deckStart >= 0 ? pptxSrc.slice(deckStart) : ''
for (const [label, body] of [
  ['drawSlide', drawSlideBody],
  ['drawDeckPage', drawDeckBody],
] as const) {
  if (!body) {
    fail(`找不到 ${label} 的函数体，顺序断言没法做`)
    continue
  }
  const bgAt = body.indexOf('slide.background')
  const backdropAt = body.indexOf('drawBackdrop(')
  const imageAt = body.indexOf('slide.addImage(')
  const textAt = body.indexOf('slide.addText(')
  if (bgAt < 0) fail(`${label} 没有 slide.background`)
  if (backdropAt < 0) fail(`${label} 没有调用 drawBackdrop`)
  if (bgAt >= 0 && backdropAt >= 0 && backdropAt < bgAt) fail(`${label} 的底景画在纸色之前，会被纸盖掉`)
  if (backdropAt >= 0 && imageAt >= 0 && imageAt < backdropAt) fail(`${label} 的底景画在 GIF 之后`)
  if (backdropAt >= 0 && textAt >= 0 && textAt < backdropAt) fail(`${label} 的底景画在文字之后，会压住字`)
}
if (!/shapeColor\(/.test(pptxSrc)) fail('drawBackdrop 没用 shapeColor：导出与网页的取色会分家')

/* ------------------------- 1. 形状不许进正文带 ------------------------- */

for (const t of BUILTIN_THEMES) {
  for (const b of BACKDROPS) {
    const hit = b.shapes.filter(inTextBand)
    if (hit.length) {
      fail(`「${t.name}」纸 × ${b.name}：${hit.length} 个形状进了正文带（y 0.136–0.833，x 0–0.86）`)
    }
    const reported = backdropProblems(b)
    if (reported.length) fail(`backdropProblems 在 ${b.id} 上报了 ${reported.length} 条：${reported[0]}`)
  }
}

for (const t of BUILTIN_THEMES) {
  for (const [name, plan] of PLANS) {
    pagesOf(plan).forEach((s, i) => {
      const bg = backdropFor(paperOf(t, s.kind), i, s.kind)
      const hit = bg.shapes.filter(inTextBand)
      if (hit.length) fail(`「${t.name}」× ${name} 第 ${i + 1} 页（${s.kind}）：底景压进正文带`)
      const reported = backdropProblems(bg)
      if (reported.length) fail(`「${t.name}」× ${name} 第 ${i + 1} 页：${reported[0]}`)
    })
  }
}

// 反例：判据必须真的会红
const badBand: Backdrop = {
  id: 'bad-band',
  name: '反例',
  kind: 'picture',
  shapes: [{ k: 'rect', x: 0.2, y: 0.4, w: 0.3, h: 0.2, tone: 2 }],
}
if (!backdropProblems(badBand).some((p) => p.includes('正文区'))) {
  fail('backdropProblems 放过了压进正文区的形状：门禁形同虚设')
}
const badAccent: Backdrop = {
  id: 'bad-accent',
  name: '反例',
  kind: 'picture',
  shapes: [
    { k: 'rect', x: 0.1, y: 0.9, w: 0.1, h: 0.08, tone: 2, accent: true },
    { k: 'ellipse', x: 0.92, y: 0.04, w: 0.05, h: 0.05, tone: 2, accent: true },
  ],
}
if (!backdropProblems(badAccent).some((p) => p.includes('强调色'))) {
  fail('backdropProblems 放过了两处强调色：一页只许点一处')
}

/* ------------------------- 2. 相邻两页不同构图 ------------------------- */

for (const t of BUILTIN_THEMES) {
  for (const [name, plan] of PLANS) {
    const kinds = pagesOf(plan).map((s) => s.kind)
    for (let i = 1; i < kinds.length; i++) {
      const a = backdropFor(paperOf(t, kinds[i - 1]), i - 1, kinds[i - 1])
      const b = backdropFor(paperOf(t, kinds[i]), i, kinds[i])
      if (a.id === b.id) fail(`「${t.name}」× ${name} 第 ${i} / ${i + 1} 页撞了同一种构图（${a.id}）`)
    }
  }
}

/* ------------------------- 3. 一页强调色 ≤1 ------------------------- */

for (const t of BUILTIN_THEMES) {
  for (const [name, plan] of PLANS) {
    pagesOf(plan).forEach((s, i) => {
      const n = backdropFor(paperOf(t, s.kind), i, s.kind).shapes.filter((x) => x.accent).length
      if (n > 1) fail(`「${t.name}」× ${name} 第 ${i + 1} 页有 ${n} 处强调色`)
    })
  }
}

/* --------------------- 3b. 任何纸都必须拿到底景 --------------------- */

/**
 * TASKS/17 §三：上一版 backdropFor 按 theme.id 查表，AI 现配的纸 id 是 `ai:#475332`
 * 这种色值串，表里没有 → 整叠只剩一块纯色。现在只认纸色：任何颜色都会落进
 * 「明度三档 × 冷暖三色相」之一，所以**永远**有底景。
 *
 * 第三列是这张纸上合理的正文色：门禁§4 要拿它算「最深一档与纸的对比度」。
 */
const AI_PAPERS: [string, string, string][] = [
  ['AI 浅纸', '#eef1ea', '#2a2e26'],
  ['AI 中纸', '#c9c2b0', '#33302a'],
  ['AI 深纸', '#475332', '#ece2c8'],
]

const ANY_PAPERS: [string, string][] = [['内置浅纸', DEFAULT_THEME.paper], ...AI_PAPERS.map(([l, p]) => [l, p] as [string, string])]
for (const [label, paper] of ANY_PAPERS) {
  pagesOf(guihuaYu).forEach((s, i) => {
    const bg = backdropFor(paper, i, s.kind)
    const where = `${label}（${paper}）第 ${i + 1} 页（${s.kind}）`
    if (!bg || typeof bg.kind !== 'string') fail(`${where}没拿到底景：backdropFor 不许返回空`)
    else if (bg.kind !== 'picture') fail(`${where}底景是 ${bg.kind}：只有排版层显式要留白才许 blank`)
    if (!bg || bg.shapes.length === 0) fail(`${where}底景一个形状都没有：等于纯色`)
    else {
      const reported = backdropProblems(bg)
      if (reported.length) fail(`${where}：${reported[0]}`)
    }
  })
  // 封面不是「免画」的页型：它也要一次底色（固定那张纸的正面 + 地平）
  if (backdropFor(paper, 0, 'cover').kind !== 'picture') fail(`${label}（${paper}）封面的底景不是 picture`)
}
// 显式留白：只有它才许 blank，而且必须一个形状都没有
const blankBg = backdropFor(DEFAULT_THEME.paper, 3, 'blank')
if (blankBg.kind !== 'blank') fail(`kind='blank' 拿到的不是留白（${blankBg.kind}）：显式留白没生效`)
if (blankBg.shapes.length) fail(`显式留白的底景还有 ${blankBg.shapes.length} 个形状`)
// 反向：万一把 id 又当纸色传进来（AI 方案的 id 就是 `ai:#475332`），也不许崩、不许空
const idOops = backdropFor('ai:#475332', 1, 'close-read')
if (idOops.kind !== 'picture' || idOops.shapes.length === 0) {
  fail('传入 id 字符串时底景塌了：认不出也要给一份，不许退回纯色')
}

/* ------------------------- 4. 底景不抢字（2.0–2.6:1） ------------------------- */

const surfaces: [string, string, string][] = []
for (const t of BUILTIN_THEMES) {
  surfaces.push([`${t.name}·主纸`, t.paper, t.ink])
  if (t.coverPaper) surfaces.push([`${t.name}·封面纸`, t.coverPaper, t.ink])
}
surfaces.push(['纸与墨·主纸', DEFAULT_THEME.paper, DEFAULT_THEME.ink])
if (DEFAULT_THEME.coverPaper) surfaces.push(['纸与墨·封面纸', DEFAULT_THEME.coverPaper, DEFAULT_THEME.ink])
// AI 现配的纸：id 形如 `ai:#475332`，底景表里没有名字——这里拿真色值验同一道对比度门禁
for (const [label, paper, ink] of AI_PAPERS) surfaces.push([label, paper, ink])

const DEEPEST_MIN = 2.0
const DEEPEST_MAX = 2.6
const deepestRatios: [string, number][] = []
for (const [label, paper, ink] of surfaces) {
  // 量「真画上去」的那一档：深纸上 shapeColor 会把混合比收紧到 0.78 倍，
  // 档位基准落不进 2.0–2.6 时还会按对比度反解一次（深绿纸配米色墨只到 1.86:1）。
  // 所以这里必须原样调 shapeColor，手算混合比量到的是一个渲染里不存在的颜色。
  const deepest = shapeColor({ k: 'rect', x: 0, y: 0, w: 0, h: 0, tone: 3 }, paper, ink, ink)
  const ratio = contrastRatio(deepest, paper)
  deepestRatios.push([label, ratio])
  if (ratio < DEEPEST_MIN) {
    fail(`${label} 最深一档 ${deepest} 对纸的对比度 ${ratio.toFixed(2)}:1，低于 ${DEEPEST_MIN}:1——投影上看不见`)
  }
  if (ratio > DEEPEST_MAX) {
    fail(`${label} 最深一档 ${deepest} 对纸的对比度 ${ratio.toFixed(2)}:1，超过 ${DEEPEST_MAX}:1——底景抢字`)
  }
}

// 反向用例：判据必须真会红（太淡、太深两头都要报）
const tooLight = mixHex('#fbf7ec', '#231f18', 0.2)
const tooDeep = mixHex('#fbf7ec', '#231f18', 0.7)
if (contrastRatio(tooLight, '#fbf7ec') >= DEEPEST_MIN) fail('反例（0.2 混合）居然达到了下限：门禁阈值写错了')
if (contrastRatio(tooDeep, '#fbf7ec') <= DEEPEST_MAX) fail('反例（0.7 混合）居然没超过上限：门禁阈值写错了')

/* ------------------------- 5. 五套纸全部过 schemeIssues ------------------------- */

for (const t of BUILTIN_THEMES) {
  const bad = schemeIssues(t, '语文')
  if (bad.length) fail(`「${t.name}」没过 schemeIssues：${bad[0]}`)
}
const silk = BUILTIN_THEMES.find((t) => t.motif === 'silk' || t.motif === 'seal')
if (!silk) {
  fail('五套纸里没有 silk / seal 母题的纸，数学课的学科红线无从验起')
} else if (!subjectProblems(silk, '数学').length) {
  fail(`数学课用「${silk.name}」（${silk.motif}）没有被 subjectProblems 打回`)
}

/* ------------------------- 6. 桂花雨（无 Key）必须有花瓣 ------------------------- */

// 界面与导出交给 builtinScheme 的是 buildDeck 的**课件页型**（student.ts / scheme.ts 两个调用点）。
// 这里必须走同一条：拿学生版页型（stack / compare / words）去筛，候选永远为空——
// 那正是这一轮修掉的 bug，用旁路页型验不出来。
const guihuaDeck = buildDeck(guihuaYu, allocate(guihuaYu.segments, guihuaYu.meta.duration))
const guihuaPages = deckBriefs(guihuaDeck)
const offline = builtinScheme(guihuaYu, guihuaPages)
if (offline.verdict.kind !== 'petals') {
  fail(`桂花雨判成了「${offline.verdict.kind || '分不清'}」，应出 petals（得分 ${JSON.stringify(offline.verdict.score)}）`)
}
if (offline.theme.id === DEFAULT_THEME.id) {
  const scores = paperScores(
    lessonText(guihuaYu, guihuaPages.map((p) => p.title)),
    String(guihuaYu.meta?.subject ?? '')
  )
  fail(
    `桂花雨退回了默认纸（五套纸得分 ${scores.map((s) => `${s.name} ${s.score}`).join(' / ')}）：没 Key 不许只剩一张纸`
  )
}
const scenes = offline.theme.scenes ?? []
const at = scenes.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
if (at.length < 1) fail('桂花雨一个场景页都没有：花瓣一朵不掉')
if (at.length > 3) fail(`桂花雨铺了 ${at.length} 页场景，最多 3 页`)
for (const i of at) {
  if (!/^(segment|segmentPoint|pause|hardpoint|activity)$/.test(guihuaPages[i].kind)) {
    fail(`第 ${i + 1} 页（${guihuaPages[i].kind}）不该有场景：只给 segment / segmentPoint / pause / hardpoint / activity`)
  }
  if (i === 0 || i === guihuaPages.length - 1) fail(`第 ${i + 1} 页是首页或末页，不该铺场景`)
}
for (let k = 1; k < at.length; k++) {
  if (at[k] - at[k - 1] < 3) fail(`第 ${at[k - 1] + 1} / ${at[k] + 1} 页场景中间不到两页（差 ${at[k] - at[k - 1]}）`)
}

// 页数少时上限更紧：<8 页只给 1 页，任意页数最多 3 页。
// 页型必须是课件那一套：写 stack / end 的话候选永远为空，这条上限断言就是空转。
const fake = (n: number) =>
  Array.from({ length: n }, (_, i) => (i === 0 ? 'cover' : i === n - 1 ? 'homework' : 'segment'))
for (const [n, cap] of [
  [7, 1],
  [10, 2],
  [16, 3],
  [20, 3],
] as const) {
  const got = builtinSceneSlots(fake(n), 'rain').filter(Boolean).length
  if (got > cap) fail(`${n} 页的叠铺了 ${got} 页场景，上限 ${cap}`)
}

// 「分不清就不画」：无意象 / 两类并列，都必须一个场景都不给
const vague = sceneVerdictOf('今天我们来认识长方体，先摸一摸它的面')
if (vague.kind !== '') fail(`「长方体」被硬认成了 ${vague.kind}：分不清就该空着`)
const tie = sceneVerdictOf('下雪了，又下雨了')
if (tie.kind !== '') fail(`雪与雨并列（${JSON.stringify(tie.score)}）仍被判成 ${tie.kind}：并列就是分不清`)

// 版式轮换：封面 full、相邻两页不同款
const kinds = guihuaPages.map((p) => p.kind)
const layouts = builtinLayouts(kinds)
if (kinds[0] === 'cover' && layouts[0] !== 'full') fail(`封面版式是 ${layouts[0]}，应为 full`)
for (let i = 1; i < layouts.length; i++) {
  if (layouts[i] === layouts[i - 1]) fail(`第 ${i} / ${i + 1} 页版式同为 ${layouts[i]}：相邻不许同款`)
}

/* ------------------------- 7. 真实链路（40 分钟，真出片） ------------------------- */

/**
 * 本节走的是界面与导出真正走的那条路：
 *   planForScale → buildDeck（课件页型）→ builtinScheme → assignDeckLayouts
 *   → 学生版 → applySlideScenes → downloadPptx
 * 中途任何一环页型口径对不上（比如上一轮那处），场景都会静默全空，
 * 所以这里不看中间值，只看最终两件事：学生版有没有场景、包里有没有 GIF。
 */
function unzipList(file: string): string[] {
  return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.endsWith('/'))
}

const DURATION40 = 2400
const PLAN40 = planForScale(guihuaYu, DURATION40)
const DECK40 = buildDeck(PLAN40, allocate(PLAN40.segments, DURATION40))
const SCHEME40 = builtinScheme(PLAN40, deckBriefs(DECK40))
const THEMED40 = assignDeckLayouts(DECK40, SCHEME40.theme.layouts, SCHEME40.theme.scenes)
const LIMITS40 = limitsFor('standard', scaleOf(DURATION40), DURATION40)
const SLIDES40 = applySlideScenes(getBuiltinStudentSlides(PLAN40, LIMITS40), THEMED40)

const scenePages40 = SLIDES40.filter((s) => s.scene).length
const range40 = slideRangeFor(DURATION40)
if (SLIDES40.length < range40.min || SLIDES40.length > range40.max) {
  fail(`40 分钟学生版 ${SLIDES40.length} 页，不在 ${range40.min}–${range40.max}（页数口径变了？）`)
}
if (scenePages40 < 1) {
  fail('40 分钟真实链路一页场景都没有：builtinSceneSlots 的页型又和课件页型对不上了')
} else if (scenePages40 > 3) {
  fail(`40 分钟真实链路铺了 ${scenePages40} 页场景，最多 3 页`)
}

// 8. 构图不许只用两种：24 页一叠里六种都要轮得开
const bgIds40 = THEMED40.map((p, i) => backdropFor(paperOf(SCHEME40.theme, p.kind), i, p.kind).id)
const distinct40 = new Set(bgIds40)
if (distinct40.size < 4) {
  fail(`40 分钟一叠（${THEMED40.length} 页）只出现 ${distinct40.size} 种构图，至少 4 种`)
}

// 9. 花瓣页：
//    · 一帧非透明像素 ≤ 12%（花不能比字抢眼）
//    · 落在 y<0.25 标题区的 ≤ 2%（上半页必须干净）
//    页序不写死：TASKS/25 起页数跟着素材走，花瓣页随之为第一个场景页，但必须落在开场 8 页内。
const petalPage = SLIDES40.findIndex((s) => s.scene === 'petals')
const firstScenePage = SLIDES40.findIndex((s) => s.scene)
if (petalPage < 0) {
  fail('40 分钟学生版里没有花瓣页：场景槽位一页都没落上')
} else if (petalPage > 8 || (firstScenePage >= 0 && petalPage !== firstScenePage)) {
  fail(
    `花瓣页落在第 ${petalPage + 1} 页（第一个场景页第 ${firstScenePage + 1} 页），应开场 8 页内且是第一个场景页`
  )
}
const framePixels = SCENE.width * SCENE.height
let maxOpaque = 0
let maxTop = 0
for (let f = 0; f < framesOf('petals'); f++) {
  const buf = paintSceneFrame('petals', f)
  let opaque = 0
  let top = 0
  for (let y = 0; y < SCENE.height; y++) {
    const inTitle = y < SCENE.height * PETAL_BAND_TOP
    for (let x = 0; x < SCENE.width; x++) {
      if (buf[(y * SCENE.width + x) * 4 + 3] < 128) continue
      opaque++
      if (inTitle) top++
    }
  }
  maxOpaque = Math.max(maxOpaque, opaque / framePixels)
  maxTop = Math.max(maxTop, top / framePixels)
}
if (maxOpaque > 0.12) {
  fail(`花瓣单帧占 ${(maxOpaque * 100).toFixed(1)}% 像素，超过 12%——“花”在跟字抢眼`)
}
if (maxTop > 0.02) {
  fail(`花瓣有 ${(maxTop * 100).toFixed(1)}% 落在 y<0.25 的标题区，超过 2%`)
}

const OUT_DIR = '/tmp/yike-check-backdrop'
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
const anim40 = `${OUT_DIR}/anim40.pptx`
const static40 = `${OUT_DIR}/static40.pptx`
await downloadPptx(SLIDES40, undefined, anim40, SCHEME40.theme, { animated: true, limits: LIMITS40 })
await downloadPptx(SLIDES40, undefined, static40, SCHEME40.theme, { animated: false, limits: LIMITS40 })

const gifCount = (file: string) =>
  unzipList(file).filter((e) => /^ppt\/media\/.+\.gif$/i.test(e)).length
const gifAnim = gifCount(anim40)
const gifStatic = gifCount(static40)
if (gifAnim < 1) fail(`40 分钟动态版只嵌了 ${gifAnim} 个 GIF，至少 1 个`)
if (gifStatic !== 0) fail(`40 分钟静态版仍有 ${gifStatic} 个 GIF，应一个都没有`)

/* --------------------- 7b. 解压来看：每页真的有底景 --------------------- */

const readSlideXml = (file: string, n: number): string =>
  execFileSync('/usr/bin/unzip', ['-p', file, `ppt/slides/slide${n}.xml`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })

/**
 * TASKS/17 §三.3：除封面外，只有 `<p:bg>` 纯色的页一律 fail。
 *
 * 底景是 pptx 原生矢量形状（不是图片），所以关系文件里当然没有它——这里按**意图**验：
 * 这一页的 XML 里必须有那块地平带的取色（形状由 drawBackdrop 逐页写入），
 * 或者至少有一张真图（`<p:pic>`）。两者都没有，学生看到的就只是一块纯纸。
 */
function assertSlideBackdrops(file: string, slides: StudentSlide[], theme: DeckTheme, label: string): void {
  slides.forEach((s, i) => {
    const xml = readSlideXml(file, i + 1)
    const paper = paperOf(theme, s.kind)
    const bg = backdropFor(paper, i, s.kind)
    // 每个构图的第一条都是地平带（GROUND），封面与收尾也一样
    const first = bg.shapes[0]
    const ground = first ? shapeColor(first, paper, theme.ink, theme.accent).replace('#', '').toUpperCase() : ''
    const hasGround = ground.length === 6 && xml.includes(`srgbClr val="${ground}"`)
    const hasPic = /<p:pic[\s>]/.test(xml)
    if (!hasGround && !hasPic && s.kind !== 'cover') {
      fail(`${label} 第 ${i + 1} 页（${s.kind}）只有 <p:bg> 纯色：底景没落到页面上`)
    }
  })
}
assertSlideBackdrops(anim40, SLIDES40, SCHEME40.theme, '动态版')
assertSlideBackdrops(static40, SLIDES40, SCHEME40.theme, '静态版')

// 反向：地平带的取色必须与纸不同，否则上面那句「XML 里有这个色」会被 <p:bg> 满足，断言就是空转
const probeBg = backdropFor(SCHEME40.theme.paper, 1, 'close-read')
const probeHex = (v: string) => v.replace('#', '').toUpperCase()
const probeGround = probeHex(shapeColor(probeBg.shapes[0], SCHEME40.theme.paper, SCHEME40.theme.ink, SCHEME40.theme.accent))
if (probeGround === probeHex(SCHEME40.theme.paper)) fail('地平带与纸同色：解压断言会被 <p:bg> 空过')

/* ------------------------- 汇总 ------------------------- */

const deepestMax = deepestRatios.reduce((m, [, r]) => Math.max(m, r), 0)
const deepestMin = deepestRatios.reduce((m, [, r]) => Math.min(m, r), Infinity)
const measured = PLANS.reduce((n, [, plan]) => n + pagesOf(plan).length * BUILTIN_THEMES.length, 0)
console.log(
  `  形状：六构图 × ${BUILTIN_THEMES.length} 套纸 + ${measured} 页实测，` +
    `压进正文带 0 个 | 反例「压带 / 两处强调」均被 backdropProblems 报出`
)
console.log(`  轮换：${PLANS.length} 套课 × ${BUILTIN_THEMES.length} 套纸，相邻页撞构图 0 次 | 一页强调色 >1 共 0 页`)
console.log(
  `  对比度：${surfaces.length} 张纸（主纸 + 封面纸 + AI 现配纸）最深一档 ${deepestMin.toFixed(2)}–${deepestMax.toFixed(2)}:1` +
    `（要求 ${DEEPEST_MIN}–${DEEPEST_MAX}:1）| 反例 0.2 / 0.7 混合两头都被拦住`
)
console.log(
  `  任意纸：${ANY_PAPERS.length} 张（内置浅 + AI 浅/中/深），每页都有底景、kind 恒为 picture；` +
    `显式留白 kind=blank 零形状`
)
console.log(`  纸：五套全部过 schemeIssues（语文） | 数学课用「${silk?.name ?? '—'}」被学科红线打回`)
console.log(
  `  桂花雨无 Key：判 ${offline.verdict.kind}（${JSON.stringify(offline.verdict.score)}），` +
    `纸 = ${offline.theme.name}，场景 ${at.length} 页（第 ${at.map((i) => i + 1).join(' / ')} 页）`
)
console.log(`  版式：${layouts.join(' / ')}`)
console.log(
  `  四课挑纸：` +
    PLANS.map(([name, plan]) => {
      // 与真实调用点同一口径：喂 buildDeck 的课件页型
      const deck = buildDeck(plan, allocate(plan.segments, plan.meta.duration))
      const r = builtinScheme(plan, deckBriefs(deck))
      const n = (r.theme.scenes ?? []).filter(Boolean).length
      return `${name} → ${r.theme.name}（${r.verdict.kind || '分不清'} ${JSON.stringify(r.verdict.score)} · ${n} 页场景）`
    }).join(' | ')
)
console.log(
  `  真实链路 40 分钟：课件 ${DECK40.length} 页 / 学生版 ${SLIDES40.length} 页，` +
    `场景 ${scenePages40} 页（第 ${SLIDES40.map((s, i) => (s.scene ? i + 1 : 0)).filter(Boolean).join(' / ')} 页）` +
    ` | 导出动态版 ${gifAnim} 个 GIF / 静态版 ${gifStatic} 个`
)
console.log(
  `  导出底景：动态/静态两版逐页解压 ${SLIDES40.length * 2} 张 slideN.xml，除封面外纯色页 0 页`
)
console.log(
  `  构图：${THEMED40.length} 页里 ${distinct40.size} 种（${[...distinct40].slice(0, 8).join(' / ')}）` +
    ` | 花瓣单帧非透明 ${(maxOpaque * 100).toFixed(2)}%（≤12%），y<0.25 ${(maxTop * 100).toFixed(2)}%（≤2%）`
)

if (failures.length) {
  console.error(`\n✗ 底景 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ 底景：边带纪律 / 相邻轮换 / 强调色 / 不抢字 / 五套纸 / 桂花雨花瓣 / 真实链路 / 六构图 / 花瓣密度 / 任意纸都有 / 解压有底 全部通过')
// 默认清场；想看真文件就 YIKE_KEEP_PPTX=1 跑一次，两份 pptx 会留在 OUT_DIR
if (process.env.YIKE_KEEP_PPTX) console.log(`  真文件留在 ${OUT_DIR}（YIKE_KEEP_PPTX=1）`)
else rmSync(OUT_DIR, { recursive: true, force: true })
