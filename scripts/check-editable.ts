/**
 * 课件可编辑的门禁（TASKS/09 §E 验收 / 10 §七「手改的东西永远算用户的」）。
 *
 * 只看纯数据，不出片、不联网：编辑能力全部落在 deck.ts 的纯函数里，
 * 所以「改了之后还在不在」可以在终端里判完，不用开浏览器。
 *
 *   1. 首版：每页都有 baseTitle、userEdited 为空、页数仍落规模区间
 *   2. 改一个字段：打 userEdited、留住首版标题、身份不漂（连改两次也一样）
 *   3. 改要点：改 / 清空即删 / 越界当追加 / 空串追加不生效
 *   4. 删页 / 插页 / 调序：封面不许删、越界不动、插入的是用户内容
 *   5. 恢复这页：回原稿、抹掉标记；用户插的页无原稿可回，原样返回
 *   6. 合页：换规模后手改页与用户插页都在；反向用例（抹掉标记）必须被新稿覆盖
 *
 * 跑法：
 *   npm run check:editable
 */
import { EXAMPLES } from '../src/data/examples'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'
import {
  applyDeckLayout,
  buildDeck,
  deckPageKey,
  editDeckPage,
  insertDeckPage,
  layoutOfDeck,
  mergeDeck,
  moveDeckPage,
  removeDeckPage,
  restoreDeckPage,
  sameDeckStack,
  setDeckBullet,
  type DeckPage,
} from '../src/lib/deck'
import { clearDeck, deckStoreTopic, loadDeck, saveDeck } from '../src/lib/deckStore'
import { planOfScale } from '../src/lib/scale'

const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const inRange = (n: number, r: { min: number; max: number }) => n >= r.min && n <= r.max

const gf = EXAMPLES.find((e) => e.id === 'guihua')
if (!gf) {
  console.error('找不到《桂花雨》内置示例，门禁无法运行')
  process.exit(1)
}

function deckFor(duration: number): DeckPage[] {
  const plan = planForScale(gf!.plan, duration)
  return buildDeck(plan, allocate(plan.segments, plan.meta.duration))
}

/* ------------------------- 1. 首版 ------------------------- */

const clip = deckFor(240)
const lesson = deckFor(2400)

for (const [name, pages] of [
  ['clip', clip],
  ['lesson', lesson],
] as [string, DeckPage[]][]) {
  const range = planOfScale(name === 'clip' ? 'clip' : 'lesson').deckPages
  if (!inRange(pages.length, range)) {
    fail(`${name} 课件 ${pages.length} 页，不在 ${range.min}–${range.max} 区间`)
  }
  const missing = pages.filter((p) => !p.baseTitle)
  if (missing.length > 0) fail(`${name} 有 ${missing.length} 页没有 baseTitle，改过标题后就认不回来了`)
  const edited = pages.filter((p) => p.userEdited)
  if (edited.length > 0) fail(`${name} 首版就有 ${edited.length} 页带着 userEdited，手改标记失去意义`)
}
console.log(
  `-- 首版 --\n  《桂花雨》clip ${clip.length} 页 / lesson ${lesson.length} 页，` +
    `每页 baseTitle 已落、userEdited 均为空`
)

/* ------------------------- 2. 改一个字段 ------------------------- */

const cover = clip[0]
const titleEdited = editDeckPage(cover, { title: '改过的封面标题' })
if (titleEdited.userEdited !== true) fail('改标题后没有打 userEdited')
if (titleEdited.baseTitle !== cover.title) {
  fail(`改标题后 baseTitle 被改成了「${titleEdited.baseTitle}」，应为首版标题「${cover.title}」`)
}
if (deckPageKey(titleEdited) !== deckPageKey(cover)) {
  fail('改标题后身份变了（deckPageKey 不同），换规模会把它当成另一页')
}
const twice = editDeckPage(titleEdited, { title: '再改一次' })
if (twice.baseTitle !== cover.title) {
  fail(`第二次改标题把 baseTitle 带漂了：「${twice.baseTitle}」`)
}
if (deckPageKey(twice) !== deckPageKey(cover) || twice.title !== '再改一次') {
  fail('连改两次之后认不回原来那一页')
}

/* ------------------------- 3. 改要点 ------------------------- */

