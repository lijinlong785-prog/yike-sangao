/**
 * 「刷新不丢」的离线验收（TASKS/21 §二.6）：本机存档 + 改时长不许清屏。
 *
 * 六组硬断言：
 *   1. 读档：坏 JSON / 版本不对 / 缺 plan 一律当没存，正常档逐字段都对
 *   2. 合并写：App 存稿子、Result 存改字，两边不互相覆盖；半份 patch 写不进去
 *   3. 剥插画：四类插图字段全剥掉，其余一字不动，入参不被改
 *   4. 同一课：同档改分钟数不掉页；跨档才算换课（planKeyOf / durationGuard）
 *   5. 真存储（假 localStorage）：写→读→清；插画零落盘；配额不够时退到「只留稿子」
 *   6. 接线：App / Result / student.ts / vite.config 的静态锚点（不靠注释）
 *
 * 跑法：npm run check:session
 */
import { readFileSync } from 'node:fs'
import { findText } from '../src/data/texts'
import { planForScale } from '../src/data/lesson'
import { skeletonPlan } from '../src/lib/skeleton'
import { getBuiltinStudentSlides } from '../src/lib/slides'
import { limitsFor } from '../src/lib/scale'
import {
  EMPTY_EDITS,
  addAfter,
  patchOriginal,
  type DeckEdits,
} from '../src/lib/deck2/edits'
import {
  SESSION_KEY,
  SESSION_VERSION,
  clearSession,
  durationGuard,
  loadSession,
  mergeSession,
  parseSession,
  planKeyOf,
  saveSession,
  sessionBytes,
  stripIllustration,
  type SessionSnapshot,
} from '../src/lib/session'
import type { LessonInput } from '../src/types'

const FAIL: string[] = []
const fail = (msg: string) => FAIL.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

/* -------------------------------- 夹具 -------------------------------- */

const entry = findText('桂花雨')
if (!entry) {
  console.error('✗ 找不到内置《桂花雨》，这一份门禁跑不起来')
  process.exit(1)
}
const input: LessonInput = {
  topic: '桂花雨',
  subject: '语文',
  stage: '小学',
  grade: '五年级',
  period: '第一课时',
  textbook: '部编版',
  duration: 2400,
  text: entry.quotes.join('\n'),
}
const PLAN = planForScale(skeletonPlan(input), 2400)
const OTHER = planForScale(
  { ...skeletonPlan({ ...input, topic: '观潮', period: '第二课时' }), meta: { ...PLAN.meta, topic: '观潮', period: '第二课时' } },
  2400
)
const SLIDES = getBuiltinStudentSlides(PLAN, limitsFor('standard', 'lesson', 2400))
if (SLIDES.length === 0) {
  console.error('✗ 学生版一页都没有，这一份门禁跑不起来')
  process.exit(1)
}

/** 一张假插画：小 PNG 重复 40 遍，凑出真图那种体量（否则「存档变小」看不出来） */
const ART =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(40)
const withArt = (list: typeof SLIDES) =>
  list.map((s, i) => (i === 0 ? { ...s, illustration: ART, artSide: 'right' as const, coverArch: 'bottom' as const, coverScrim: 0.3 } : s))

const snap = (v: unknown): string => JSON.stringify(v)
const BASE: Partial<Omit<SessionSnapshot, 'v' | 'savedAt'>> = {
  input,
  plan: PLAN,
  duration: 2400,
  isDemo: false,
  planKey: planKeyOf(PLAN, 2400),
  slides: SLIDES,
  fingerprint: '12-abc123',
  degraded: false,
}

/* ------------------------------ 1 · 读档 ------------------------------ */

