/**
 * TASKS/17 §二.3：课件改完再生成学生版（四条门禁）。
 *
 * 盯的是用户真的会点的那条路：老师看到课件 → 删页 / 改标题 / 调序 → 点「生成学生版 PPT」。
 * 模型那遍在 node 里调不通（也不许真调），产品交出的就是 slidesFromDeck 推出来的那一叠；
 * 模型跑通时 prompt 用的也是同一份课件（buildStudentSlides 的第 4 个参数）。
 *
 *   ① 删掉课件第 5 页 → 学生版里那一页独有的词一个都不留
 *   ② 改第 3 页标题 → 学生版用新标题，旧标题不再出现
 *   ③ 课件调序 → 学生版里那两页的先后跟着翻过来
 *   ④ 同一叠再点一次算命中（钥匙一样就不再算、不再发请求）；改一个字钥匙必换
 *
 * 为什么 ④ 不数 fetch：缓存与请求都在 useStudentDeck 里，那个 hook 要 DOM 才能跑
 * （SSR 里 `ready` 那道闸永远不落，ensure 会一直等）。所以把「命中判据」抽成纯函数
 * sameDeckKey / deckKeyOf，门禁直接问真判据，并额外钉住源码里四处命中即返回的位置——
 * 命中那一行在 buildStudentSlides 之前 return，因此「命中 = fetch 0 次」由结构保证。
 *
 * 跑法：npm run check:student-from-deck（tsc + esbuild + node；不新增依赖）
 */
import { readFileSync } from 'node:fs'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
import { buildDeck, type DeckPage } from '../src/lib/deck'
import { allocate } from '../src/lib/timing'
import { buildStudentSlidesPrompt } from '../src/lib/prompt'
import { deckKeyOf, sameDeckKey } from '../src/lib/student'
import { limitsFor } from '../src/lib/scale'
import {
  getBuiltinStudentSlides,
  slidesFromDeck,
  slidesFromDeckProblems,
  validateSlides,
  type StudentSlide,
} from '../src/lib/slides'

const errs: string[] = []
const fail = (msg: string): void => {
  errs.push(msg)
}
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

const plan = planForScale(guihuaYu, 240)
const deck = buildDeck(plan, allocate(plan.segments, plan.meta.duration))
const limits = limitsFor(undefined, 'clip', 240)

/** 学生上屏的字（标题 / 那一行 / 条目）；备注不算——它不上屏，只看老师念 */
const visible = (slides: readonly StudentSlide[]): string =>
  slides.map((s) => [String(s.title ?? ''), String(s.line ?? ''), ...(s.items ?? [])].join(' ')).join(' | ')

const titlesOf = (slides: readonly StudentSlide[]): string[] => slides.map((s) => String(s.title ?? ''))

/** 去掉标点与空白：认同一句话时不能要求标点也一模一样 */
const bare = (text: unknown): string =>
  String(text ?? '').replace(/[\s，。、；：：「」『』（）《》“”‘’,.!?—…·]/g, '')

/** 四字头：标题可能被 cleanTitle 截过尾，用「含这四字」认同一页最稳 */
const head = (text: unknown): string => [...bare(text)].slice(0, 4).join('')

