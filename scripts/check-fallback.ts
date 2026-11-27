/**
 * TASKS/15 兜底与提速的离线验收（§五 七条）。
 *
 * 全程打桩，不碰真接口；每条都是「把网络弄坏，看成品还在不在」：
 *   ① 空 key 五条路径照样发请求（备课包 / 配纸 / 学生纸 / 点名重做 / 学生版整叠），
 *      且一律落到同源 /api/sf，请求头里一个 Authorization 都没有；
 *   ② 文本链：504 逐级换模型、每换一次 warn 一次、最后抛 FallbackExhausted（不是把状态码摔给界面）；
 *   ③ 402 只调 1 次就停，文案是中文、不含 Insufficient / 402 / request_id；
 *   ④ 生图断连立刻换 Kwai-Kolors/Kolors，两次调用时间差 < 100ms（不退避）；
 *   ⑤ 图上失败不拖垮整份：2 张失败 → 页数不变、那两页无图；6 张全失败 → 提前放弃（请求 < 6）；
 *   ⑥ 全模型 500：学生版仍非空且过校验、备课包交给骨架稿，骨架稿里不许出现课文原文句；
 *   ⑦ 界面源码里 502 / proxy_error / Insufficient / request_id 零命中；
 *   ⑧ 配插画默认关：不带字段 / 'off' / null 一律关，只有 'on' 才算开；且 withDirector
 *      必须在调导演之前就早退（否则开关只是界面上的摆设）。
 *
 * 跑法：npm run check:fallback（tsc + esbuild + node；不新增依赖）
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LessonInput } from '../src/types'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
import { buildDeck } from '../src/lib/deck'
import { allocate } from '../src/lib/timing'
import { DEFAULT_CONFIG, FallbackExhausted, generatePlan, postChatJson, textChain, type LLMConfig } from '../src/lib/llm'
import { resolveScheme } from '../src/lib/scheme'
import { resolveStudentScheme } from '../src/lib/studentScheme'
import { redoPagesWithLLM } from '../src/lib/redo'
import {
  buildStudentSlides,
  getBuiltinStudentSlides,
  illustEnabled,
  validateSlides,
  type StudentSlide,
} from '../src/lib/slides'
import { skeletonPlan } from '../src/lib/skeleton'
import {
  DEFAULT_ILLUST,
  ILLUST_FALLBACK_MODEL,
  ILLUST_MODEL,
  generateIllustration,
  illustCalls,
} from '../src/lib/illustrate'
import { directorReport, isAbstractSlide, runDeckDirector, type DirectPlan } from '../src/lib/director'
import { limitsFor } from '../src/lib/scale'
import { DEFAULT_THEME } from '../src/lib/theme'
import { bytesToDataUrl, encodePng, type RgbaImage } from '../src/lib/watermark'

const errs: string[] = []
const fail = (msg: string): void => {
  errs.push(msg)
}
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

/** 空 key 的配置：评委拿到的默认状态（模型/地址取产品默认），落点必须是同源代理 */
const EMPTY_CFG: LLMConfig = { ...DEFAULT_CONFIG, apiKey: '' }

interface Call {
  url: string
  at: number
  body: string
  headers: Record<string, string>
}

interface Responder {
  ok: boolean
  status?: number
  json?: () => Promise<unknown>
  text?: () => Promise<string>
  arrayBuffer?: () => Promise<ArrayBuffer>
  headers?: { get: (k: string) => string | null }
}

type Handler = (call: Call, init?: RequestInit) => Responder | Promise<Responder>

function stubFetch(handler: Handler): { calls: Call[]; restore: () => void } {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      at: Date.now(),
      body: String(init?.body ?? ''),
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(call)
    return (await handler(call, init)) as unknown as Response
  }) as unknown as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

const chatJson = (json: unknown): Responder => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(json) } }] }),
  text: async () => '',
})

const http = (status: number, body = ''): Responder => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => body,
})

/** 文本走 /api/ds（DeepSeek 官方），生图走 /api/sf（硅基流动）：两条都算“走代理” */
const isProxy = (url: string) => url.startsWith('/api/ds/') || url.startsWith('/api/sf/')
const hasAuth = (call: Call) => Object.keys(call.headers).some((k) => k.toLowerCase() === 'authorization')

/* ------------------------- ① 空 key 五条路径 ------------------------- */

