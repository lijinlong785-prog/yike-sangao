/**
 * TASKS/26 校验：矢量插画（DeepSeek 写 SVG → 栅格化 PNG → 进课件）。
 *
 * 六段，任何一段不过就非零退出：
 *   A 提示词 —— 禁字条款、画布尺寸、留空侧三样都在，一个不缺
 *   B 净化   —— 围栏能剥、带 text / image / 外部引用的整段拒收、根标签尺寸被重写
 *   C 栅格化 —— 一段真 SVG 出 1024×576 的 PNG，非纸色像素有但不糊满，判字为「不带字」
 *   D 接入   —— 导演打桩跑一遍：图全由矢量出、位图接口 0 次、带图页数与 allow 一致、
 *              页面仍过导出校验（矢量不是旁路，是主路）
 *   E 双双失败 —— 矢量与生图都没成时返回 ok:false，两条原因都写清，不抛
 *   F 免费优先 —— 默认口径第一枪是免费的 Kolors、画崩才轮到付费 Z-Image；402 之后绝不越级花钱
 */
import { DEFAULT_THEME } from '../src/lib/theme'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
import { limitsFor } from '../src/lib/scale'
import { getBuiltinStudentSlides, validateSlides } from '../src/lib/slides'
import {
  DEFAULT_ILLUST,
  ILLUST_BAILIAN_MODEL,
  ILLUST_FREE_MODEL,
  ILLUST_MODEL,
  generateIllustration,
  illustCalls,
} from '../src/lib/illustrate'
import {
  VECTOR_H,
  VECTOR_MODEL,
  VECTOR_W,
  generateVectorArt,
  rasterizeSvg,
  resetVectorCalls,
  sanitizeSvg,
  svgShapes,
  vectorCalls,
  vectorMessages,
} from '../src/lib/vector'
import { measureArt, type ArtNumbers } from '../src/lib/inspect'
import { decodePng, dataUrlToBytes } from '../src/lib/watermark'
import {
  isAbstractSlide,
  runDeckDirector,
  sanitizeDirect,
  type DirectPlan,
  type TypesetPlan,
} from '../src/lib/director'

const errs: string[] = []
function fail(msg: string): void {
  errs.push(msg)
}
function ok(msg: string, detail = ''): void {
  console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
}

/* ------------------------------ 打桩 ------------------------------ */

interface Responder {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}

const chatText = (text: string): Responder => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
  text: async () => '',
})

const http = (status: number, body = ''): Responder => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => body,
})

function stubFetch(handler: (url: string, body: string) => Responder | Promise<Responder>) {
  const original = globalThis.fetch
  const urls: string[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    urls.push(String(url))
    return (await handler(String(url), String(init?.body ?? ''))) as unknown as Response
  }) as unknown as typeof fetch
  return { urls, restore: () => (globalThis.fetch = original) }
}

/** 打桩画的图：一块纸、一个绿块、一个暖圆、一条线。颜色都不许是中性深色（判字会误伤） */
function mockSvg(empty: 'left' | 'right'): string {
  const x = empty === 'left' ? 610 : 110
  return [
    `<svg viewBox="0 0 1024 576">`,
    `<rect x="0" y="0" width="1024" height="576" fill="#faf8f3"/>`,
    `<rect x="${x}" y="130" width="290" height="330" rx="26" fill="#8a9a7b"/>`,
    `<circle cx="${x + 86}" cy="210" r="46" fill="#c2a06b"/>`,
    `<path d="M${x} 470 C ${x + 70} 410, ${x + 210} 510, ${x + 290} 450" fill="none" stroke="#5a6a5e" stroke-width="4" stroke-linecap="round"/>`,
    `</svg>`,
  ].join('')
}

/* --------------------------------- A 段 --------------------------------- */