/** 中文 n-gram：用来问「这一页独有的说法，学生版里还有没有」 */
function grams(text: unknown, n = 3): string[] {
  const s = String(text ?? '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const out: string[] = []
  for (let i = 0; i + n <= s.length; i += 1) out.push(s.slice(i, i + n))
  return out
}

/* ------------------------- 素材：12 页课件 ------------------------- */

const DROP_AT = 4 // 第 5 页
const EDIT_AT = 2 // 第 3 页
const NEW_TITLE = '读第三段，圈出写桂花香的词'

function deckLine(pages: readonly DeckPage[]): string {
  return pages
    .map((p, i) => `${i + 1}·${p.kind}「${p.title}」`)
    .join(' ')
}

/* ------------------------- ① 删掉第 5 页 ------------------------- */

function sectionOne(): void {
  if (deck.length !== 12) fail(`① 素材：课件应恰好 12 页（§二.3.1 给的就是 12 页），实得 ${deck.length} 页`)
  const dropped = deck[DROP_AT]
  if (!dropped) {
    fail(`① 素材：课件没有第 ${DROP_AT + 1} 页，删页用例写不动`)
    return
  }
  const rest = deck.filter((_, i) => i !== DROP_AT)
  const dropText = [dropped.title, ...(dropped.bullets ?? []), dropped.question ?? ''].join(' ')
  const restText = rest
    .map((p) => [p.title, ...(p.bullets ?? []), p.question ?? ''].join(' '))
    .join(' ')

  /* 只留「这一页独有」的说法：别处也有的词、本课本来就有的词（问句池里的），
     学生版留着不算泄漏——删页不是禁词。 */
  const generic = visible(getBuiltinStudentSlides(plan, limits))
  const lonely = [...new Set(grams(dropText))].filter((g) => !restText.includes(g) && !generic.includes(g))
  if (lonely.length < 3) {
    fail(`① 素材：第 ${DROP_AT + 1} 页只有 ${lonely.length} 个独有词，删掉它证明不了什么`)
    return
  }

  const slides = slidesFromDeck(rest, plan, limits)
  /* 退回内置那一叠时 slidesFromDeck 会把原因记下来（§二.3 的静默兜底），
     这一行是「学生版到底用没用老师这一叠」的精确判据——比认标题可靠。 */
  const why = slidesFromDeckProblems()
  if (why.length > 0) {
    fail(`① 删页：这一叠过不了导出闸门，静默退回了内置那一叠 —— ${why.slice(0, 3).join(' / ')}`)
  }
  if (slides.length === 0) fail('① 删页：学生版一页都没有')

  const text = visible(slides)
  const leaked = lonely.filter((g) => text.includes(g))
  if (leaked.length > 0) {
    fail(`① 删页：学生版还留着第 ${DROP_AT + 1} 页的内容（${leaked.slice(0, 6).join('、')}）`)
  }
  const check = validateSlides(slides, limits)
  if (!check.ok) fail(`① 删页：交出来的学生版过不了导出闸门 —— ${check.problems[0]}`)

  ok(
    '① 删掉第 5 页',
    `课件 12 → ${rest.length} 页 | 学生版 ${slides.length} 页（从课件推的，没退回内置）| 第 5 页「${dropped.title}」的 ${lonely.length} 个独有词零残留（${lonely.slice(0, 4).join('、')}…）`
  )
}

/* ------------------------- ② 改第 3 页标题 ------------------------- */

function sectionTwo(): void {
  const page = deck[EDIT_AT]
  if (!page) {
    fail(`② 素材：课件没有第 ${EDIT_AT + 1} 页，改标题用例写不动`)
    return
  }
  const edited = deck.map((p, i) => (i === EDIT_AT ? { ...p, title: NEW_TITLE } : p))
  const slides = slidesFromDeck(edited, plan, limits)
  const titles = titlesOf(slides)

  if (!titles.includes(NEW_TITLE)) {
    const near = titles.find((t) => t.includes('圈出写桂花香'))
    fail(`② 改标题：学生版没有用新标题「${NEW_TITLE}」，最近的是「${near ?? '（无）'}」`)
  }
  const oldHead = head(page.title)
  if (titles.some((t) => bare(t).includes(oldHead))) {
    fail(`② 改标题：旧标题「${page.title}」（${oldHead}）还挂在学生版上`)
  }

  /* 模型看到的也得是这一版：prompt 的 user 段逐页列出课件，标题一改文本就变 */
  const editedPrompt = buildStudentSlidesPrompt(plan, 'auto', 'clip', edited)
  if (!editedPrompt.system.includes('以老师改定的那一叠课件为准')) {
    fail('② prompt：硬规则 0「以老师改定的那一叠课件为准」不见了')
  }
  if (!editedPrompt.user.includes(NEW_TITLE)) fail(`② prompt：交给模型的页清单里没有新标题「${NEW_TITLE}」`)
  const plainPrompt = buildStudentSlidesPrompt(plan, 'auto', 'clip')
  if (editedPrompt.user === plainPrompt.user) {
    fail('② prompt：改过课件与没改时交给模型的 user 段一模一样（等于模型看不到老师的改动）')
  }
  if (plainPrompt.user.includes('下面是老师已经改定的课件')) {
    fail('② prompt：没有改过课件时也挂了「老师已经改定」那一段')
  }

  ok('② 改第 3 页标题', `「${page.title}」→「${NEW_TITLE}」| 学生版用新标题、旧标题零命中 | prompt 页清单跟着换`)
}

/* ------------------------- ③ 课件调序 ------------------------- */

function sectionThree(): void {
  const aAt = deck.findIndex((p) => p.kind === 'board')
  const bAt = deck.findIndex((p) => p.kind === 'homework')
  if (aAt < 0 || bAt < 0 || aAt === bAt) {
    fail(`③ 素材：课件里找不到 board / homework 两页（${aAt} / ${bAt}），调序用例写不动`)
    return
  }
  const before = slidesFromDeck(deck, plan, limits)
  const swapped = deck.slice()
  ;[swapped[aAt], swapped[bAt]] = [swapped[bAt], swapped[aAt]]
  const after = slidesFromDeck(swapped, plan, limits)

  const ha = head(deck[aAt].title)
  const hb = head(deck[bAt].title)
  const at = (slides: readonly StudentSlide[], h: string): number =>
    titlesOf(slides).map(bare).findIndex((t) => t.includes(h))
  const [a1, b1] = [at(before, ha), at(before, hb)]
  const [a2, b2] = [at(after, ha), at(after, hb)]
  if (a1 < 0 || b1 < 0 || a2 < 0 || b2 < 0) {
    fail(`③ 调序：两页里有页面在学生版里找不到（改前 ${a1}/${b1}，改后 ${a2}/${b2}，认的是「${ha}」「${hb}」）`)
    return
  }
  if (a1 >= b1) fail(`③ 调序：改前顺序就不对（第 ${a1 + 1} 页 / 第 ${b1 + 1} 页），用例本身写坏了`)
  if (a2 <= b2) fail(`③ 调序：课件换了先后，学生版还是「${ha}」在第 ${a2 + 1} 页、「${hb}」在第 ${b2 + 1} 页`)

  ok(
    '③ 课件调序',
    `改前「${ha}」第 ${a1 + 1} 页 → 改后第 ${a2 + 1} 页 | 「${hb}」第 ${b1 + 1} 页 → 第 ${b2 + 1} 页`
  )
}

/* ------------------------- ④ 缓存钥匙 ------------------------- */

function sectionFour(): void {
  const same = deckKeyOf(plan, 'auto', deck.map((p) => ({ ...p })))
  const key = deckKeyOf(plan, 'auto', deck)
  if (!sameDeckKey(key, same)) {
    fail('④ 缓存：同一叠课件（内容一样、对象不同）算成了两把钥匙 → 老师再点一次还得重算一遍')
  }

  const oneChar = deck.map((p, i) => (i === EDIT_AT ? { ...p, title: NEW_TITLE } : p))
  const cases: [string, string, DeckPage[]][] = [
    ['改一个标题', '④ 缓存：改了一个标题钥匙没变 → 命中旧叠，老师白改', oneChar],
    ['删一页', '④ 缓存：删掉一页钥匙没变', deck.slice(1)],
    ['调个序', '④ 缓存：页序换了钥匙没变', deck.slice().reverse()],
  ]
  for (const [label, msg, pages] of cases) {
    if (sameDeckKey(key, deckKeyOf(plan, 'auto', pages))) fail(`${msg}（${label}）`)
  }
  if (sameDeckKey(key, deckKeyOf(plan, 'standard', deck))) {
    fail('④ 缓存：换了密度档钥匙没变（D 档那条老毛病会回来）')
  }

  /* 命中即返回：四处都走同一个判据，且都在 buildStudentSlides 之前 return → 命中不发请求 */
  const src = readFileSync('src/lib/student.ts', 'utf8')
  const sites = (src.match(/sameDeckKey\(/g) ?? []).length
  const returns = (src.match(/sameDeckKey\([^)]*\)\)\s*return/g) ?? []).length
  if (sites < 5) fail(`④ 缓存：sameDeckKey 应出现 5 次（1 处定义 + 4 处命中），实得 ${sites} 次`)
  if (returns !== 4) fail(`④ 缓存：「命中即返回」应有 4 处，实得 ${returns} 处`)
  if (src.indexOf('sameDeckKey(cached, key)') > src.indexOf('buildStudentSlides(plan, cfg')) {
    fail('④ 缓存：命中判断排在生成之后，那已经不是缓存了')
  }
  if (!/\},\s*deckPages\)/.test(src)) {
    fail('④ 缓存：生成时没把这一叠课件交给 buildStudentSlides（第 4 个参数缺失）')
  }

  /* 界面那一半：改完要标过期、未生成时下载按钮灰着 */
  const app = readFileSync('src/App.tsx', 'utf8')
  if (!/deckFingerprint\(deck\)\s*!==\s*student\.fingerprint/.test(app)) {
    fail('④ 界面：App 没拿当前课件的指纹与这一叠学生版的指纹比，改完不会标过期')
  }
  if (!/studentStale=\{studentStale\}/.test(app)) fail('④ 界面：studentStale 没传给结果页')
  if (/void\s+ensureStudent|ensureStudent\(\)/.test(app)) {
    fail('④ 界面：App 里还有自动生成（§六：老师没点就不许调模型）')
  }

  const result = readFileSync('src/components/Result.tsx', 'utf8')
  /* 默认档 = 课件。TASKS/21 §二.6 起，起手档位可以由本机存档接回（initialTab），
     所以判两处：props 默认值必须写 'deck'，state 必须就吃这一颗。 */
  if (!/initialTab = 'deck'/.test(result)) {
    fail('④ 界面：结果页默认档不是「课件」——打开就先看学生版了')
  }
  if (!/useState<'deck'\s*\|\s*'student'>\(initialTab\)/.test(result)) {
    fail('④ 界面：当前档位不是从 initialTab 起的（默认值被绕开了）')
  }

  /* TASKS/18 §三：生成按钮不许只活在「学生版」那一档里。
     老师改完课件人停在课件档，动作条就在那儿；这一段截的是 rs-gen 那一条（四个状态都在里面），
     一旦有人把按钮挪回 tab 里，这里立刻红。 */
  const barAt = result.indexOf('className="rs-gen"')
  if (barAt < 0) {
    fail('④ 界面：课件档底下没有动作条（rs-gen）——「生成学生版 PPT」又只剩学生版那一档能点了')
  } else {
    const bar = result.slice(barAt, barAt + 2000)
    if (!/\bonGenerate\b/.test(bar)) fail('④ 界面：课件档的动作条里没有生成入口 onGenerate')
    if (!bar.includes('生成学生版')) fail('④ 界面：课件档的动作条文案里没有「生成学生版」')
    /* 2026-11-22 口径：生成中那颗按钮从「正在生成…」改成可点的「停止生成」
       （再点一下中断，已经出来的页留着）；状态话术挪到 RunMeter 那一条。 */
    if (!bar.includes('停止生成')) fail('④ 界面：生成中那颗按钮不是可点的「停止生成」')
    if (!bar.includes('继续生成学生版 PPT')) fail('④ 界面：中断之后没有「继续生成学生版 PPT」的入口')
    if (!bar.includes('上一版已过期')) fail('④ 界面：课件改过之后那句「上一版已过期」不见了')
  }
  if (!/async function onGenerate[\s\S]{0,400}setTab\('student'\)/.test(result)) {
    fail("④ 界面：生成完没有自动切到「学生版」档（onGenerate 里没有 setTab('student')）")
  }
  for (const badge of ['学生版 · 未生成', '学生版 · 画图中']) {
    if (!result.includes(badge)) fail(`④ 界面：tab 上的角标「${badge}」不见了`)
  }

  const preview = readFileSync('src/components/PptPreview.tsx', 'utf8')
  const wanted: [string, string][] = [
    ['未生成时那句话', '课件改好了吗？改好就生成学生版。'],
    ['生成按钮', '生成学生版 PPT'],
    ['过期提示', '上一版已过期'],
    ['下载灰着时的字', '还没生成'],
  ]
  for (const [label, text] of wanted) {
    if (!preview.includes(text)) fail(`④ 界面：${label}「${text}」不见了`)
  }

  ok(
    '④ 缓存与过期',
    `同一叠 → 同一把钥匙（${key.fingerprint}）| 改一字 / 删一页 / 调序 / 换档 四路必换 | 命中 4 处都在生成之前 | 界面：默认在课件档 + 课件档动作条 + tab 角标齐`
  )
}

/* --------------------------------- 主流程 --------------------------------- */

function main(): void {
  console.log(`-- 课件 ${deck.length} 页（planForScale 240s）--`)
  console.log(`  ${deckLine(deck)}`)

  const derivedAll = slidesFromDeck(deck, plan, limits)
  console.log(`-- 学生版（模型没接上时从这叠课件推）${derivedAll.length} 页 --`)
  console.log(`  ${titlesOf(derivedAll).map((t, i) => `${i + 1}「${t}」`).join(' ')}`)

  sectionOne()
  sectionTwo()
  sectionThree()
  sectionFour()

  if (errs.length > 0) {
    console.error(`\n✗ 课件 → 学生版 ${errs.length} 处不合格：`)
    for (const e of errs) console.error(`  · ${e}`)
    process.exit(1)
  }
  console.log('\n全部通过。')
}

main()