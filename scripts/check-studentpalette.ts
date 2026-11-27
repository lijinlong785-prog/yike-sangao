/**
 * TASKS/12 门禁：一份教案两套纸（学生版另配一套）。
 *
 * 这里真跑真实链路，不验旁路函数：
 *   resolveStudentScheme → 提示词 → 洗色值 → 判据 → 打回 / 派生，
 *   再拿 pptx / PptPreview / SlideShow 三处各自取纸的那一句对同一个 fixture 比对。
 *
 * 四个用例：
 *   1. 浅纸课件 → 学生纸距离 ≥ 40 且正文对比 ≥ 7:1（AI 通、派生通两条都要过；
 *      派生那条也是空 key 先走同源代理，模型没回话才派生）；
 *   2. 深纸课件 → 学生纸必须是浅档（或色相拉开），且 ink 不再反白；
 *   3. 模型失败 / 超时 → 派生纸生效、仍然合格，且返回的东西里没有任何可见提示；
 *   4. 三处取纸一致（pptx 的 PAPER / 预览的 --paper / 演示的纸），封面纸缺省退回主纸。
 * 另附两条「插画跟着纸走」：纸色 → 生图提示词的纸描述、深纸的判字方向反转。
 */
import { guihuaYu } from '../src/data/guihua'
import { allocate } from '../src/lib/timing'
import { buildDeck } from '../src/lib/deck'
import { DEFAULT_THEME, paperOf, themeVars, type DeckTheme } from '../src/lib/theme'
import { contrastRatio, lightness, rgbDistance, schemeProblems, type SchemePageBrief } from '../src/lib/scheme'
import {
  STUDENT_LIMITS,
  deriveStudentTheme,
  resolveStudentScheme,
  studentFromJSON,
  studentSchemePrompt,
  studentSchemeProblems,
} from '../src/lib/studentScheme'
import { paletteOf } from '../src/lib/pptx'
import { measureImage } from '../src/lib/inspect'
import { composePrompt, paperPhrase } from '../src/lib/illustrate'
import type { LLMConfig } from '../src/lib/llm'
import type { RgbaImage } from '../src/lib/watermark'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${label}: 实得 ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`)
  }
}
const ok = (msg: string, detail = '') => {
  console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
}
const hexNoHash = (v: string) => String(v).replace('#', '').toUpperCase()

const pages: SchemePageBrief[] = buildDeck(guihuaYu, allocate(guihuaYu.segments, guihuaYu.meta.duration)).map(
  (p, i) => ({ index: i + 1, kind: String(p.kind), title: p.title })
)

const cfg: LLMConfig = { baseUrl: 'https://example.test/v1', apiKey: 'sk-test', model: 'test' }
const noKey: LLMConfig = { ...cfg, apiKey: '' }

/** 浅纸课件：就是默认那张纸（《桂花雨》零回归那一张） */
const LIGHT_LESSON = DEFAULT_THEME

/** 深纸课件：古诗文/雨夜那一档，用来验「深纸 → 浅纸、ink 不再反白」 */
const DARK_LESSON: DeckTheme = {
  id: 'fixture-dark',
  name: '夜读',
  paper: '#22322c',
  coverPaper: '#2b3d36',
  paperDeep: '#1b2823',
  paperLine: '#3a4d45',
  ink: '#e8e4da',
  inkSoft: '#a9b3aa',
  accent: '#c9a227',
  accentSoft: '#2a3a33',
  serif: DEFAULT_THEME.serif,
  sans: DEFAULT_THEME.sans,
  motif: 'plain',
  ruleWidth: 1,
  source: 'builtin',
}

/** 一份合格的深色学生纸：与浅纸课件距离 364，正文对比 13:1，纸线 3.8:1 */
const AI_DARK = {
  name: '墨绿投影',
  note: '深底反白，最后一排也看得清。',
  motif: 'plain',
  paper: '#1d2a26',
  coverPaper: '#3f544b',
  paperDeep: '#15201c',
  paperLine: '#6f8a7c',
  ink: '#f2efe6',
  inkSoft: '#b9c4bb',
  accent: '#d8a24a',
  accentSoft: '#2a3a33',
}

/** 一份合格的浅色学生纸：给深纸课件用 */
const AI_LIGHT = {
  name: '米白投影',
  note: '亮底近黑字，投影上也够狠。',
  motif: 'dots',
  paper: '#f3efe4',
  coverPaper: '#d9d0bd',
  paperDeep: '#e9e4d6',
  paperLine: '#b8ae98',
  ink: '#191711',
  inkSoft: '#4c473c',
  accent: '#8f2f22',
  accentSoft: '#efded8',
}

/** 打桩 fetch：按顺序吐 payload（字符串原样当 content），并记录每次请求体 */
function fakeLLM(payloads: unknown[]) {
  let n = 0
  const bodies: string[] = []
  globalThis.fetch = (async (_url: unknown, init: unknown) => {
    bodies.push(String((init as { body?: string } | undefined)?.body ?? ''))
    const payload = payloads[Math.min(n, payloads.length - 1)]
    n++
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }],
      }),
      text: async () => '',
    }
  }) as unknown as typeof fetch
  return { count: () => n, bodies }
}

const realFetch = globalThis.fetch
// llm.ts 的 requestChat 用 window.setTimeout 做超时；node 里没有 window，临时垫一下
const g = globalThis as unknown as { window?: unknown }
const savedWindow = g.window
g.window = globalThis

/** 这套学生纸对课件纸、对投影距离是否都过关（返回问题清单，空 = 过） */
function paletteGaps(t: DeckTheme, lesson: DeckTheme): string[] {
  const out = studentSchemeProblems(t, lesson)
  if (rgbDistance(t.paper, lesson.paper) < STUDENT_LIMITS.gapMin) out.push('色差不够 40')
  if (contrastRatio(t.ink, t.paper) < STUDENT_LIMITS.inkContrastMin) out.push('正文对比不够 7:1')
  if (contrastRatio(t.paperLine, t.paper) < STUDENT_LIMITS.lineContrastMin) out.push('分隔线对比不够 1.6:1')
  return out
}

/* ================================ 一 · 浅纸课件 ================================ */

async function caseShallow() {
  console.log('\n[1] 浅纸课件 → 学生纸（AI 通 / 派生通 两条都要过）')

  // 1a. AI 通：模型交一份深色学生纸
  {
    const probe = fakeLLM([AI_DARK])
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: LIGHT_LESSON, cfg })
    eq('AI 通：请求次数', probe.count(), 1)
    eq('AI 通：source', r.source, 'ai')
    eq('AI 通：主纸', r.theme.paper, AI_DARK.paper)
    eq('AI 通：封面纸', r.theme.coverPaper, AI_DARK.coverPaper)
    // 这一遍只管纸：版式与场景一个都不许带（§三）
    eq('AI 通：不带 layouts', r.theme.layouts, undefined)
    eq('AI 通：不带 scenes', r.theme.scenes, undefined)
    const gaps = paletteGaps(r.theme, LIGHT_LESSON)
    if (gaps.length) fail(`AI 通：学生纸不合格 — ${gaps.join('；')}`)
    eq('AI 通：SCHEME_LIMITS', schemeProblems(r.theme), [])
    ok(
      'AI 通：一份深色学生纸',
      `距离 ${rgbDistance(r.theme.paper, LIGHT_LESSON.paper).toFixed(0)}、正文对比 ${contrastRatio(r.theme.ink, r.theme.paper).toFixed(1)}:1、纸线 ${contrastRatio(r.theme.paperLine, r.theme.paper).toFixed(2)}:1`
    )

    // 提示词必须把课件纸交出去，且明说要避开
    const { system, user } = studentSchemePrompt(guihuaYu, pages, LIGHT_LESSON)
    if (!user.includes(LIGHT_LESSON.paper)) fail('提示词没把课件纸的 hex 交给模型')
    if (!system.includes('必须和老师那份明显不同')) fail('提示词没写「必须和老师那份明显不同」')
    if (!system.includes(`${STUDENT_LIMITS.inkContrastMin}:1`)) fail('提示词没写正文对比 7:1')
    if (!/学生投影/.test(system)) fail('提示词没说这一套是给学生投影看的')
    if (/"layouts"|"scenes"/.test(system)) fail('提示词的字段清单里混进了 layouts/scenes')
    ok('提示词：带课件纸 + 明说要避开 + 不含版式/场景字段')
  }

  // 1b. 派生通：空 key 也走同源代理问一次，模型没回话就派生（不许回 DEFAULT_THEME）
  {
    const urls: string[] = []
    let authorized = 0
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      urls.push(String(url))
      const headers = (init as { headers?: Record<string, string> } | undefined)?.headers ?? {}
      if (Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')) authorized++
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: LIGHT_LESSON, cfg: noKey })
    eq('派生：仍然发了请求', urls.length > 0, true)
    eq('派生：全部走同源代理', urls.every((u) => u.startsWith('/api/ds/')), true)
    eq('派生：没带 Authorization', authorized, 0)
    eq('派生：source', r.source, 'derived')
    eq('派生：主纸 = deriveStudentTheme', r.theme.paper, deriveStudentTheme(LIGHT_LESSON, guihuaYu.meta.topic).paper)
    if (r.theme.paper === DEFAULT_THEME.paper) fail('派生纸退回了 DEFAULT_THEME 的主纸')
    if (r.theme.id === DEFAULT_THEME.id) fail('派生纸退回了 DEFAULT_THEME')
    const gaps = paletteGaps(r.theme, LIGHT_LESSON)
    if (gaps.length) fail(`派生：学生纸不合格 — ${gaps.join('；')}`)
    eq('派生：SCHEME_LIMITS', schemeProblems(r.theme), [])
    eq('派生：浅纸 → 深纸', lightness(r.theme.paper) < 64, true)
    ok(
      '派生：浅纸课件 → 深纸',
      `主纸 ${r.theme.paper}、明度 ${lightness(r.theme.paper).toFixed(0)}%、距离 ${rgbDistance(r.theme.paper, LIGHT_LESSON.paper).toFixed(0)}、对比 ${contrastRatio(r.theme.ink, r.theme.paper).toFixed(1)}:1`
    )
  }
}

/* ================================ 二 · 深纸课件 ================================ */

async function caseDeep() {
  console.log('\n[2] 深纸课件 → 学生纸必须翻到浅档，ink 不再反白')

  // 2a. 派生：深 → 浅
  {
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: DARK_LESSON, cfg: noKey })
    const t = r.theme
    eq('深→浅：source', r.source, 'derived')
    if (lightness(t.paper) < 74) fail(`深→浅：学生纸明度 ${lightness(t.paper).toFixed(0)}%，不在浅纸档（≥74%）`)
    if (lightness(t.ink) >= lightness(t.paper)) fail('深→浅：ink 还是反白（比纸亮）')
    if (contrastRatio(t.ink, t.paper) < STUDENT_LIMITS.inkContrastMin) {
      fail(`深→浅：正文对比 ${contrastRatio(t.ink, t.paper).toFixed(2)}:1，不到 7:1`)
    }
    const gaps = paletteGaps(t, DARK_LESSON)
    if (gaps.length) fail(`深→浅：学生纸不合格 — ${gaps.join('；')}`)
    eq('深→浅：SCHEME_LIMITS', schemeProblems(t), [])
    ok(
      '深→浅：派生纸',
      `课件 ${DARK_LESSON.paper} → 学生 ${t.paper}、ink ${t.ink}（对比 ${contrastRatio(t.ink, t.paper).toFixed(1)}:1）、距离 ${rgbDistance(t.paper, DARK_LESSON.paper).toFixed(0)}`
    )
  }

  // 2b. AI 通：换成浅档学生纸，同样要过全部判据
  {
    const probe = fakeLLM([AI_LIGHT])
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: DARK_LESSON, cfg })
    eq('深→浅 AI：source', r.source, 'ai')
    eq('深→浅 AI：主纸', r.theme.paper, AI_LIGHT.paper)
    if (lightness(r.theme.ink) >= lightness(r.theme.paper)) fail('深→浅 AI：ink 还是反白')
    const gaps = paletteGaps(r.theme, DARK_LESSON)
    if (gaps.length) fail(`深→浅 AI：学生纸不合格 — ${gaps.join('；')}`)
    ok('深→浅 AI：浅档学生纸', `距离 ${rgbDistance(r.theme.paper, DARK_LESSON.paper).toFixed(0)}、正文对比 ${contrastRatio(r.theme.ink, r.theme.paper).toFixed(1)}:1`)
  }

  // 2c. 同档同色相（只差 10°）必须被打回：模型交一张「看着不一样、其实一样」的纸
  {
    const twin = { ...AI_LIGHT, paper: '#efe9dc', coverPaper: '#d5ccb9', paperLine: '#b2a892' }
    // 第一次交浅纸（与浅纸课件几乎一样）→ 打回；第二次按提示换成深纸
    const probe = fakeLLM([twin, AI_DARK])
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: LIGHT_LESSON, cfg })
    eq('同档同族：请求次数', probe.count(), 2)
    eq('同档同族：第二次采用', r.source, 'ai')
    eq('同档同族：最终主纸', r.theme.paper, AI_DARK.paper)
    if (!(probe.bodies[1] ?? '').includes('学生纸')) fail('打回的第二次请求里没带「学生纸与课件纸色差」这条原因')
    ok('同档同族：距离 < 40 被打回重配')
  }
}

/* ============================== 三 · 失败无声回落 ============================== */

async function caseFallback() {
  console.log('\n[3] 模型失败 / 超时 → 派生纸生效，界面上一个字都不提示')

  // 3a. 网络挂掉
  {
    const boom = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    globalThis.fetch = boom
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: LIGHT_LESSON, cfg })
    eq('断网：source', r.source, 'derived')
    eq('断网：主纸 = 派生纸', r.theme.paper, deriveStudentTheme(LIGHT_LESSON, guihuaYu.meta.topic).paper)
    // 返回的东西里只有这三个字段：没有 problems / notice / toast 这类会被界面搬上去的东西
    eq('断网：返回形状', Object.keys(r).sort(), ['reason', 'source', 'theme'])
    if (!r.theme.paper || r.theme.paper === DEFAULT_THEME.paper) fail('断网：回报的纸是默认纸')
    const gaps = paletteGaps(r.theme, LIGHT_LESSON)
    if (gaps.length) fail(`断网：派生纸不合格 — ${gaps.join('；')}`)
    ok('断网：静默用派生纸', `reason=「${r.reason.slice(0, 28)}…」，主纸 ${r.theme.paper}`)
  }

  // 3b. 超时（signal 已被 abort）
  {
    globalThis.fetch = (async () => {
      const e = new DOMException('aborted', 'AbortError')
      throw e
    }) as unknown as typeof fetch
    const controller = new AbortController()
    controller.abort()
    const r = await resolveStudentScheme({
      plan: guihuaYu,
      pages,
      lessonTheme: LIGHT_LESSON,
      cfg,
      signal: controller.signal,
    })
    eq('超时：source', r.source, 'derived')
    eq('超时：返回形状', Object.keys(r).sort(), ['reason', 'source', 'theme'])
    eq('超时：主纸 = 派生纸', r.theme.paper, deriveStudentTheme(LIGHT_LESSON, guihuaYu.meta.topic).paper)
    if (!/取消/.test(r.reason)) fail(`超时的说明不是「取消」那一句：「${r.reason}」`)
    ok('超时：静默用派生纸', `reason=「${r.reason}」`)
  }

  // 3c. 两次都不合格 → 派生，且只问两次（不重试第三次）
  {
    const muddy = { ...AI_DARK, paper: '#8a8a86', coverPaper: '#7e7e7a' }
    const probe = fakeLLM([muddy])
    const r = await resolveStudentScheme({ plan: guihuaYu, pages, lessonTheme: LIGHT_LESSON, cfg })
    eq('两次出框：请求次数', probe.count(), 2)
    eq('两次出框：source', r.source, 'derived')
    eq('两次出框：主纸 = 派生纸', r.theme.paper, deriveStudentTheme(LIGHT_LESSON, guihuaYu.meta.topic).paper)
    ok('两次出框：落派生纸，第三次不问了')
  }

  // 3d. 洗色值这一层单独验一次：色值缺失时必须判不合格（不许拿默认纸补齐上屏）
  {
    const broken = studentFromJSON({ ...AI_DARK, ink: 'not-a-color' }, guihuaYu, LIGHT_LESSON)
    eq('洗色：theme', broken.theme, null)
    if (!broken.problems.some((p) => p.includes('正文'))) fail('洗色：缺 ink 时没指出「正文」')
    ok('洗色：缺色值带问题清单退回')
  }
}

/* ============================ 四 · 三处取纸一致 ============================ */

function caseThreePlaces() {
  console.log('\n[4] pptx / 预览 / 演示 三处取到的纸是同一个值')

  /** themeVars 交的是 CSSProperties，脚本里按变量名取（自检用，不进产物） */
  const varsOf = (x: DeckTheme) => themeVars(x) as unknown as Record<string, string | undefined>

  const t = deriveStudentTheme(DARK_LESSON, guihuaYu.meta.topic)
  // pptx：每页背景 = pal.PAPER；封面页吃封面纸
  const pptxBody = paletteOf(t).PAPER
  const pptxCover = paletteOf(t, 'cover').PAPER
  // 预览（PptPreview）：themeVars 注入 --paper / --paper-cover，纸面另取 paperOf
  const preview = String(varsOf(t)['--paper'])
  const previewCover = String(varsOf(t)['--paper-cover'])
  const previewPaper = paperOf(t, 'sheet')
  // 演示（SlideShow）：themeStyle 注入同一套变量，BackdropSvg 的 paper 取 t.paper
  const show = String(varsOf(t)['--paper'])
  const showPaper = t.paper

  eq('三处主纸', [hexNoHash(preview), hexNoHash(show), hexNoHash(previewPaper), hexNoHash(showPaper)], [
    pptxBody,
    pptxBody,
    pptxBody,
    pptxBody,
  ])
  eq('封面纸：pptx', pptxCover, hexNoHash(String(t.coverPaper)))
  eq('封面纸：预览', hexNoHash(previewCover), hexNoHash(String(t.coverPaper)))
  eq('封面纸：纸面取色与 --paper-cover 同源', hexNoHash(String(paperOf(t, 'cover'))), hexNoHash(previewCover))
  ok('三处取纸一致', `主纸 ${t.paper}、封面 ${String(t.coverPaper)}`)

  // 封面纸缺省：退回主纸，不许退回 DEFAULT_THEME.coverPaper
  const bare: DeckTheme = { ...t }
  delete bare.coverPaper
  eq('缺封面纸：pptx 退回主纸', paletteOf(bare, 'cover').PAPER, paletteOf(bare).PAPER)
  eq('缺封面纸：预览不注入 --paper-cover', varsOf(bare)['--paper-cover'], undefined)
  eq('缺封面纸：预览纸面退回主纸', paperOf(bare, 'cover'), bare.paper)
  if (paletteOf(bare, 'cover').PAPER === hexNoHash(DEFAULT_THEME.coverPaper ?? '')) {
    fail('缺封面纸时退回了 DEFAULT_THEME.coverPaper')
  }
  ok('缺封面纸：三处都退回主纸')
}

/* ============================ 五 · 插画跟着纸走 ============================ */

const DARK_PAPER: [number, number, number] = [29, 42, 38]
const LIGHT_PAPER: [number, number, number] = [250, 248, 243]

/** 一张 1024×576 的合成图：纸色底 + 一侧暖色主体，可选一段中性「字」（亮字 / 暗字） */
function artImage(paper: [number, number, number], glyph: 'none' | 'light' | 'dark'): RgbaImage {
  const width = 1024
  const height = 576
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      pixels[i] = paper[0]
      pixels[i + 1] = paper[1]
      pixels[i + 2] = paper[2]
      pixels[i + 3] = 255
    }
  }
  const from = Math.round(width * 0.05)
  const to = from + Math.round(width * 0.37)
  const yFrom = Math.round(height * 0.25)
  const yTo = yFrom + Math.round(height * 0.5)
  for (let y = yFrom; y < yTo; y++) {
    for (let x = from; x < to; x++) {
      const i = (y * width + x) * 4
      pixels[i] = 150
      pixels[i + 1] = 118
      pixels[i + 2] = 86
    }
  }
  if (glyph !== 'none') {
    const v = glyph === 'light' ? 238 : 38
    const gy = Math.round(height * 0.46)
    for (let y = gy; y < gy + 40; y++) {
      for (let x = 300; x < 740; x++) {
        if ((x - 300) % 18 > 12) continue
        const i = (y * width + x) * 4
        pixels[i] = v
        pixels[i + 1] = v
        pixels[i + 2] = v
      }
    }
  }
  return { width, height, pixels }
}

function caseIllust() {
  console.log('\n[5] 插画跟着纸走：提示词纸描述取学生纸、深纸判字方向反转')

  // 5a. 提示词：同一个 brief，纸色不同 → 底纸描述不同
  const deepBrief = composePrompt('a child watching rain', { paper: '#1f2a24' })
  const creamBrief = composePrompt('a child watching rain', { paper: '#faf8f3' })
  if (!paperPhrase('#1f2a24').includes('deep ink-green')) fail(`深绿纸的描述不对：${paperPhrase('#1f2a24')}`)
  if (!paperPhrase('#faf8f3').includes('soft cream')) fail(`米白纸的描述不对：${paperPhrase('#faf8f3')}`)
  if (!deepBrief.includes('deep ink-green paper background')) fail('深纸提示词里没有深绿纸面')
  if (!creamBrief.includes('soft cream paper background')) fail('浅纸提示词里没有米白纸面')
  if (/warm textured paper background/.test(deepBrief)) fail('提示词还留着写死的暖白纸')
  ok('提示词纸描述', `${paperPhrase('#1f2a24')} ／ ${paperPhrase('#faf8f3')}`)

  // 5b. 深纸判字：暗底亮字要算字，干净的深色图不许误判
  const darkInk = measureImage(artImage(DARK_PAPER, 'light'), '#1d2a26')
  const darkClean = measureImage(artImage(DARK_PAPER, 'none'), '#1d2a26')
  if (!darkInk.textRisk) fail(`深纸亮字没被认出来（glyph=${darkInk.glyph}）`)
  if (darkInk.glyph < 1500) fail(`深纸亮字 glyph=${darkInk.glyph}，没到 1500`)
  if (darkClean.textRisk) fail(`干净的深色图被判带字（glyph=${darkClean.glyph}）`)
  ok('深纸判字', `亮字 glyph=${darkInk.glyph}（判废）／干净 glyph=${darkClean.glyph}（放行）`)

  // 5c. 浅纸那条路不许被这次改动带坏：暗字照样判废、干净照样放行
  const lightInk = measureImage(artImage(LIGHT_PAPER, 'dark'), '#faf8f3')
  const lightClean = measureImage(artImage(LIGHT_PAPER, 'none'), '#faf8f3')
  if (!lightInk.textRisk) fail(`浅纸暗字没被认出来（glyph=${lightInk.glyph}）`)
  if (lightClean.textRisk) fail(`干净的浅色图被判带字（glyph=${lightClean.glyph}）`)
  ok('浅纸判字未回退', `暗字 glyph=${lightInk.glyph}／干净 glyph=${lightClean.glyph}`)
}

/* ================================== 跑 ================================== */

try {
  await caseShallow()
  await caseDeep()
  await caseFallback()
  caseThreePlaces()
  caseIllust()
} catch (e) {
  fail(`脚本抛出异常：${e instanceof Error ? e.message : String(e)}`)
} finally {
  globalThis.fetch = realFetch
  if (savedWindow === undefined) delete g.window
  else g.window = savedWindow
}

console.log(
  `\n  浅纸→学生纸（AI/派生）| 深纸→浅档（派生/AI/同档打回）| 断网·超时·两次出框 → 派生 | 三处取纸 | 插画纸描述与深纸判字`
)

if (failures.length) {
  console.error(`\n✗ 学生版另配一套纸 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ 学生版另配一套纸：两纸距离/对比、深纸翻转、失败无声回落、三处同源、插画跟纸 全部通过')
