/**
 * 第 8 件：版式轮换的离线门禁（10 §十三 第 8 件）。
 *
 * 判据全部量化，不开浏览器：
 *   1. 整份至少 3 种版式（整页大图 / 左右分栏 / 卡片墙 / 时间轴 / 挖空猜）；
 *   2. 每 5 页至少一次「整页大图」；
 *   3. 每页至少一个视觉元素（page.visual 非空，且等于版式名）；
 *   4. 四篇内置示例 × 四档时长全过；
 *   5. 删页 / 换档之后重排仍过（版式是推导值，不许因为用户删一页就断）；
 *   6. 反向用例：把版式抹掉 / 让 5 页窗口里没有整页大图 / 只留两种版式，必须被判红。
 */
import { EXAMPLES } from '../src/data/examples'
import {
  LAYOUT_NAME,
  PAGE_LAYOUTS,
  assignDeckLayouts,
  buildDeck,
  layoutProblems,
  removeDeckPage,
  uniqueTitles,
  type DeckPage,
  type PageLayout,
} from '../src/lib/deck'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const COUNT: Record<string, number> = Object.fromEntries(PAGE_LAYOUTS.map((k) => [k, 0]))
const DURATIONS: [number, string][] = [
  [240, 'clip'],
  [1200, '20 分钟'],
  [1800, '30 分钟'],
  [2400, '40 分钟'],
]

for (const ex of EXAMPLES) {
  for (const [duration, tag] of DURATIONS) {
    const plan = planForScale(ex.plan, duration)
    const deck = assignDeckLayouts(buildDeck(plan, allocate(plan.segments, duration)))
    const problems = layoutProblems(deck)
    for (const p of problems) fail(`${ex.label}·${tag}: ${p}`)

    const used = new Set(deck.map((p) => p.layout))
    if (used.size < 3) fail(`${ex.label}·${tag}: 只有 ${used.size} 种版式（${[...used].join('/')}）`)

    // 12 §二：同一叠里标题必须彼此不同——目录上一眼看不出这页干什么，就等于没有目录
    const seenTitle = new Map<string, number>()
    deck.forEach((p, i) => {
      const n = seenTitle.get(p.title) ?? 0
      if (n > 0) fail(`${ex.label}·${tag} 第 ${i + 1} 页标题「${p.title}」与前面重名`)
      seenTitle.set(p.title, n + 1)
    })

    // 每页视觉元素必须与版式名一致：写岔了等于这一页没有视觉元素
    deck.forEach((p, i) => {
      const want = LAYOUT_NAME[p.layout as PageLayout]
      if (!p.visual) fail(`${ex.label}·${tag} 第 ${i + 1} 页：没有 visual`)
      else if (p.visual !== want) fail(`${ex.label}·${tag} 第 ${i + 1} 页：visual=${p.visual}，应为 ${want}`)
      COUNT[p.layout as string] = (COUNT[p.layout as string] ?? 0) + 1
    })

    const fulls = deck.filter((p) => p.layout === 'full').length
    if (fulls < Math.ceil(deck.length / 5)) {
      fail(`${ex.label}·${tag}: ${deck.length} 页只有 ${fulls} 页整页大图，每 5 页至少要一页`)
    }

    console.log(
      `  ${ex.label.padEnd(8)} ${tag.padEnd(6)} ${String(deck.length).padStart(2)} 页 | ` +
        `版式 ${used.size} 种 | 整页大图 ${fulls} 页 | ` +
        PAGE_LAYOUTS.map((k) => `${LAYOUT_NAME[k]}${deck.filter((p) => p.layout === k).length}`).join(' ')
    )

    // 删页之后重排：不许因为删掉一页就出现「连续 5 页没有整页大图」
    const deleted = assignDeckLayouts(removeDeckPage(deck, Math.min(5, deck.length - 1)))
    const afterDelete = layoutProblems(deleted)
    for (const p of afterDelete) fail(`${ex.label}·${tag} 删第 6 页后: ${p}`)
  }
}