const body = clip[1]
const bullet0 = (body.bullets ?? [])[0] ?? ''
const b1 = setDeckBullet(body, 0, '换掉的第一条')
if ((b1.bullets ?? [])[0] !== '换掉的第一条') fail('改第 1 条要点没生效')
if (b1.userEdited !== true) fail('改要点后没有打 userEdited')

const b2 = setDeckBullet(b1, 0, '   ')
if ((b2.bullets ?? []).length !== (b1.bullets ?? []).length - 1) {
  fail('把要点清空应该等于删掉这一条')
}

const len = (body.bullets ?? []).length
const b3 = setDeckBullet(body, len, '追加的一条')
if ((b3.bullets ?? []).length !== len + 1) fail('在末尾追加要点没生效')
const b4 = setDeckBullet(body, len, '   ')
if ((b4.bullets ?? []).length !== len) fail('空串追加不该多出一条看不见的空行')
if ((body.bullets ?? [])[0] !== bullet0) fail('setDeckBullet 改动了原数组（应该是纯函数）')

/* ------------------------- 4. 删 / 插 / 调序 ------------------------- */

const removed = removeDeckPage(clip, 2)
if (removed.length !== clip.length - 1) fail('删页后页数没有减一')
if (removed.includes(clip[2])) fail('删页后那一页还在')
if (removeDeckPage(clip, 0) !== clip) fail('封面被删掉了（封面不许删）')
if (removeDeckPage(clip, 999) !== clip) fail('删越界页时不该动原数组')

const inserted = insertDeckPage(clip, 3)
if (inserted.length !== clip.length + 1) fail('插页后页数没有加一')
if (inserted[4]?.label !== '补充' || inserted[4]?.userEdited !== true) {
  fail('插进来的不是用户那一页（label 应为「补充」且带 userEdited）')
}
if (insertDeckPage(clip, 999).at(-1)?.label !== '补充') fail('越界插页没有接在末尾')

const moved = moveDeckPage(clip, 2, -1)
if (moved[1] !== clip[2] || moved[2] !== clip[1]) fail('上移没有换位')
if (moveDeckPage(clip, 0, -1) !== clip) fail('第一页上移时不该动原数组')
if (moveDeckPage(clip, clip.length - 1, 1) !== clip) fail('最后一页下移时不该动原数组')

/* ------------------------- 5. 恢复这页 ------------------------- */

const dirty = [titleEdited, ...clip.slice(1)]
const restored = restoreDeckPage(dirty, 0, clip)
if (restored[0].title !== cover.title) fail('恢复这页没有回原稿标题')
if (restored[0].userEdited) fail('恢复这页之后 userEdited 没抹掉')
if (restored[0].baseTitle !== cover.baseTitle) fail('恢复这页把 baseTitle 弄丢了')

const blank = inserted[4]
if (restoreDeckPage([blank], 0, clip) !== undefined && restoreDeckPage([blank], 0, clip)[0] === blank) {
  // 用户插的页在原稿里找不到同身份，原样返回是预期行为
} else {
  fail('用户插的页在「恢复这页」时不该被换成别的页')
}

/* ------------------------- 6. 合页（换规模不覆盖手改）------------------------- */

const editedTitle = '我改过的封面'
const handEdited: DeckPage[] = clip.map((p, i) => {
  if (i === 0) return editDeckPage(p, { title: editedTitle, notes: '我改过的口播' })
  if (i === 5) return setDeckBullet(p, 0, '我改过的一条要点')
  return p
})
const withInsert = insertDeckPage(handEdited, 3) // 第 4 页之后插一页
const merged = mergeDeck(lesson, withInsert)

if (merged.length !== lesson.length + 1) {
  fail(`合页后应为 lesson ${lesson.length} 页 + 用户插的 1 页 = ${lesson.length + 1} 页，实为 ${merged.length}`)
}
const gotCover = merged.find((p) => p.kind === 'cover')
if (gotCover?.title !== editedTitle) fail('合页把用户改过的封面标题覆盖回去了')
if (gotCover?.notes !== '我改过的口播') fail('合页把用户改过的备注覆盖回去了')
if (!merged.some((p) => (p.bullets ?? []).includes('我改过的一条要点'))) {
  fail('合页把用户改过的要点丢了')
}
const insertedIdx = merged.findIndex((p) => p.label === '补充')
if (insertedIdx < 0) fail('合页把用户插的页丢了')
else if (deckPageKey(merged[insertedIdx - 1]) !== deckPageKey(clip[3])) {
  fail('用户插的页没有落在原来前一页的后面')
}
// 没改过的页一律用新稿：lesson 独有的「课中活动」必须在
if (lesson.some((p) => p.kind === 'activity') && !merged.some((p) => p.kind === 'activity')) {
  fail('合页把新稿独有的页弄丢了')
}