async function sectionOne(): Promise<void> {
  const plan = planForScale(guihuaYu, 240)
  const deck = buildDeck(plan, allocate(plan.segments, plan.meta.duration))
  const pages = [{ index: 1, kind: 'cover', title: String(deck[0]?.title ?? '桂花雨') }]
  const input: LessonInput = {
    topic: guihuaYu.meta.topic,
    subject: guihuaYu.meta.subject,
    stage: guihuaYu.meta.stage,
    grade: guihuaYu.meta.grade,
    period: guihuaYu.meta.period,
    textbook: guihuaYu.meta.textbook,
    duration: 240,
  }

  // 所有接口回一段空 JSON：业务层当然会退回兜底，这里只看「请求有没有真的发出去」
  const stub = stubFetch(() => chatJson({}))
  const paths: [string, () => Promise<unknown>][] = [
    ['备课包', () => generatePlan(input, EMPTY_CFG)],
    ['配纸', () => resolveScheme({ plan, pages, cfg: EMPTY_CFG })],
    ['学生纸', () => resolveStudentScheme({ plan, pages, lessonTheme: DEFAULT_THEME, cfg: EMPTY_CFG })],
    ['点名重做', () => redoPagesWithLLM({ pages: deck, targets: [1], fresh: deck, plan, cfg: EMPTY_CFG })],
    ['学生版整叠', () => buildStudentSlides(plan, EMPTY_CFG)],
  ]
  const tally: string[] = []
  for (const [name, run] of paths) {
    const before = stub.calls.length
    try {
      await run()
    } catch {
      // 业务层退回兜底是预期：这里只数请求
    }
    const mine = stub.calls.slice(before)
    if (mine.length === 0) fail(`① 空 key：${name}一次请求都没发（业务层还在看浏览器里有没有 key）`)
    const offProxy = mine.filter((c) => !isProxy(c.url))
    if (offProxy.length > 0) fail(`① 空 key：${name}有 ${offProxy.length} 次请求没走同源代理（${offProxy[0].url}）`)
    const authed = mine.filter(hasAuth)
    if (authed.length > 0) fail(`① 空 key：${name}带着 Authorization 发了 ${authed.length} 次（服务端注入的头顶不下来）`)
    tally.push(`${name} ${mine.length} 次`)
  }
  stub.restore()
  ok('① 空 key 五条路径都发请求', `${tally.join(' | ')} | 全部同源代理、零 Authorization`)
}

/* ------------------------- ② 文本链 ------------------------- */

async function sectionTwo(): Promise<void> {
  const warns: string[] = []
  const realWarn = console.warn
  console.warn = (...args: unknown[]) => warns.push(args.map(String).join(' '))
  const stub = stubFetch(() => http(504, '{"error":{"message":"upstream timeout"}}'))
  let thrown: unknown = null
  try {
    await postChatJson([{ role: 'user', content: 'hi' }], EMPTY_CFG)
  } catch (e) {
    thrown = e
  }
  stub.restore()
  console.warn = realWarn

  const models = stub.calls.map((c) => String((JSON.parse(c.body || '{}') as { model?: string }).model ?? ''))
  /* 链长不写死：TEXT_CHAIN 一收一放都要跟着变，所以期望值直接读 textChain()。 */
  const want = textChain(EMPTY_CFG)
  const switches = Math.max(0, want.length - 1)
  if (stub.calls.length !== want.length) {
    fail(`② 文本链：504 应逐级试完 ${want.length} 级，实得 ${stub.calls.length} 次（${models.join(' → ')}）`)
  }
  if (models.join('|') !== want.join('|')) {
    fail(`② 文本链：模型顺序不对 —— 实得 ${models.join(' → ')}，应为 ${want.join(' → ')}`)
  }
  if (warns.length !== switches) fail(`② 文本链：换模型前应 warn ${switches} 次，实得 ${warns.length} 次（${warns.join(' / ')}）`)
  if (warns.some((w) => !w.startsWith('[fallback] 文本'))) fail(`② 文本链：warn 文案不是约定的那行 —— ${warns[0] ?? '（空）'}`)
  if (warns.some((w) => !/http 504/.test(w))) fail('② 文本链：warn 里没有换模型原因（应为 timeout / http 504）')
  if (!(thrown instanceof FallbackExhausted)) {
    fail(`② 文本链：全挂应抛 FallbackExhausted，实得 ${thrown instanceof Error ? thrown.name : String(thrown)}`)
  } else if (/502|504|request_id|Insufficient/.test(thrown.message)) {
    fail(`② 文本链：抛给界面的话里带着状态码/英文（${thrown.message}）`)
  }
  ok('② 文本链', `${want.length} 级各 1 次（${models.map((m) => m.split('/').pop()).join(' → ')}）| warn ${switches} 次 | 收尾 FallbackExhausted 中文`)
}