/* ---------------- 反向用例：这些必须被抓住 ---------------- */

const sample = (() => {
  const plan = planForScale(EXAMPLES[0].plan, 240)
  return assignDeckLayouts(buildDeck(plan, allocate(plan.segments, 240)))
})()

// 12 §二 存证：把最长那叠（桂花雨 · 40 分钟）的目录逐页打出来。
// 旧版「这一段，学生动得起来」就出在这一档的环节页上，页页重名时一眼能看出来。
const rich = (() => {
  const plan = planForScale(EXAMPLES[0].plan, 2400)
  return assignDeckLayouts(buildDeck(plan, allocate(plan.segments, 2400)))
})()
console.log(`  目录（桂花雨 · 40 分钟，${rich.length} 页）：`)
rich.forEach((p, i) => console.log(`   ${String(i + 1).padStart(2)}. ${p.title}`))

const stripped: DeckPage[] = sample.map((p) => ({ ...p, layout: undefined, visual: '' }))
if (layoutProblems(stripped).length === 0) fail('反向用例未被抓到：把版式全抹掉，layoutProblems 竟然说合格')

const noFull: DeckPage[] = sample.map((p) => ({ ...p, layout: 'cards' as PageLayout, visual: LAYOUT_NAME.cards }))
if (layoutProblems(noFull).length === 0) fail('反向用例未被抓到：整份没有整页大图，layoutProblems 竟然说合格')

const twoKinds: DeckPage[] = sample.map((p) => ({
  ...p,
  layout: (p.layout === 'full' ? 'full' : 'split') as PageLayout,
  visual: p.layout === 'full' ? LAYOUT_NAME.full : LAYOUT_NAME.split,
}))
if (layoutProblems(twoKinds).length === 0) fail('反向用例未被抓到：整份只剩两种版式，layoutProblems 竟然说合格')

// 每 5 页一窗口的边界：把第一个窗口（含封面）的整页大图全拿掉
const hole: DeckPage[] = sample.map((p, i) =>
  i <= 4 ? { ...p, layout: 'cards' as PageLayout, visual: LAYOUT_NAME.cards } : p
)
if (layoutProblems(hole).length === 0) fail('反向用例未被抓到：第 1–5 页没有整页大图竟然合格')

// 12 §二反向用例：把三页改成同一个标题，uniqueTitles 必须把它们拆开
const dupTitles: DeckPage[] = sample.map((p, i) => (i > 0 && i < 3 ? { ...p, title: sample[0].title } : p))
if (new Set(uniqueTitles(dupTitles).map((p) => p.title)).size !== dupTitles.length) {
  fail('反向用例未被抓到：uniqueTitles 没把重名标题拆开')
}

// 五种版式在全部产物里都得出现过：整份至少三种，但工具本身要会画五种
for (const k of PAGE_LAYOUTS) {
  if ((COUNT[k] ?? 0) === 0) fail(`版式「${LAYOUT_NAME[k]}」在四篇四档里一次都没出现`)
}

console.log(
  `\n  五种版式合计：` + PAGE_LAYOUTS.map((k) => `${LAYOUT_NAME[k]} ${COUNT[k] ?? 0}`).join(' | ')
)
console.log(
  `  标题唯一：四篇 × 四档 ${EXAMPLES.length * DURATIONS.length} 叠逐页无重名（反向用例：把 3 页改成同一标题 → uniqueTitles 拆回 ${new Set(uniqueTitles(dupTitles).slice(0, 3).map((p) => p.title)).size} 个）`
)
console.log(
  `  反向用例：抹掉版式 ${layoutProblems(stripped).length} 处红 / ` +
    `无整页大图 ${layoutProblems(noFull).length} 处红 / ` +
    `只剩两种 ${layoutProblems(twoKinds).length} 处红 / ` +
    `窗口漏洞 ${layoutProblems(hole).length} 处红`
)

if (failures.length) {
  console.error(`\n✗ 版式轮换 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ 版式轮换：四篇 × 四档全部合格，五种版式都出现过')