function sectionA(): void {
  const brief = 'one child under an osmanthus branch, wide empty space on the left'
  const msgs = vectorMessages(brief, { paper: '#faf8f3', empty: 'left' })
  const all = msgs.map((m) => m.content).join('\n')
  const checks: [string, RegExp][] = [
    ['根标签与画布尺寸', new RegExp(`viewBox="0 0 ${VECTOR_W} ${VECTOR_H}"`)],
    ['禁 text/tspan', /禁止 text、tspan/],
    ['禁 image/foreignObject', /image、foreignObject/],
    ['禁外部引用', /href/],
    ['禁任何字', /一个汉字、一个字母/],
    ['元素数量上限', /15–45/],
    ['留空侧写进构图', /主体画在左半边/],
    ['英文 brief 原样带进去', /osmanthus branch/],
  ]
  const bad = checks.filter(([, re]) => !re.test(all)).map(([name]) => name)
  if (bad.length) fail(`A 提示词：缺 ${bad.join(' / ')}`)
  if (msgs.length !== 2) fail(`A 提示词：应两句（system + user），实得 ${msgs.length}`)
  const right = vectorMessages(brief, { empty: 'right' }).map((m) => m.content).join('\n')
  if (!/主体画在右半边/.test(right)) fail('A 提示词：留空侧换了，构图没跟着换')
  ok('A 提示词', '禁字 / 画布 / 留空侧 / brief 四项齐全')
}

/* --------------------------------- B 段 --------------------------------- */

function sectionB(): void {
  // 1. 围栏剥得掉
  const fenced = '```xml\n' + mockSvg('right') + '\n```'
  const one = sanitizeSvg(fenced)
  if (!one) fail('B 净化：包在 ``` 里的合法 SVG 被误杀')
  else {
    if (!one.startsWith('<svg')) fail('B 净化：围栏没剥干净')
    if (!new RegExp(`width="${VECTOR_W}" height="${VECTOR_H}"`).test(one)) fail('B 净化：根标签尺寸没重写')
    if (!one.includes('xmlns="http://www.w3.org/2000/svg"')) fail('B 净化：命名空间没补上')
  }
  // 2. 带字的一律拒收
  const withText = mockSvg('right').replace('<rect', '<text x="10" y="20">桂花雨</text><rect')
  if (sanitizeSvg(withText) !== null) fail('B 净化：带 <text> 的 SVG 被放行了')
  // 3. 外链图片拒收
  const withImage = mockSvg('right').replace('<rect', '<image href="https://x/y.png"/><rect')
  if (sanitizeSvg(withImage) !== null) fail('B 净化：带 <image> 的 SVG 被放行了')
  // 4. 没有形状的空壳拒收
  if (sanitizeSvg('<svg viewBox="0 0 10 10"></svg>') !== null) fail('B 净化：空 SVG 被放行了')
  // 5. 不是 SVG 的闲话拒收
  if (sanitizeSvg('好的，这是你要的图：') !== null) fail('B 净化：一段闲话被当成了 SVG')
  // 6. 形状计数认得出来
  const n = svgShapes(mockSvg('left'))
  if (n < 4) fail(`B 净化：形状计数不对（${n}）`)
  ok('B 净化', `围栏可剥 | text / image / 空壳 / 闲话四类拒收 | 认出 ${n} 笔`)
}

/* --------------------------------- C 段 --------------------------------- */

async function sectionC(): Promise<ArtNumbers | null> {
  const svg = sanitizeSvg(mockSvg('left'))
  if (!svg) {
    fail('C 栅格化：净化后拿不到 SVG')
    return null
  }
  const dataUrl = await rasterizeSvg(svg)
  if (!dataUrl) {
    fail('C 栅格化：resvg 没出图（@resvg/resvg-js 装了吗）')
    return null
  }
  const bytes = dataUrlToBytes(dataUrl)
  const img = bytes ? await decodePng(bytes) : null
  if (!img) {
    fail('C 栅格化：出的不是可解码的 PNG')
    return null
  }
  if (img.width !== VECTOR_W || img.height !== VECTOR_H) {
    fail(`C 栅格化：尺寸应是 ${VECTOR_W}×${VECTOR_H}，实得 ${img.width}×${img.height}`)
  }
  const nums = await measureArt(dataUrl, '#faf8f3')
  if (!nums) {
    fail('C 栅格化：量不回这张图的数')
    return null
  }
  if (nums.textRisk) fail(`C 栅格化：几何图形被误判成带字（glyph≈${Math.round(nums.glyph)}）`)
  if (nums.ink <= 0.02) fail(`C 栅格化：画面几乎空白（ink=${nums.ink.toFixed(3)}）`)
  if (nums.empty !== 'left') fail(`C 栅格化：主体在右，实测更空的一侧应是 left，实得 ${nums.empty}`)
  ok(
    'C 栅格化',
    `${img.width}×${img.height} PNG | ink ${nums.ink.toFixed(2)} | 空侧 ${nums.empty} | glyph ${Math.round(nums.glyph)}`
  )
  return nums
}