console.log('\n=== 1. 读档：脏数据一律当没存，正常档逐字段都对 ===')
if (parseSession(null) !== null) fail('1 null 被读成了一份存档')
if (parseSession('{不是 JSON') !== null) fail('1 坏 JSON 没被挡掉')
const wrongV = parseSession(JSON.stringify({ ...BASE, v: SESSION_VERSION + 99 }))
if (wrongV !== null) fail(`1 版本 ${SESSION_VERSION + 99} 的档被读进来了`)
const noPlan = parseSession(JSON.stringify({ ...BASE, v: SESSION_VERSION, plan: null }))
if (noPlan !== null) fail('1 缺 plan 的档被读进来了')
const noInput = parseSession(JSON.stringify({ ...BASE, v: SESSION_VERSION, input: undefined }))
if (noInput !== null) fail('1 缺 input 的档被读进来了')
const zeroDur = parseSession(JSON.stringify({ ...BASE, v: SESSION_VERSION, duration: 0 }))
if (zeroDur !== null) fail('1 时长为 0 的档被读进来了')
ok('1 五种脏数据全部挡掉', 'null / 坏 JSON / 版本不对 / 缺 plan / 缺 input / 时长为 0')

const good = parseSession(JSON.stringify({ ...BASE, v: SESSION_VERSION, tab: '乱写', slideAt: -3 }))
if (!good) fail('1 正常档被读成了 null')
else {
  if (good.plan.meta.topic !== '桂花雨') fail(`1 读回来的课题是「${good.plan.meta.topic}」，应为「桂花雨」`)
  if (good.slides.length !== SLIDES.length) fail(`1 读回来的学生版 ${good.slides.length} 页，应为 ${SLIDES.length} 页`)
  if (good.tab !== 'deck') fail(`1 非法档位「乱写」没回落成 deck，读成了 ${good.tab}`)
  if (good.slideAt !== 0) fail(`1 负数页码没夹回 0，读成了 ${good.slideAt}`)
  if (good.v !== SESSION_VERSION) fail('1 读回来的版本号不对')
  if (!good.planKey.includes('桂花雨')) fail(`1 planKey 丢了课题：${good.planKey}`)
  ok('1 正常档逐字段读回', `${good.slides.length} 页 · planKey=${good.planKey} · tab 非法回落 deck`)
}

/* ----------------------------- 2 · 合并写 ----------------------------- */

console.log('\n=== 2. 合并写：两处各写各的，谁也不覆盖谁 ===')
const first = mergeSession(null, BASE)
if (!first) {
  console.error('✗ prev 为空、patch 带 plan+input，却写不进一份全量档')
  process.exit(1)
}
if (first.slides.length !== SLIDES.length) fail(`2 首次写入学生版只剩 ${first.slides.length} 页`)
else ok('2 首次写入 = 全量落盘', `${first.slides.length} 页 + 稿子 + 输入`)

const half = mergeSession(null, { edits: patchOriginal(EMPTY_EDITS, SLIDES.length, 1, { title: '改一句' }) })
if (half !== null) fail('2 只有 edits、没有 plan/input 的半份 patch 也写进去了')
else ok('2 半份 patch 写不进', '缺 plan/input 一律拒绝')

const edits2: DeckEdits = addAfter(
  patchOriginal(EMPTY_EDITS, SLIDES.length, 1, { title: '改一句' }),
  SLIDES.length,
  2,
  'new-1',
  { kind: 'close-read', title: '新插一页', notes: '先读一遍，再说说你的理解。' }
)
const afterEdits = mergeSession(first, { edits: edits2, templateId: 'xuan', tab: 'student', slideAt: 3 })
if (!afterEdits) fail('2 prev 有档时合并写失败')
else {
  if (snap(afterEdits.plan) !== snap(first.plan)) fail('2 合并写把稿子覆盖了（只该改带上的字段）')
  if (snap(afterEdits.slides) !== snap(first.slides)) fail('2 合并写把学生版覆盖了')
  if (snap(afterEdits.edits) !== snap(edits2)) fail('2 合并写没把改字写进去')
  if (afterEdits.templateId !== 'xuan') fail('2 合并写没把模板写进去')
  if (afterEdits.tab !== 'student' || afterEdits.slideAt !== 3) fail('2 合并写没把档位 / 页码写进去')
  if (afterEdits.savedAt < first.savedAt) fail('2 合并写的 savedAt 反而更早了')
  ok('2 带上的字段换新、没带的原样', 'plan 与 slides 深比较相同，edits / 模板 / 档位已更新')
}

