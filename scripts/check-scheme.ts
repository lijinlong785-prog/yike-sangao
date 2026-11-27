/**
 * 第 9 件：AI 现场配色的异步链门禁（TASKS/09 §十三 第 9 件）。
 *
 * check-lib 那边只证「判据能红」，这份脚本证「问到之后怎么走」：
 *   1. 没 Key：也走同源代理问模型（不带 Authorization），模型没回话才按课文配一张纸；
 *   2. 一次合格：采用模型的色板与版式，attempts=1；
 *   3. 第一次出框：第二次请求的提示词里真的带上了退回原因（attempts=2）；
 *   4. 两次都出框：回落本课兜底纸面（builtinScheme 按课文配的那张），问题清单原样带回界面，不静默改色；
 *   5. 数学课交 seal：按学科红线打回（语文课同样的方案放行）；
 *   6. 垃圾 JSON：链上每级各问一次就停，回落兜底，给界面的原因是中文；
 *   7. 模型排的版式真的落到 assignDeckLayouts 上，且整叠仍满足布局三条；
 *   8. 提示词里四条硬约束的数值是 SCHEME_LIMITS 本体，不是手抄的数字。
 */
import { biDaXiao } from '../src/data/bidaxiao'
import { guihuaYu } from '../src/data/guihua'
import { allocate } from '../src/lib/timing'
import { assignDeckLayouts, buildDeck, layoutProblems } from '../src/lib/deck'
import { builtinScheme } from '../src/lib/builtinScheme'
import {
  SCHEME_LIMITS,
  resolveScheme,
  schemeFromJSON,
  schemePrompt,
  type SchemePageBrief,
} from '../src/lib/scheme'
import type { LLMConfig } from '../src/lib/llm'
import { textChain } from '../src/lib/llm'
import { upstreamModel } from '../src/lib/endpoint'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${label}: 实得 ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`)
  }
}

const pages: SchemePageBrief[] = buildDeck(guihuaYu, allocate(guihuaYu.segments, guihuaYu.meta.duration)).map(
  (p, i) => ({ index: i + 1, kind: p.kind, title: p.title })
)

/** 12 页：每隔 5 页一次 full（下标 0/5/10），前后任意 5 页窗口里都有整页大图，
 *  且 5 种版式齐全——这份「排得好」的方案不该被修补 */
const GOOD_LAYOUTS = ['full', 'split', 'cards', 'timeline', 'cloze', 'full', 'cards', 'timeline', 'cloze', 'split', 'full', 'cards']

const GOOD = {
  name: '雨后苔痕',
  note: '读课文配的一张湿绿纸。',
  motif: 'dots',
  paper: '#eef1ea',
  coverPaper: '#d5ddd2',
  paperDeep: '#e3e8de',
  paperLine: '#d8ded3',
  ink: '#22261f',
  inkSoft: '#5a6156',
  accent: '#8a4a3a',
  accentSoft: '#efe0da',
  ruleWidth: 1,
  layouts: GOOD_LAYOUTS.slice(0, pages.length),
}

/** 纸太艳（彩度 66.7% > 55%）：第一轮必被退回的那一份——荧光绿，明度合法、彩度出框 */
const BAD_CHROMA = { ...GOOD, paper: '#8fd42a' }

const cfg: LLMConfig = { baseUrl: 'https://example.test/v1', apiKey: 'sk-test', model: 'test' }
const noKey: LLMConfig = { ...cfg, apiKey: '' }

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
        choices: [
          { message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } },
        ],
      }),
      text: async () => '',
    }
  }) as unknown as typeof fetch
  return { count: () => n, bodies }
}

const realFetch = globalThis.fetch
// llm.ts 的 requestChat 用 window.setTimeout 做超时；node 里没 window，临时垫一下
const g = globalThis as unknown as { window?: unknown }
const savedWindow = g.window
g.window = globalThis

try {
  /* --- 1. 没 Key：照样问模型（同源代理），模型没回话才用本课兜底纸面 --- */
  {
    const urls: string[] = []
    let authorized = 0
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      urls.push(String(url))
      const headers = (init as { headers?: Record<string, string> } | undefined)?.headers ?? {}
      if (Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')) authorized++
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg: noKey })
    eq('没 Key：仍然发了请求', urls.length > 0, true)
    eq('没 Key：全部走同源代理', urls.every((u) => u.startsWith('/api/ds/')), true)
    eq('没 Key：没带 Authorization', authorized, 0)
    eq('没 Key：source', r.source, 'builtin')
    eq('没 Key：attempts', r.attempts, 1)
    eq('没 Key：用本课兜底纸面', r.theme, builtinScheme(guihuaYu, pages).theme)
    if (!r.reason?.includes(builtinScheme(guihuaYu, pages).theme.name)) {
      fail(`没 Key 的说明没提到本课纸面：「${String(r.reason)}」`)
    }
  }

  /* --- 2. 一次合格：色板与版式都采用 --- */
  {
    const probe = fakeLLM([GOOD])
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg })
    eq('一次过：fetch 次数', probe.count(), 1)
    eq('一次过：source', r.source, 'ai')
    eq('一次过：attempts', r.attempts, 1)
    eq('一次过：主纸', r.theme.paper, GOOD.paper)
    eq('一次过：封面纸', r.theme.coverPaper, GOOD.coverPaper)
    eq('一次过：版式条数', r.theme.layouts?.length, pages.length)
    eq('一次过：版式内容', r.theme.layouts, GOOD_LAYOUTS.slice(0, pages.length))
    eq('一次过：id 带 ai: 前缀', r.theme.id.startsWith('ai:'), true)
  }

  /* --- 3. 第一次出框：第二次请求带上退回原因 --- */
  {
    const probe = fakeLLM([BAD_CHROMA, GOOD])
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg })
    eq('打回一次：fetch 次数', probe.count(), 2)
    eq('打回一次：source', r.source, 'ai')
    eq('打回一次：attempts', r.attempts, 2)
    const second = probe.bodies[1] ?? ''
    if (!second.includes('彩度')) fail('第二次请求没把「彩度」这条原因带回去')
    if (!second.includes('上一版被退回')) fail('第二次请求里没有「上一版被退回」那一段')
    if (second.includes('`')) fail('第二次请求体里出现了反引号，提示词模板可能被拼坏')
  }

  /* --- 4. 两次都出框：回落兜底，问题清单带回界面 --- */
  {
    const probe = fakeLLM([BAD_CHROMA, BAD_CHROMA])
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg })
    eq('两次出框：fetch 次数', probe.count(), 2)
    eq('两次出框：source', r.source, 'builtin')
    eq('两次出框：attempts', r.attempts, 2)
    eq('两次出框：用本课兜底纸面', r.theme, builtinScheme(guihuaYu, pages).theme)
    if (!r.problems.some((p) => /彩度/.test(p))) fail(`两次出框没把彩度问题带回 ：${JSON.stringify(r.problems)}`)
    if (!r.reason?.includes(builtinScheme(guihuaYu, pages).theme.name)) {
      fail(`两次出框的说明没提本课纸面：${String(r.reason)}`)
    }
  }

  /* --- 5. 学科红线：数学课 seal 打回，语文课同样的方案放行 --- */
  {
    const seal = { ...GOOD, motif: 'seal' }
    const probe = fakeLLM([seal, seal])
    const r = await resolveScheme({ plan: biDaXiao, pages, cfg })
    eq('数学 seal：source', r.source, 'builtin')
    if (!r.problems.some((p) => /印章/.test(p))) fail(`数学课的 seal 没按印章打回：${JSON.stringify(r.problems)}`)
    const firstBody = probe.bodies[0] ?? ''
    if (!firstBody.includes('宣纸、印章、帘纹')) fail('数学课的提示词里没写明「宣纸、印章、帘纹」禁用')

    const yuwen = schemeFromJSON(seal, '语文', pages.length)
    if (!yuwen.theme) fail(`语文课用 seal 母题本来合法，却被退：${yuwen.problems.join('；')}`)
    const yingyu = schemeFromJSON(seal, '英语', pages.length)
    if (yingyu.theme) fail('英语课用 seal 母题没被判错')
  }

  /* --- 5b. 场景口径：页页都动 = 这份方案不采用（第 10 件）；留白合法 --- */
  {
    const allMoving = { ...GOOD, scenes: Array.from({ length: pages.length }, () => 'petals') }
    const probe = fakeLLM([allMoving, allMoving])
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg })
    eq('页页都动：source', r.source, 'builtin')
    if (!r.problems.some((p) => /页页都动/.test(p))) fail(`页页都动没被打回：${JSON.stringify(r.problems)}`)
    const body = probe.bodies[0] ?? ''
    if (!body.includes('不许页页都动')) fail('提示词没写「不许页页都动」')
    if (!body.includes('scenes')) fail('提示词没要求模型给 scenes')

    const smile = schemeFromJSON({ ...GOOD, scenes: Array.from({ length: pages.length }, () => '') }, '语文', pages.length)
    if (!smile.theme) fail(`整份留白本来合法，却被退：${smile.problems.join('；')}`)
  }

  /* --- 6. 垃圾 JSON：带自己的 Key 时只问一级，回落兜底 --- */
  {
    const probe = fakeLLM(['这不是 JSON，只是一句话'])
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg })
    /* 2026-11-21 改口径（第二十二轮）：**带自己的 Key 时链只有一级**。
       以前这里卡「问遍整条链（不止一级）」，链上补的是本家代理那两个 id；
       硅基流动收到 `deepseek-ai/DeepSeek-V4.1-Flash` 直接 400，真机实测白烧一轮超时，
       界面反而报「网络断了」。自家接口认哪些模型名我们无从知道，所以不追别人家的 id；
       兜底不靠「换个模型再问一遍」，由业务层回落本课兜底纸面（下面 source 那条卡着）。 */
    const asked = probe.bodies.map((b) => {
      try {
        return String((JSON.parse(b || '{}') as { model?: unknown }).model ?? '')
      } catch {
        return ''
      }
    })
    eq('垃圾 JSON：每级只问一次', asked.length, new Set(asked).size)
    eq('垃圾 JSON：带 Key 时只问自己配的那一个', asked, [cfg.model])
    eq('垃圾 JSON：fetch 次数 = 链长', probe.count(), textChain(cfg).length)
    eq('垃圾 JSON：source', r.source, 'builtin')
    eq('垃圾 JSON：attempts', r.attempts, 1)
    const why = r.problems[0] ?? ''
    if (!/没看懂|没回话/.test(why)) fail(`垃圾 JSON 的原因不是人话：「${why}」`)
    if (/JSON|json|502|504|request_id|Insufficient/.test(why)) {
      fail(`垃圾 JSON 的原因里带着英文/状态码：「${why}」`)
    }
  }

  /* --- 6b. 没 Key 走同源代理：链仍是多级（两个 id 服务端都认） --- */
  {
    const probe = fakeLLM(['这不是 JSON，只是一句话'])
    const r = await resolveScheme({ plan: guihuaYu, pages, cfg: noKey })
    const asked = probe.bodies.map((b) => {
      try {
        return String((JSON.parse(b || '{}') as { model?: unknown }).model ?? '')
      } catch {
        return ''
      }
    })
    eq('没 Key：链上不止一级', asked.length >= 2, true)
    eq('没 Key：各级模型互不相同（不许在同一级上重问）', asked.length, new Set(asked).size)
    eq('没 Key：排头换成服务端认得的 id', asked[0], upstreamModel(cfg.model))
    eq('没 Key：fetch 次数 = 链长', probe.count(), asked.length)
    eq('没 Key：source', r.source, 'builtin')
  }

  /* --- 7. 版式落地：AI 排得好就原样用，且整叠仍合格 --- */
  {
    const raw = assignDeckLayouts(
      buildDeck(guihuaYu, allocate(guihuaYu.segments, guihuaYu.meta.duration)),
      GOOD_LAYOUTS
    )
    eq('版式：AI 排得好应原样采用', raw.map((p) => p.layout), GOOD_LAYOUTS.slice(0, raw.length))
    const problems = layoutProblems(raw)
    if (problems.length) fail(`AI 版式落地后不合格：${problems.join('；')}`)

    // 反向：AI 排成「全卡片」要被修补回 3 种 + 每窗口 full
    const flat = assignDeckLayouts(
      buildDeck(guihuaYu, allocate(guihuaYu.segments, guihuaYu.meta.duration)),
      Array.from({ length: raw.length }, () => 'cards')
    )
    const fixed = layoutProblems(flat)
    if (fixed.length) fail(`AI 排成全卡片时没被修补：${fixed.join('；')}`)
  }

  /* --- 8. 提示词：四条硬约束的数值是 SCHEME_LIMITS 本体 --- */
  {
    const { system, user } = schemePrompt(guihuaYu, pages, ['主纸 #8fd42a 彩度 66.7%，要求 ≤ 55%（深纸档）'])
    for (const [label, needle] of [
      ['浅纸下沿', `${SCHEME_LIMITS.lightPaperMin}%`],
      ['浅纸上沿', `${SCHEME_LIMITS.lightPaperMax}%`],
      ['浅纸彩度上限', `${SCHEME_LIMITS.lightPaperChromaMax}%`],
      ['深纸下沿', `${SCHEME_LIMITS.darkPaperMin}%`],
      ['深纸上沿', `${SCHEME_LIMITS.darkPaperMax}%`],
      ['泥色禁区', `${SCHEME_LIMITS.mudMin}%`],
      ['色差下限', `${SCHEME_LIMITS.surfaceGapMin}`],
      ['对比度下限', `${SCHEME_LIMITS.contrastMin}:1`],
    ] as const) {
      if (!system.includes(needle)) fail(`提示词里没写${label} ${needle}`)
    }
    if (!user.includes(`共 ${pages.length} 页`)) fail('提示词没告诉模型这一叠有几页')
    if (!user.includes('上一版被退回')) fail('提示词没把退回原因写回去')
    for (const p of pages) {
      if (!user.includes(`${p.index}. ${p.title}`)) fail(`提示词缺第 ${p.index} 页（${p.title}）`)
    }
    if (/linear-gradient|backdrop-filter/.test(system)) fail('提示词里出现了禁用项')
  }
} finally {
  globalThis.fetch = realFetch
  if (savedWindow === undefined) delete g.window
  else g.window = savedWindow
}

/* ------------------------- 汇总 ------------------------- */

console.log(
  `  没 Key 走代理再兜底 / 一次过 / 打回一次（带原因重问）/ 两次出框回落 / 数学 seal 打回 / 页页都动打回 / 垃圾 JSON 链上各级后回落：各 1 例`
)
console.log(`  版式落地：AI 排得好原样采用（${GOOD_LAYOUTS.length} 页）| 全卡片被修补 | 提示词四条阈值来自 SCHEME_LIMITS`)

if (failures.length) {
  console.error(`\n✗ AI 现场配色 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ AI 现场配色：问 → 判 → 打回 → 兜底、学科红线、版式落地、提示词阈值 全部通过')