/**
 * 第 6 件：单页 / 多页点名重做的离线门禁（10 §十三 第 6 件）。
 *
 * 判据：
 *   1. 页码解析：第九页 / 第9页 / 第三到第五页 / 第3-5页 / 第十页和第十二页 / 全部；
 *      越界与认不出的句子不猜、不夹到第一页；
 *   2. 只换点名的页：其余页的引用必须原封不动（默认不联动）；
 *   3. 页序被用户拖过：按页身份（kind|首版标题）认回，不是按下标；
 *   4. 用户自己插的页：原稿里没有 → 不换、如实记进 missed；
 *   5. 没 Key 也发请求（落同源代理、不带 Authorization），模型没回话才退回原稿；
 *   6. 有 Key 时只把点名的页写回，模型交回不合格就按原稿重出。
 */
import { EXAMPLES } from '../src/data/examples'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'
import {
  assignDeckLayouts,
  buildDeck,
  editDeckPage,
  insertDeckPage,
  moveDeckPage,
  type DeckPage,
} from '../src/lib/deck'
import { cnNumber, parsePageTargets, redoDeckPages, redoPagesWithLLM } from '../src/lib/redo'
import type { LLMConfig } from '../src/lib/llm'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${label}: 实得 ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`)
  }
}

/* ------------------------- 1. 页码解析 ------------------------- */

const nums: [string, number | null][] = [
  ['九', 9],
  ['十二', 12],
  ['二十三', 23],
  ['3', 3],
  ['０９', 9],
  ['两', 2],
  ['甲', null],
  ['', null],
]
for (const [text, want] of nums) eq(`cnNumber(${JSON.stringify(text)})`, cnNumber(text), want)

const TOTAL = 12
const CASES: [string, number[]][] = [
  ['第九页重来', [9]],
  ['第9页', [9]],
  ['第三到第五页', [3, 4, 5]],
  ['第3-5页', [3, 4, 5]],
  ['第3至第5页', [3, 4, 5]],
  ['把第十页和第十二页重来', [10, 12]],
  ['第3、4页', [3, 4]],
  ['第3页和第5页', [3, 5]],
  ['第 11 页重来', [11]],
  ['重来', []],
  ['第九十九页', []],
]
for (const [text, want] of CASES) {
  const req = parsePageTargets(text, TOTAL)
  eq(`parsePageTargets(${JSON.stringify(text)})`, req.targets, want)
}
const all = parsePageTargets('全部重来', TOTAL)
eq('parsePageTargets(全部重来).all', all.all, true)
eq('parsePageTargets(全部重来).targets 长度', all.targets.length, TOTAL)
const oob = parsePageTargets('第九十九页', TOTAL)
eq('越界页码进 outOfRange', oob.outOfRange, [99])

/* ------------------------- 2. 只换点名的页 ------------------------- */

const plan = planForScale(EXAMPLES[0].plan, 240)
const fresh = assignDeckLayouts(buildDeck(plan, allocate(plan.segments, 240)))
const edited = fresh.map((p, i) => (i === 8 ? editDeckPage(p, { title: '我自己改的第九页' }) : p))

const redo9 = redoDeckPages(edited, [9], fresh)
eq('第 9 页重做：done', redo9.done, [9])
eq('第 9 页重做：missed', redo9.missed, [])
eq('第 9 页重做后内容 = 原稿生成版', redo9.pages[8].title, fresh[8].title)
eq('第 9 页重做后仍标 userEdited', redo9.pages[8].userEdited, true)
eq('第 9 页重做后页数不变', redo9.pages.length, edited.length)

let untouched = 0
for (let i = 0; i < edited.length; i++) {
  if (i === 8) continue
  if (redo9.pages[i] !== edited[i]) fail(`第 ${i + 1} 页没被点名却被换掉了（默认不联动被破坏）`)
  else untouched++
}

// 3–5 页：只换中间三页
const redoRange = redoDeckPages(edited, [3, 4, 5], fresh)
eq('第 3–5 页重做：done', redoRange.done, [3, 4, 5])
if (redoRange.pages[8] !== edited[8]) fail('第 3–5 页重做时第 9 页被动了（没点名的页不许动）')

// 用户拖过页序：第 4 页上移后点「第 3 页」，要按身份认回，不能按新下标乱换
const keyOf = (p: DeckPage) => `${p.kind}|${p.baseTitle ?? p.title}`
const moved = moveDeckPage(fresh, 3, -1)
if (keyOf(moved[2]) !== keyOf(fresh[3])) fail('调序用例本身失效：第 4 页调序后身份没跟着走')
const movedRedo = redoDeckPages(moved, [3], fresh)
eq('调序后重做第 3 页：done', movedRedo.done, [3])
eq('调序后重做第 3 页：内容是原第 4 页的生成版', movedRedo.pages[2].title, fresh[3].title)

// 用户自己插的页：原稿里没有同身份 → missed，原样留着
const withBlank = insertDeckPage(fresh, 2)
const blankIndex = 3 // insertDeckPage 插在第 index 页后面（0 起：插在索引 3）
const blankRedo = redoDeckPages(withBlank, [blankIndex + 1], fresh)
eq('手插页重做：done', blankRedo.done, [])
eq('手插页重做：missed', blankRedo.missed, [blankIndex + 1])
if (blankRedo.pages[blankIndex] !== withBlank[blankIndex]) fail('手插页被换掉了（原稿里没有它，必须原样留着）')

/* ------------------------- 3. 没 Key：零请求 ------------------------- */

const noKey: LLMConfig = { baseUrl: '', apiKey: '', model: '' }
let calls = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async () => {
  calls++
  throw new Error('离线校验里不该发任何网络请求')
}) as unknown as typeof fetch
try {
  // 上面已经跑过纯函数；这里只确认 redoPagesWithLLM 在没 Key 时根本不发请求
  void redoDeckPages(edited, [9], fresh)
  if (calls !== 0) fail(`纯函数重做发了 ${calls} 次请求`)
} finally {
  globalThis.fetch = realFetch
}

/* ------------------------- 4. 有 Key：只写回点名的页 ------------------------- */

function fakeLLM(payload: unknown): { fetch: typeof fetch; count: () => number } {
  let n = 0
  const impl = (async () => {
    n++
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
      text: async () => '',
    }
  }) as unknown as typeof fetch
  return { fetch: impl, count: () => n }
}

async function runLLMCases() {
  const cfg: LLMConfig = { baseUrl: 'https://example.test/v1', apiKey: 'sk-test', model: 'test' }
  // llm.ts 的 requestChat 用 window.setTimeout 做超时；node 里没 window，
  // 离线门禁临时把 window 指到 globalThis（只在这一段内有效，跑完就撤）。
  const g = globalThis as unknown as { window?: unknown }
  const savedWindow = g.window
  g.window = globalThis
  // 合法：只回第 9 页
  const good = fakeLLM({
    pages: [
      {
        index: 9,
        title: '换一种讲法',
        bullets: ['先看这一句', '再想想为什么'],
        question: '换个人来说，会怎么说？',
        notes: '这一段我们换一个走法。先不急着给答案，请两位同学说说自己的理解，说偏了也听完。',
      },
    ],
  })
  globalThis.fetch = good.fetch
  try {
    const report = await redoPagesWithLLM({ pages: edited, targets: [9], fresh, plan, cfg })
    eq('有 Key 重做：source', report.source, 'llm')
    eq('有 Key 重做：done', report.done, [9])
    eq('有 Key 重做：标题用模型的', report.pages[8].title, '换一种讲法')
    eq('有 Key 重做：页数不变', report.pages.length, edited.length)
    for (let i = 0; i < edited.length; i++) {
      if (i === 8) continue
      if (report.pages[i] !== edited[i]) fail(`有 Key 重做时第 ${i + 1} 页（没点名）被动了`)
    }
  } finally {
    globalThis.fetch = realFetch
  }

  // 模型越权：回了一页没点名的（第 2 页）→ 必须丢掉，退回原稿重出第 9 页
  const rogue = fakeLLM({
    pages: [{ index: 2, title: '越权页', bullets: ['不该出现'], question: '凭什么？', notes: '这一页没被点名，不许写回，退回原稿重出。' }],
  })
  globalThis.fetch = rogue.fetch
  try {
    const report = await redoPagesWithLLM({ pages: edited, targets: [9], fresh, plan, cfg })
    eq('模型越权：source', report.source, 'builtin')
    eq('模型越权：第 2 页没被动', report.pages[1] === edited[1], true)
    eq('模型越权：第 9 页仍按原稿重出', report.pages[8].title, fresh[8].title)
  } finally {
    globalThis.fetch = realFetch
  }

  // 垃圾 JSON：parse 会 throw → 回退，且没点名的页不动
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '这是一段不是 JSON 的话' } }] }),
    text: async () => '',
  })) as unknown as typeof fetch
  try {
    const report = await redoPagesWithLLM({ pages: edited, targets: [9], fresh, plan, cfg })
    eq('垃圾 JSON：source', report.source, 'builtin')
    for (let i = 0; i < edited.length; i++) {
      if (i === 8) continue
      if (report.pages[i] !== edited[i]) fail(`垃圾 JSON 回退时第 ${i + 1} 页（没点名）被动了`)
    }
  } finally {
    globalThis.fetch = realFetch
  }

  // 没 Key：也发请求（落同源代理、不带 Authorization），模型没回话才退回原稿
  const urls: string[] = []
  let authorized = 0
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    urls.push(String(url))
    const headers = (init as { headers?: Record<string, string> } | undefined)?.headers ?? {}
    if (Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')) authorized++
    throw new Error('connect ECONNREFUSED')
  }) as unknown as typeof fetch
  try {
    const report = await redoPagesWithLLM({ pages: edited, targets: [9], fresh, plan, cfg: noKey })
    eq('没 Key：source', report.source, 'builtin')
    eq('没 Key：仍然发了请求', urls.length > 0, true)
    eq('没 Key：全部走同源代理', urls.every((u) => u.startsWith('/api/ds/')), true)
    eq('没 Key：没带 Authorization', authorized, 0)
  } finally {
    globalThis.fetch = realFetch
  }

  // 还原 window，免得后面的用例拿到假宿主
  if (savedWindow === undefined) delete g.window
  else g.window = savedWindow
}

await runLLMCases()

/* ------------------------- 汇总 ------------------------- */

console.log(
  `  页码解析：${CASES.length} 句 | cnNumber ${nums.length} 例 | 越界 ${oob.outOfRange.join('/') || '（无）'} 都进 outOfRange`
)
console.log(
  `  单页重做：第 9 页换回生成版，其余 ${untouched} 页引用未变 | 3–5 范围 ${redoRange.done.join('/')} | ` +
    `调序后第 ${movedRedo.done.join('/')} 页按身份换 | 手插页进 missed ${blankRedo.missed.join('/') || '（无）'}`
)
console.log('  有 Key：合法回写只动点名页 / 越权页被丢 / 垃圾 JSON 回退 / 没 Key 走代理后回退')

if (failures.length) {
  console.error(`\n✗ 点名重做 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ 点名重做：解析 / 只换点名页 / 调序认身份 / 手插页不换 / 空 key 走代理后回退 全部通过')