const bad = mergeSession(first, { plan: null as never })
if (bad !== null) fail('2 用 null 覆盖稿子也被接受了（该拒绝并保留旧档）')
else ok('2 坏字段不许把旧档写坏')

/* ---------------------------- 3 · 剥插画 ---------------------------- */

console.log('\n=== 3. 剥插画：四类字段全剥掉，其余一字不动，入参不被改 ===')
const artSlides = withArt(SLIDES)
const artBefore = snap(artSlides)
const lean = stripIllustration(artSlides)
if (lean.some((s) => 'illustration' in s || 'artSide' in s || 'coverArch' in s || 'coverScrim' in s)) {
  fail('3 剥完还留着插图字段')
} else ok('3 四类插图字段全剥掉', 'illustration / artSide / coverArch / coverScrim')
if (snap(artSlides) !== artBefore) fail('3 stripIllustration 改了入参')
else ok('3 入参一个字节没动', `${artSlides.length} 页深比较相等`)
if (lean.length !== SLIDES.length) fail(`3 剥完页数变了：${SLIDES.length} → ${lean.length}`)
const lost = SLIDES.filter((s, i) => lean[i].title !== s.title || lean[i].notes !== s.notes || snap(lean[i].items) !== snap(s.items))
if (lost.length) fail(`3 剥插画时顺手动坏了 ${lost.length} 页的字`)
else ok('3 字一个没丢', 'title / notes / items 逐页相同')
const noArt = mergeSession(first, { slides: stripIllustration(artSlides) })
if (!noArt) fail('3 剥完的叠写不回去')
else if (sessionBytes(noArt) >= sessionBytes({ ...first, slides: artSlides })) {
  fail('3 剥插画后存档没变小')
} else ok('3 存档变小了', `${(sessionBytes({ ...first, slides: artSlides }) / 1024).toFixed(0)}KB → ${(sessionBytes(noArt) / 1024).toFixed(0)}KB`)

/* ---------------------- 4 · 同一课 / 改时长守卫 ---------------------- */

console.log('\n=== 4. 同一课：同档改分钟数不掉页，跨档才问一句 ===')
const k40 = planKeyOf(PLAN, 40 * 60)
if (k40 !== planKeyOf(PLAN, 42 * 60)) fail('4 同档（40 / 42 分钟）被判成了两课')
else ok('4 同档改分钟数仍是同一课', `planKey=${k40}`)
if (k40 === planKeyOf(PLAN, 30 * 60)) fail('4 跨档（40 → 30 分钟）没被判成两课')
else ok('4 跨档才算换课', `40 分钟 ${k40} ≠ 30 分钟 ${planKeyOf(PLAN, 30 * 60)}`)
if (planKeyOf(PLAN, 2400) === planKeyOf(OTHER, 2400)) fail('4 《桂花雨》与《观潮》判成了同一课')
else ok('4 换课时换钥匙', `${planKeyOf(PLAN, 2400)} ≠ ${planKeyOf(OTHER, 2400)}`)
if (planKeyOf(null, 2400) !== '') fail('4 没教案时 planKey 不是空串')

if (durationGuard(2400, 42 * 60, 5) !== 'ok') fail('4 同档改分钟数却先弹了确认框')
else ok('4 同档改分钟数直接改', '改过 5 处也不问（页数没变）')
if (durationGuard(2400, 30 * 60, 0) !== 'ok') fail('4 什么都没改却要确认')
else ok('4 没改过东西，跨档也不用问', '换了也不丢东西')
if (durationGuard(2400, 30 * 60, 3) !== 'confirm') fail('4 跨档 + 改过 3 处却不问，等于静默清屏')
else ok('4 跨档 + 改过才问一句', '改过的保留，学生版重生成')

/* --------------------------- 5 · 真存储 --------------------------- */

console.log('\n=== 5. 真存储：写 → 读 → 清；插画不落盘；配额不够退到只留稿子 ===')