// 反向用例一：抹掉标记的页必须被新稿覆盖（证明上面那几条不是空转）
const unflagged = clip.map((p, i) => (i === 0 ? { ...p, title: '没打标记的标题', userEdited: false } : p))
const mergedUnflagged = mergeDeck(lesson, unflagged)
const coverAfter = mergedUnflagged.find((p) => p.kind === 'cover')
if (coverAfter?.title === '没打标记的标题') {
  fail('反向用例未被抓到：没打 userEdited 的页竟然也被保留了')
}

// 反向用例二：上一版为空时直接取新稿
if (mergeDeck(lesson, []) !== lesson) fail('上一版为空时不该返回别的数组')

/* --------------------- 7. 持久化（刷新 / 换课 / 恢复原稿） --------------------- */

// node 里没有 localStorage，拿一张 Map 顶上去；deckStore 只在调用时才读它
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage

const myTopic = deckStoreTopic(gf.plan.meta.topic, gf.plan.meta.period)
const otherTopic = deckStoreTopic('另一课', gf.plan.meta.period)

// 用户的那一叠：改封面标题（打 userEdited）、删第 6 页、把第 2 页往后挪一位
const mine = moveDeckPage(
  removeDeckPage(
    clip.map((p, i) => (i === 0 ? editDeckPage(p, { title: '刷新后我还在' }) : p)),
    5
  ),
  1,
  1
)
saveDeck(myTopic, mine, clip)

const back = loadDeck(myTopic, clip)
if (!back) {
  fail('同一课存档存进去又读不回来了')
} else {
  if (!back.sameBase) fail('同一版原稿的存档没被认成「就是这一次刷新」，会走去合页（删页复活）')
  if (!sameDeckStack(back.pages, mine)) {
    fail('刷新恢复出来的那一叠与用户关页面之前不一致（删页或页序丢了）')
  }
  if (!back.pages.some((p) => p.title === '刷新后我还在')) fail('刷新后手改的标题没了')
}

// 换新课：课题对不上必须一律当没存过，绝不能把上一课的改动带过去
if (loadDeck(otherTopic, clip)) fail('换到另一课竟然读到了上一课的存档')

// 原稿重新生成了（换规模 / 重新备课）：只能合页，不能冒充「同一次刷新」
const afterRegen = loadDeck(myTopic, lesson)
if (!afterRegen) fail('原稿换了一版之后存档直接丢了（该留着让 mergeDeck 合页）')
else if (afterRegen.sameBase) fail('原稿都换了还说同一版，删掉的页会跟着复活')

// 坏存档不能炸界面
store.set('yike-sangao:deck', '{这不是 JSON')
if (loadDeck(myTopic, clip) !== null) fail('存档坏了本该当没存过')

// 空的一叠不写，免得界面上拿到空课件
store.clear()
saveDeck(myTopic, [], clip)
if (store.size !== 0) fail('空课件不该写进存档')

// 「恢复原稿」：存档必须真的被清掉
saveDeck(myTopic, mine, clip)
clearDeck()
if (loadDeck(myTopic, clip) !== null) fail('点了「恢复原稿」之后存档还在，刷新还会变回来')

/* ------------- 8. 删页墓碑 / 调序：重建后不回弹（10 §十三 3、4） ------------- */

// clip 与 lesson 同身份的页：只有这些在重建里能被真正验证，先确认够用
const shared = clip.filter((p) => lesson.some((q) => deckPageKey(q) === deckPageKey(p)))
if (shared.length < 3) {
  fail(`clip 与 lesson 同身份的页只有 ${shared.length} 页，墓碑 / 调序断言无法成立`)
}
const doomed = shared[2]
const lastShared = shared[shared.length - 1]
const beforeLast = shared[shared.length - 2]