/* --------------------------------- D 段 --------------------------------- */

function directorHandler(allow: number) {
  return (url: string, body: string): Responder => {
    if (url.includes('/images/generations')) {
      // 矢量成了就不该再打这条：真打了说明主路没走对
      return http(500, '不应调用生图接口')
    }
    const parsed = JSON.parse(body || '{}') as { messages?: { role: string; content: string }[] }
    const system = parsed.messages?.find((m) => m.role === 'system')?.content ?? ''
    if (/矢量画师/.test(system)) {
      // 这一条是矢量请求：回一段合法 SVG（故意包 ```，顺带验净化）
      const brief = parsed.messages?.find((m) => m.role === 'user')?.content ?? ''
      const empty = /empty space on the left/i.test(brief) ? 'left' : 'right'
      return chatText('```svg\n' + mockSvg(empty) + '\n```')
    }
    const user = JSON.parse(parsed.messages?.find((m) => m.role === 'user')?.content ?? '{}') as {
      pages?: { i: number; kind: string; title: string; line?: string; items?: string[] }[]
    }
    const pages = user.pages ?? []
    if (system.includes('导演')) {
      const free = pages.filter((p) =>
        !isAbstractSlide({ ...p, line: p.line ?? '', items: p.items ?? [] })
      )
      const step = Math.max(1, Math.floor(free.length / allow))
      const picks = new Set<number>()
      for (let k = 0; k < allow && k * step < free.length; k++) picks.add(free[k * step].i)
      const out = pages.map((p, k) =>
        picks.has(p.i)
          ? {
              i: p.i,
              draw: true,
              brief: `one child under a branch, subject occupies the ${
                k % 2 === 0 ? 'left' : 'right'
              } half, wide empty space on the ${k % 2 === 0 ? 'right' : 'left'}`,
              empty: k % 2 === 0 ? 'right' : 'left',
              why: '门禁',
            }
          : { i: p.i, draw: false, brief: '', empty: 'right', why: '' }
      )
      return chatText(JSON.stringify({ pages: out, look: 'one child, one branch' }))
    }
    const out = pages.map((p) => ({ i: p.i, artSide: 'left', textSide: 'left', items: 2, drop: [], layout: 'cards' }))
    return chatText(JSON.stringify({ pages: out }))
  }
}