class FakeStorage {
  map = new Map<string, string>()
  /** 字符数上限（JSON.length），0 = 不限 */
  quota = 0
  get length(): number {
    return this.map.size
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    if (this.quota > 0 && v.length > this.quota) {
      const err = new Error('QuotaExceededError')
      err.name = 'QuotaExceededError'
      throw err
    }
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

const store = new FakeStorage()
Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true })

if (loadSession() !== null) fail('5 空存储里读出了存档')
saveSession({ ...BASE, slides: withArt(SLIDES) })
const raw = store.getItem(SESSION_KEY)
if (!raw) fail(`5 写入后 ${SESSION_KEY} 是空的`)
else if (raw.includes('base64')) fail('5 假插画被一起写进了 localStorage（配额杀手）')
else ok('5 写入成功且插画零落盘', `${(raw.length / 1024).toFixed(0)}KB`)
const back = loadSession()
if (!back) fail('5 刚写进去的档读不回来')
else if (back.plan.meta.topic !== '桂花雨' || back.slides.length !== SLIDES.length) {
  fail('5 读回来的档不完整')
} else ok('5 读回完整一份', `${back.slides.length} 页 · ${back.fingerprint}`)

clearSession()
if (store.getItem(SESSION_KEY) !== null) fail('5 clearSession 没删掉键')
else if (loadSession() !== null) fail('5 清完还能读出来')
else ok('5 清档干净', '键已删、读回来是 null')

/* 配额不够：先量一份「只留稿子」要多少字，再给它刚好装不下学生版的额度 */
const probe = new FakeStorage()
Object.defineProperty(globalThis, 'localStorage', { value: probe, configurable: true, writable: true })
saveSession({ ...BASE, slides: [] })
const planOnlyLen = (probe.getItem(SESSION_KEY) ?? '').length
if (planOnlyLen === 0) fail('5 只留稿子的写法也没写进去，配额用例没法测')
const fullLen = raw ? raw.length : 0
if (fullLen <= planOnlyLen + 1000) fail(`5 夹具太薄：整份 ${fullLen} 字、只留稿子 ${planOnlyLen} 字，差不开`)

const tiny = new FakeStorage()
tiny.quota = planOnlyLen + 1000
Object.defineProperty(globalThis, 'localStorage', { value: tiny, configurable: true, writable: true })
saveSession({ ...BASE, slides: withArt(SLIDES) })
const small = loadSession()
if (!small) fail('5 配额不够时整份都没写进去（应该退到只留稿子）')
else if (small.slides.length !== 0) fail(`5 配额不够时还硬塞了 ${small.slides.length} 页学生版`)
else if (small.plan.meta.topic !== '桂花雨') fail('5 降级后稿子丢了')
else ok('5 配额不够退到只留稿子', `配额 ${tiny.quota} 字 → 稿子在、学生版 0 页`)

/* 隐私模式：setItem 一直抛，saveSession 不许抛到界面上 */
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: () => null,
    setItem: () => {
      throw new Error('SecurityError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  },
  configurable: true,
  writable: true,
})
let threw = false
try {
  saveSession(BASE)
  clearSession()
} catch {
  threw = true
}
if (threw) fail('5 隐私模式下一次写失败就把页面弄崩了')
else ok('5 写失败不外抛', '隐私模式静默跳过')

/* ------------------------------ 6 · 接线 ------------------------------ */

console.log('\n=== 6. 接线：起手读档、两处合并写、学生版同档不清屏、preview 有代理 ===')
const app = readFileSync('src/App.tsx', 'utf8')
const result = readFileSync('src/components/Result.tsx', 'utf8')
const studentSrc = readFileSync('src/lib/student.ts', 'utf8')
const viteSrc = readFileSync('vite.config.ts', 'utf8')