/* ------------------------- ③ 402 不换 ------------------------- */

async function sectionThree(): Promise<void> {
  const stub = stubFetch(() => http(402, '{"error":{"message":"Insufficient Balance"}}'))
  let message = ''
  try {
    await postChatJson([{ role: 'user', content: 'hi' }], EMPTY_CFG)
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  stub.restore()
  if (stub.calls.length !== 1) fail(`③ 402：应只调 1 次就停，实得 ${stub.calls.length} 次`)
  if (/Insufficient|402|request_id|quota/i.test(message)) fail(`③ 402：界面文案里还有英文/状态码 —— ${message}`)
  if (!/额度/.test(message)) fail(`③ 402：文案没说清是额度用完了 —— ${message}`)
  ok('③ 402 直接停', `1 次调用 | 文案「${message}」`)
}

/* ------------------------- ④ 生图两级退让 ------------------------- */

/** 一张 64×64 的纯纸色 PNG：只为让「换备用模型」这条路走完 */
async function paperPng(): Promise<string> {
  const width = 64
  const height = 64
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 250
    pixels[i + 1] = 248
    pixels[i + 2] = 243
    pixels[i + 3] = 255
  }
  const img: RgbaImage = { width, height, pixels }
  return bytesToDataUrl(await encodePng(img))
}

async function sectionFour(): Promise<void> {
  const b64 = (await paperPng()).split(',')[1]
  let imageCalls = 0
  const times: number[] = []
  const models: string[] = []
  const stub = stubFetch((call) => {
    if (call.url.includes('/images/generations')) {
      imageCalls += 1
      times.push(call.at)
      models.push(String((JSON.parse(call.body || '{}') as { model?: string }).model ?? ''))
      if (imageCalls === 1) throw new Error('fetch failed')
      return { ok: true, status: 200, json: async () => ({ images: [{ b64_json: b64 }] }), text: async () => '' }
    }
    return http(500, '')
  })
  const out = await generateIllustration('a child under a tree, wide empty space on the left', {
    ...DEFAULT_ILLUST,
    apiKey: '',
    // 这一段验的是「位图生图两级」，矢量那条路在 check:vector 里单独验
    engine: 'photo',
  })
  stub.restore()

  if (!out.ok) fail(`④ 生图两级：备用模型也没交图 —— ${out.error ?? ''}`)
  if (models[0] !== ILLUST_MODEL) fail(`④ 生图两级：第一次应打 ${ILLUST_MODEL}，实得 ${models[0] ?? '（无）'}`)
  if (models[1] !== ILLUST_FALLBACK_MODEL) fail(`④ 生图两级：第二次应打 ${ILLUST_FALLBACK_MODEL}，实得 ${models[1] ?? '（无）'}`)
  const gap = times.length >= 2 ? times[1] - times[0] : 9999
  if (gap >= 100) fail(`④ 生图两级：断连后 ${gap}ms 才换备用模型，应 < 100ms（不许退避）`)
  ok('④ 生图两级', `${models.map((m) => m.split('/').pop()).join(' → ')} | 间隔 ${gap}ms | 成图`)
}

/* ------------------------- ⑤ 图上失败不拖垮整份 ------------------------- */

interface DirectorStub {
  slides: StudentSlide[]
  direct: DirectPlan
}