async function sectionD(): Promise<void> {
  const plan = planForScale(guihuaYu, 2400)
  const slides = getBuiltinStudentSlides(plan, limitsFor(undefined, 'lesson', 2400))
  if (slides.length === 0) {
    fail('D 接入：取不到内置页面')
    return
  }
  const allow = 3
  /* llm.ts 的 requestChat 用 window.setTimeout 做超时；Node 里没有 window，临时垫一下
     （与 check-illust / check-fallback 同一套垫法，跑完就还回去） */
  const g = globalThis as unknown as { window?: unknown }
  const savedWindow = g.window
  g.window = globalThis
  const stub = stubFetch(directorHandler(allow))
  resetVectorCalls()
  const imagesBefore = illustCalls()
  const out = await runDeckDirector({
    slides,
    cfg: {
      llm: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-mock', model: 'deepseek-chat' },
      // 这一段验的是「矢量是主路」：把引擎钉死在 vector，免得默认口径换了就把主路测丢了
      image: { ...DEFAULT_ILLUST, apiKey: 'sf-mock', engine: 'vector' as const },
    },
    meta: {
      topic: plan.meta.topic,
      grade: plan.meta.grade,
      subject: plan.meta.subject,
      duration: plan.meta.duration,
      paper: () => '#faf8f3',
      allow,
    },
    cache: { plan: { load: async () => null, save: async () => {} }, art: { load: async () => new Map(), save: async () => {} } },
  })
  const vector = vectorCalls()
  const photo = illustCalls() - imagesBefore
  const imageHits = stub.urls.filter((u) => u.includes('/images/generations')).length
  stub.restore()
  if (savedWindow === undefined) delete g.window
  else g.window = savedWindow

  const drawn = out.slides.filter((s) => s.illustration).length
  if (drawn !== allow) fail(`D 接入：带图页应 ${allow} 页，实得 ${drawn}`)
  if (vector !== allow) fail(`D 接入：矢量应画 ${allow} 张，实得 ${vector}`)
  if (photo !== 0 || imageHits !== 0) fail(`D 接入：矢量成了还去打了位图生图（${photo} 次 / ${imageHits} 次）`)
  const check = validateSlides(out.slides, limitsFor(undefined, 'lesson', 2400))
  if (!check.ok) fail(`D 接入：配图后的页面过不了导出校验（${check.problems[0]}）`)
  // 图确实落到了页面上，而且每张都能解码
  const bad = out.slides.filter((s) => s.illustration && !String(s.illustration).startsWith('data:image/png'))
  if (bad.length) fail(`D 接入：有 ${bad.length} 页的图不是 PNG dataUrl`)
  ok('D 接入', `矢量 ${vector} 张 / 位图 ${photo} 次 | 带图 ${drawn} 页 | 页面过校验`)
}

/* --------------------------------- E 段 --------------------------------- */

async function sectionE(): Promise<void> {
  const stub = stubFetch(() => http(401, '{"message":"invalid token"}'))
  const out = await generateIllustration('one child under a branch, wide empty space on the left', {
    ...DEFAULT_ILLUST,
    apiKey: '',
  })
  stub.restore()
  if (out.ok) fail('E 双双失败：401 反而交出了一张图')
  else {
    if (!/矢量：/.test(out.error ?? '')) fail('E 双双失败：错误里没写矢量那条路怎么了')
    if (!/生图：|主模型：/.test(out.error ?? '')) fail('E 双双失败：错误里没写生图那条路怎么了')
  }
  // 模型名：矢量第一级必须是 V4.1-Flash，生图仍是 Z-Image-Turbo
  if (VECTOR_MODEL !== 'deepseek-ai/DeepSeek-V4.1-Flash') fail(`E：矢量默认模型应是 V4.1-Flash，实得 ${VECTOR_MODEL}`)
  if (ILLUST_MODEL !== 'Tongyi-MAI/Z-Image-Turbo') fail(`E：生图模型被改了（${ILLUST_MODEL}）`)
  if (DEFAULT_THEME.paper === '') fail('E：默认纸色不该为空')
  ok('E 双双失败', `401 时两句话都交代清楚 | 矢量 ${VECTOR_MODEL.split('/').pop()} / 生图 ${ILLUST_MODEL.split('/').pop()}`)
}

/* --------------------------------- F 段 --------------------------------- */

/**
 * 默认口径改成「免费优先」之后，钱不能自己往外跑（TASKS/26 续）：
 *   F1 免费那张（Kolors）必须是第一枪，付费那张（Z-Image）只排在它后面；
 *   F2 免费那张 402 欠费时，绝不越级去打付费那张，直接退回矢量出图。
 */