const appHooks: [string, RegExp, string][] = [
  ['起手读档', /const restored = initialDemo \? null : loadSession\(\)/, '演示链接优先于存档'],
  ['新课先清档', /function handleGenerate[\s\S]{0,400}?clearSession\(\)/, '免得新稿子没存上时刷新回旧课'],
  ['回首页清档', /function handleBackHome\(\)[\s\S]{0,200}?clearSession\(\)/, '「重新备课」等于不要这一课了'],
  ['存学生版（剥图）', /slides: stripIllustration\(student\.slides\)/, '插画不进存档'],
  ['存身份', /planKey: planKeyOf\(plan, duration\)/, '同一课 / 换课靠它判'],
  ['合并写入口', /const handleSession = useCallback[\s\S]{0,200}?saveSession\(patch\)/, 'Result 的改字走这一条'],
]
for (const [label, re, note] of appHooks) {
  if (!re.test(app)) fail(`6 App 缺「${label}」：${note}`)
}
const firstWrite = /if \(firstSaveRef\.current\) \{[\s\S]{0,400}?patch\.edits = restored\.edits/.test(app)
if (!firstWrite) fail('6 App 首次写没把上一次的改字 / 模板 / 档位带上（子组件先跑会落空）')
else ok('6 App 六处锚点齐', appHooks.map((h) => h[0]).join(' / ') + ' / 首次写带改字')

const resultHooks: [string, RegExp, string][] = [
  ['改字回写', /sessionRef\.current\?\.\(\{ edits, templateId, tab, slideAt \}\)/, '300ms 防抖合并写'],
  ['改时长先问', /durationGuard\(duration, nextSec, editedCount\)/, '跨档 + 改过才问'],
  ['起手档位', /initialTab = 'deck'/, '默认先看课件'],
]
for (const [label, re, note] of resultHooks) {
  if (!re.test(result)) fail(`6 Result 缺「${label}」：${note}`)
}
/* 换教案才清屏：依赖必须是 planToken，不许再回到 [plan]（同档改分钟数会造新对象） */
if (!/\}, \[planToken\]\)/.test(result)) fail('6 Result 的重置还挂在 [plan] 上（改分钟数就清屏）')
else if (/setEditState\(\{ cur: EMPTY_EDITS, undo: \[\] \}\)[\s\S]{0,200}?\[plan\]/.test(result)) {
  fail('6 Result 还有一处按 [plan] 清改字')
} else ok('6 Result 三处锚点齐', resultHooks.map((h) => h[0]).join(' / ') + ' / 重置挂在 planToken')

const studentHooks: [string, RegExp, string][] = [
  ['同一课判定', /export function sameLesson\(/, '同档改分钟数不算换课'],
  ['同档早退', /if \(lastPlanKeyRef\.current === planKey\) return/, '一页不动、不重发生成'],
  ['读档恢复', /saved\.planKey === planKey/, '刷新回来直接是 ready'],
]
for (const [label, re, note] of studentHooks) {
  if (!re.test(studentSrc)) fail(`6 student.ts 缺「${label}」：${note}`)
}
if (studentHooks.every(([, re]) => re.test(studentSrc))) {
  ok('6 student.ts 三处锚点齐', studentHooks.map((h) => h[0]).join(' / '))
}

/* vite preview 也必须有代理：评委用 preview 演示时，没有代理就全静默退兜底 */
const hasProxyConst = /const proxy = \{[\s\S]{0,800}?'\/api\/ds'/.test(viteSrc)
const serverProxy = /server:\s*\{[\s\S]{0,300}?proxy\b/.test(viteSrc)
const previewProxy = /preview:\s*\{[\s\S]{0,300}?proxy\b/.test(viteSrc)
if (!hasProxyConst) fail('6 vite.config 没有统一的 proxy 常量')
if (!serverProxy) fail('6 vite.config 的 dev server 没接代理')
if (!previewProxy) fail('6 vite.config 的 preview 没接代理（npm run preview 演示会全退兜底）')
if (hasProxyConst && serverProxy && previewProxy) ok('6 dev / preview 共用一份代理', '/api/ds · /api/sf')

/* -------------------------------- 收尾 -------------------------------- */

console.log('')
if (FAIL.length) {
  for (const f of FAIL) console.log(`✗ ${f}`)
  console.log(`\n存档门禁：${FAIL.length} 条未通过`)
  process.exit(1)
}
console.log('存档门禁：六组全过（读档 / 合并写 / 剥插画 / 同一课 / 真存储 / 接线）')