// 用户：删掉一页，再把最后一页同身份页往上挪一位
let tidied = removeDeckPage(
  clip,
  clip.findIndex((p) => deckPageKey(p) === deckPageKey(doomed))
)
tidied = moveDeckPage(
  tidied,
  tidied.findIndex((p) => deckPageKey(p) === deckPageKey(lastShared)),
  -1
)

const layout = layoutOfDeck(tidied, clip)
if (!layout.deleted.includes(deckPageKey(doomed))) {
  fail('删掉的页没进墓碑（layout.deleted）')
}
if (layout.order.indexOf(deckPageKey(lastShared)) > layout.order.indexOf(deckPageKey(beforeLast))) {
  fail('调序没落进 layout.order')
}

// 换规模重建：墓碑必须锯掉那一页，页序必须保住
const rebuilt = applyDeckLayout(mergeDeck(lesson, tidied), layout)
if (rebuilt.some((p) => deckPageKey(p) === deckPageKey(doomed))) {
  fail(`换规模重建后删掉的「${doomed.title}」又回来了（墓碑没生效）`)
}
const atLast = rebuilt.findIndex((p) => deckPageKey(p) === deckPageKey(lastShared))
const atBefore = rebuilt.findIndex((p) => deckPageKey(p) === deckPageKey(beforeLast))
if (atLast < 0 || atBefore < 0) {
  fail('调序的两页在重建结果里找不到了')
} else if (atLast > atBefore) {
  fail(`调序没保住：重建后「${lastShared.title}」又回到了「${beforeLast.title}」后面`)
}

// 新稿新长出来的页不能被拖拽算法打包扔到末尾：课中活动仍在作业页之前
const atActivity = rebuilt.findIndex((p) => p.kind === 'activity')
const atHomework = rebuilt.findIndex((p) => p.kind === 'homework')
if (atActivity >= 0 && atHomework >= 0 && atActivity > atHomework) {
  fail('重排把新稿独有的「课中活动」页扔到了末尾（只在已知页之间重排才对）')
}

// 存档要带上墓碑与页序（否则刷新一次就白删了）
saveDeck(myTopic, tidied, clip)
const withLayout = loadDeck(myTopic, lesson)
if (!withLayout) {
  fail('带墓碑的存档读不回来')
} else {
  if (!withLayout.layout.deleted.includes(deckPageKey(doomed))) {
    fail('存档没把删页墓碑存下来')
  }
  if (withLayout.sameBase) fail('换了一版原稿还说同一版，墓碑会被当成刷新跳过')
}

/* ------------------------- 汇总 ------------------------- */

console.log(
  `-- 反向用例 --\n` +
    `  抹掉 userEdited 的封面 → 合页后被新稿覆盖 ✓\n` +
    `  上一版为空 → 直接取新稿 ✓\n` +
    `-- 合页 --\n` +
    `  clip ${clip.length} 页（改 2 页 + 插 1 页）→ lesson ${merged.length} 页；` +
    `封面标题与要点保留、插的页在第 ${insertedIdx + 1} 页`
)

console.log(
  `-- 持久化 --\n` +
    `  改 1 页 + 删 1 页 + 调 1 次序 → ${mine.length} 页（原 ${clip.length} 页）；` +
    `刷新读回同一叠 ${back && sameDeckStack(back.pages, mine) ? '✓' : '✗'}；` +
    `换课读不到、原稿重生只合页、坏存档不炸、空白不写、恢复原稿清干净`
)

console.log(
  `-- 删页墓碑 / 调序 --\n` +
    `  删「${doomed.title}」+ 把「${lastShared.title}」上移 → 换成 lesson ${lesson.length} 页重建：` +
    `那片没回来、上下位没变（${layout.deleted.length} 条墓碑 / ${layout.order.length} 条页序）`
)

if (failures.length) {
  console.error(`\n✗ 可编辑门禁 ${failures.length} 处不合格：`)
  failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}

console.log(
  `\n✓ 可编辑门禁全通过：首版无 userEdited、改标题/要点都打标记且认得出原页、` +
    `删/插/调序与封面保护、恢复单页、换规模合页保留手改、反向用例被抓到。`
)