function directorStub(count: number): DirectorStub {
  const plan = planForScale(guihuaYu, 2400)
  const slides = getBuiltinStudentSlides(plan, limitsFor(undefined, 'lesson', 2400))
  /* 只点名「会画」的页：目标 / 作业 / 纯指令页本来就 draw:false（isAbstractSlide），
     从前写死的 [1..6] 现在已经落到四张抽象页上，「两张失败」就变成一个空用例。 */
  const picks: number[] = []
  for (let i = 0; i < slides.length && picks.length < count; i += 1) {
    if (!isAbstractSlide(slides[i])) picks.push(i)
  }
  const pages = slides.map((_, i) => ({
    i,
    draw: picks.includes(i),
    brief: `scene brief of page ${i + 1}`,
    empty: (picks.indexOf(i) % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
    why: '',
  }))
  return { slides, direct: { pages, look: 'one child under an osmanthus tree' } }
}

function planCache(direct: DirectPlan) {
  return {
    async load() {
      return { direct, typeset: null as never }
    },
    async save() {
      /* 不落盘 */
    },
  }
}

function artCache() {
  return {
    async load() {
      return new Map<number, string>()
    },
    async save() {
      /* 不落盘 */
    },
  }
}

function directorHandler(broken: (n: number) => boolean, b64: string): Handler {
  return (call) => {
    if (call.url.includes('/images/generations')) {
      const prompt = String((JSON.parse(call.body || '{}') as { prompt?: string }).prompt ?? '')
      const hit = /scene brief of page (\d+)/.exec(prompt)
      const n = hit ? Number(hit[1]) : 0
      if (broken(n)) return http(503, 'busy')
      return { ok: true, status: 200, json: async () => ({ images: [{ b64_json: b64 }] }), text: async () => '' }
    }
    // 第二遍：给一叠合法但保守的版式（净化会自己纠正）
    const body = JSON.parse(call.body || '{}') as { messages?: { role: string; content: string }[] }
    const user = JSON.parse(body.messages?.find((m) => m.role === 'user')?.content ?? '{}') as {
      pages?: { i: number }[]
    }
    const rows = (user.pages ?? []).map((p) => ({
      i: p.i,
      artSide: 'left',
      textSide: 'left',
      items: 3,
      drop: [],
      layout: 'cards',
    }))
    return chatJson({ pages: rows })
  }
}

async function runDirector(broken: (n: number) => boolean): Promise<{
  slides: StudentSlide[]
  length: number
  images: number
  drawn: number
  failures: number
  requestCount: number
}> {
  const { slides, direct } = directorStub(6)
  const b64 = (await paperPng()).split(',')[1]
  const stub = stubFetch(directorHandler(broken, b64))
  const beforeImages = illustCalls()
  const out = await runDeckDirector({
    slides,
    cfg: {
      llm: EMPTY_CFG,
      image: { baseUrl: DEFAULT_ILLUST.baseUrl, apiKey: '', model: ILLUST_MODEL, engine: 'photo' },
    },
    meta: {
      topic: '桂花雨',
      grade: '五年级',
      subject: '语文',
      duration: 2400,
      allow: 6,
      paper: () => '#faf8f3',
    },
    cache: { plan: planCache(direct), art: artCache() },
  })
  const images = illustCalls() - beforeImages
  const requestCount = stub.calls.filter((c) => c.url.includes('/images/generations')).length
  stub.restore()
  const report = directorReport()
  return {
    slides: out.slides,
    length: slides.length,
    images,
    drawn: report.drawn,
    failures: report.failures.length,
    requestCount,
  }
}

async function sectionFive(): Promise<void> {
  /* 失败只落在「会画」的页上：目标页 / 作业页 / 纯指令页本来就 draw:false（isAbstractSlide），
     拿它们当失败页等于测了个空——而「连续两张失败就收手」正是拿真会画的页在数的。 */
  const probe = directorStub(6)
  const drawable = probe.direct.pages
    .filter((p) => p.draw && !isAbstractSlide(probe.slides[p.i]))
    .map((p) => p.i + 1)
  const broken = new Set(drawable.slice(0, 2))
  console.log(
    '  [⑤ 探针] 点名的页：' +
      probe.direct.pages
        .filter((p) => p.draw)
        .map((p) => `${p.i + 1}·${probe.slides[p.i]?.kind}「${probe.slides[p.i]?.title}」${isAbstractSlide(probe.slides[p.i]) ? '抽象' : '会画'}`)
        .join(' | ')
  )
  if (broken.size < 2) fail(`⑤ 素材：只有 ${drawable.length} 页会画，凑不出「两张失败」`)

  // A：只坏两张 —— 页数一页不许少，坏掉的那两页没有图，其余照常
  const a = await runDirector((n) => broken.has(n))
  if (a.slides.length !== a.length) fail(`⑤ 两张失败：页数从 ${a.length} 变成 ${a.slides.length}`)
  if (a.failures !== broken.size) fail(`⑤ 两张失败：失败页应正好 ${broken.size} 张，实得 ${a.failures}`)
  const badPages = [...broken].filter((n) => a.slides[n - 1]?.illustration)
  if (badPages.length > 0) fail(`⑤ 两张失败：坏掉的第 ${badPages.join('、')} 页还带着图`)
  const withArt = a.slides.filter((s) => s.illustration).length
  if (withArt !== a.drawn) fail(`⑤ 两张失败：带图 ${withArt} 页，回执说 ${a.drawn} 页`)
  if (a.drawn < 1) fail('⑤ 两张失败：一张都没画出来，用例本身写坏了')
  const check = validateSlides(a.slides, limitsFor(undefined, 'lesson', 2400))
  if (!check.ok) fail(`⑤ 两张失败：整份过不了导出校验 —— ${check.problems[0]}`)

  // B：六张全坏 —— 必须提前放弃（注意：一张图失败 = 主模型 + 备用模型两次请求，
  // 所以这里数「失败页数」而不是请求数，请求数天然是页数的两倍量级）
  const b = await runDirector((n) => n >= 1)
  if (b.slides.length !== b.length) fail(`⑤ 全失败：页数从 ${b.length} 变成 ${b.slides.length}`)
  if (b.failures >= 6) fail(`⑤ 全失败：六页全撞完了（${b.failures} 页），连续 2 张失败就该收手`)
  if (b.slides.some((s) => s.illustration)) fail('⑤ 全失败：还有页带着图（应整份无图版式）')

  ok(
    '⑤ 图上失败不拖垮整份',
    `坏 ${broken.size} 张（第 ${[...broken].join('、')} 页，全是会画的页）→ 页数 ${a.slides.length} 不变、那 ${broken.size} 页无图、另 ${a.drawn} 页照常 | 全坏 → 只撞了 ${b.failures} 页（<6）、整份无图`
  )
}

/* ------------------------- ⑥ 全挂仍交付 ------------------------- */

async function sectionSix(): Promise<void> {
  const input: LessonInput = {
    topic: '司马光',
    subject: '语文',
    stage: '小学',
    grade: '三年级',
    period: '第一课时',
    textbook: '部编版',
    duration: 240,
  }
  const stub = stubFetch(() => http(500, 'Internal Server Error'))
  let planError: unknown = null
  try {
    await generatePlan(input, EMPTY_CFG)
  } catch (e) {
    planError = e
  }
  // 界面那条路：备课包拿不到 → 落骨架稿 → 学生版从骨架稿出（而不是拿内置桂花雨顶）
  const skeleton = skeletonPlan(input)
  const slides = await buildStudentSlides(skeleton, EMPTY_CFG)
  stub.restore()

  if (!(planError instanceof FallbackExhausted)) {
    fail(`⑥ 全挂：备课包应以 FallbackExhausted 收场（界面据此落骨架稿），实得 ${String(planError)}`)
  }
  if (slides.length === 0) fail('⑥ 全挂：学生版一页都没有')
  const check = validateSlides(slides, limitsFor(undefined, 'clip', 240))
  if (!check.ok) fail(`⑥ 全挂：学生版过不了校验 —— ${check.problems[0]}`)

  if (!skeleton.segments || skeleton.segments.length < 4) {
    fail(`⑥ 全挂：骨架稿只给了 ${skeleton.segments?.length ?? 0} 段`)
  }
  const text = skeleton.segments.map((s) => `${s.script}${s.goal}${s.teacher}${s.student}`).join(' ')
  /* TASKS/17 §一：这一叠就是模型没接上时老师手里的稿子，不许留占位符。
     说明只留在结果页顶部那一句（App.tsx），页内任何字段都不许再挂。 */
  const whole = JSON.stringify(skeleton)
  if (/接上模型|自动补|等填|（框架稿）|_{4,}/.test(whole)) {
    const hit = (whole.match(/接上模型|自动补|等填|（框架稿）|_{4,}/) ?? [''])[0]
    fail(`⑥ 全挂：骨架稿里还留着占位符「${hit}」——这一叠是给老师直接念的，不是空架子`)
  }
  const speechText = (skeleton.speech ?? []).map((s) => s.text).join(' ')
  for (const sec of ['说学情', '说目标']) {
    const one = (skeleton.speech ?? []).find((s) => s.section === sec)
    if (!one || !/。$/.test(one.text.trim()) || one.text.trim().length < 20) {
      fail(`⑥ 全挂：${sec}不是一句能念出口的完整话（实得「${one?.text ?? '缺'}」）`)
    }
  }
  for (const s of skeleton.segments) {
    if (!/。$/.test(String(s.script ?? '').trim())) fail(`⑥ 全挂：环节「${s.name}」的口播不是完整句子`)
  }
  if (!speechText.includes(String(skeleton.meta.topic))) fail('⑥ 全挂：说课稿没提到这一课的课题')
  const invented = ['摇桂花', '桂花雨', '父亲', '爬月台'].filter((w) => text.includes(w))
  if (invented.length > 0) fail(`⑥ 全挂：骨架稿里编出了课文内容（${invented.join('、')}）`)
  const visible = slides.flatMap((s) => [s.title ?? '', s.line ?? '', ...(s.items ?? [])]).join(' ')
  if (/摇桂花|桂花雨/.test(visible)) fail('⑥ 全挂：学生版页面上出现了课文原文句')

  ok(
    '⑥ 全挂仍交付',
    `备课包 → FallbackExhausted | 骨架稿 ${skeleton.segments.length} 段（零占位符、零课文原文，每段口播整句收尾）| 学生版 ${slides.length} 页过校验`
  )
}

/* ------------------------- ⑦ 界面禁词 ------------------------- */

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name.name)) out.push(p)
  }
  return out
}