async function sectionF(): Promise<void> {
  const g = globalThis as unknown as { window?: unknown }
  const savedWindow = g.window
  g.window = globalThis
  try {
    /* F1：整条位图链路都 500（画崩了，不是欠费也不是限速）→ 该按 券抵 → 免费 → 付费 的顺序打三枪 */
    const seen: string[] = []
    const stub = stubFetch((url, body) => {
      if (url.includes('/images/generations')) {
        seen.push(String((JSON.parse(body || '{}') as { model?: string }).model ?? ''))
        return http(500, '{"message":"画崩了"}')
      }
      return http(500, '矢量也崩')
    })
    const out = await generateIllustration('one child under a branch, wide empty space on the left', {
      ...DEFAULT_ILLUST,
      apiKey: 'sf-mock',
    })
    stub.restore()
    if (out.ok) fail('F 免费优先：全 500 反而交出了一张图')
    if (seen[0] !== ILLUST_BAILIAN_MODEL) {
      fail(`F 免费优先：第一枪应是券抵的 ${ILLUST_BAILIAN_MODEL}，实得 ${seen[0] || '没打'}`)
    }
    if (seen[1] !== ILLUST_FREE_MODEL) {
      fail(`F 免费优先：百炼画崩了才该轮到免费的 ${ILLUST_FREE_MODEL.split('/').pop()}，实得 ${seen[1] || '没打'}`)
    }
    if (seen[2] !== ILLUST_MODEL) {
      fail(`F 免费优先：免费那张也崩了才该轮到付费的 ${ILLUST_MODEL.split('/').pop()}，实得 ${seen[2] || '没打'}`)
    }

    /* F2：免费那张 402（欠费）→ 一笔钱都不许花，退回矢量把图画出来 */
    const paid: string[] = []
    const stub2 = stubFetch((url, body) => {
      if (url.includes('/images/generations')) {
        paid.push(String((JSON.parse(body || '{}') as { model?: string }).model ?? ''))
        return http(402, '{"message":"Insufficient Balance"}')
      }
      return chatText('```svg\n' + mockSvg('left') + '\n```')
    })
    const out2 = await generateIllustration('one child under a branch, wide empty space on the left', {
      ...DEFAULT_ILLUST,
      apiKey: 'sf-mock',
    })
    stub2.restore()
    if (!out2.ok) fail(`F 欠费不越级：402 之后该退回矢量出图，实得「${out2.error ?? ''}」`)
    if (paid.includes(ILLUST_MODEL)) fail('F 欠费不越级：402 了还去打付费那张，钱就是这么烧掉的')
    if (paid.length > 1) fail(`F 欠费不越级：402 之后还打了 ${paid.length} 次位图（应只打免费那张 1 次）`)

    /* F3：百炼那把 key 没配（503）→ 不许直接跳到矢量，硅基那两级照走。
       两家是两家账：服务端少配一把 key，不该让免费那张也没机会。 */
    const seen3: string[] = []
    const stub3 = stubFetch((url, body) => {
      if (url.includes('/images/generations')) {
        const m = String((JSON.parse(body || '{}') as { model?: string }).model ?? '')
        seen3.push(m)
        return /^qwen-image/i.test(m) ? http(503, '{"error":{"message":"服务器还没配好"}}') : http(500, '画崩了')
      }
      return http(500, '矢量也崩')
    })
    await generateIllustration('one child under a branch, wide empty space on the left', {
      ...DEFAULT_ILLUST,
      apiKey: 'sf-mock',
    })
    stub3.restore()
    if (seen3[1] !== ILLUST_FREE_MODEL) {
      fail(`F 百炼没配：503 之后该接着问硅基的 ${ILLUST_FREE_MODEL.split('/').pop()}，实得 ${seen3[1] || '没问（直接跳矢量了）'}`)
    }

    ok(
      'F 免费优先',
      `第一枪 ${ILLUST_BAILIAN_MODEL}（券抵）→ 崩了 ${ILLUST_FREE_MODEL.split('/').pop()}（0 元）→ 再崩 ${ILLUST_MODEL.split('/').pop()}（1 毛）| 402 → 位图打 ${paid.length} 次、改走矢量`
    )
  } finally {
    if (savedWindow === undefined) delete g.window
    else g.window = savedWindow
  }
}

/* --------------------------------- 主流程 --------------------------------- */

async function main(): Promise<void> {
  sectionA()
  sectionB()
  await sectionC()
  await sectionD()
  await sectionE()
  await sectionF()
  if (errs.length) {
    console.error(`\n✗ 矢量插画 ${errs.length} 处不合格：`)
    errs.forEach((e) => console.error(`  · ${e}`))
    process.exit(1)
  }
  console.log('\n矢量插画全链路通过（提示词 / 净化 / 栅格化 / 接入 / 失败交代 / 免费优先）')
}

void main()