function sectionSeven(): void {
  const files = ['src/App.tsx', ...walk('src/components', [])]
  const banned = ['502', 'proxy_error', 'Insufficient', 'request_id']
  const hits: string[] = []
  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    for (const w of banned) {
      if (raw.includes(w)) hits.push(`${file}: ${w}`)
    }
  }
  if (hits.length > 0) fail(`⑦ 界面禁词：${hits.join(' / ')}`)
  ok('⑦ 界面禁词', `${files.length} 个文件扫过，502 / proxy_error / Insufficient / request_id 零命中`)
}

/* ------------------------- ⑧ 配插画默认关 ------------------------- */

function sectionEight(): void {
  const cases: [string, boolean, boolean][] = [
    ['不带这个字段', illustEnabled({}), false],
    ['显式 off', illustEnabled({ illust: 'off' }), false],
    ['显式 on', illustEnabled({ illust: 'on' }), true],
    ['整个配置为空', illustEnabled(null), false],
  ]
  const bad = cases.filter(([, got, want]) => got !== want)
  if (bad.length) fail(`⑧ 默认关判错：${bad.map(([n]) => n).join(' / ')}`)
  /* 源码守卫：早退必须在 runDeckDirector 之前，否则「默认关」只在界面上成立 */
  const raw = readFileSync('src/lib/slides.ts', 'utf8')
  const at = raw.indexOf('async function withDirector(')
  const body = at >= 0 ? raw.slice(at, at + 1600) : ''
  const guard = body.indexOf('illustEnabled(cfg)')
  const run = body.indexOf('runDeckDirector')
  const early = guard >= 0 && run >= 0 && guard < run
  if (!early) fail('⑧ withDirector 没有在调用 runDeckDirector 之前早退')
  if (!bad.length && early) ok('⑧ 配插画默认关', '4 种取值判对；withDirector 在导演之前早退（不请求、不报错、不挂提示）')
}

/* --------------------------------- 主流程 --------------------------------- */

async function main(): Promise<void> {
  // llm.ts 用 window.setTimeout 做超时；Node 里没有 window，临时垫一下
  const g = globalThis as unknown as { window?: unknown }
  const saved = g.window
  g.window = globalThis
  try {
    await sectionOne()
    await sectionTwo()
    await sectionThree()
    await sectionFour()
    await sectionFive()
    await sectionSix()
    sectionSeven()
    sectionEight()
  } finally {
    if (saved === undefined) delete g.window
    else g.window = saved
  }

  if (errs.length > 0) {
    console.error(`\n✗ 兜底 ${errs.length} 处不合格：`)
    for (const e of errs) console.error(`  · ${e}`)
    process.exit(1)
  }
  console.log('\n全部通过。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})