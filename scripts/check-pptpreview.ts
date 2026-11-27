/**
 * 「PPT 先预览后下载」的离线门禁（12 §一 / §三）。
 *
 * 第 12 件把这一层从「教师课件的第二个编辑器」换成了**学生版课堂 PPT 的只读预览**。
 * 旧口径（预览层用 deck.ts 五把刀改页、下载教师课件）已经作废，这个脚本跟着换：
 *
 *   A. 接线：生成 PPT 只开预览层，不落盘；预览层拿的是 student.slides，
 *      不是 deck；文件名走 classroomPptxName，不是 coursewarePptxName。
 *   B. 内容：真出一份 .pptx，逐页解 XML，不许出现教学动作词
 *      （环节 / 引导 / 预设 / 布置 / 板书 / 说课 / 本课）与说课开场白；
 *      页数必须等于 StudentSlide[] 的页数，且不跟着课件页数走（不是 1:1 复制）。
 *   C. 场景：没有场景时，animated=true 也一个媒体文件都不插，按钮也不能叫动态版；
 *      有场景时才插 GIF，静态版永远零媒体。
 *   D. 视觉硬约束：16:9 纸面吃主题纸墨、遮罩压得住跟走、无渐变无模糊、圆角 2px。
 *
 * .pptx 只写 /tmp，仓库里不留文件。
 *
 * 跑法：
 *   npm run check:pptpreview
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { GUIHUA_STUDENT_SLIDES, guihuaYu } from '../src/data/guihua'
import { allocate } from '../src/lib/timing'
import { buildDeck, type DeckPage } from '../src/lib/deck'
import { applySlideScenes, findTeacherWords, hasSlideScenes, type StudentSlide } from '../src/lib/slides'
import { classroomPptxName } from '../src/lib/student'
import { countPptxPages, downloadPptx } from '../src/lib/pptx'
import { limitsFor } from '../src/lib/scale'

const OUT = '/tmp/yike-check-pptpreview'
const failures: string[] = []
const fail = (msg: string) => failures.push(msg)
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${label}: 实得 ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`)
  }
}

function readRepoFile(rel: string): string {
  for (const p of [rel, `../${rel}`]) {
    try {
      return execFileSync('/bin/cat', [p], { encoding: 'utf8' })
    } catch {
      /* 下一个候选路径 */
    }
  }
  throw new Error(`读不到 ${rel}：离线校验需要从仓库根跑`)
}

function unzip(entry: string, file: string): string {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', file, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return ''
  }
}

function entries(file: string): string[] {
  try {
    return execFileSync('/usr/bin/unzip', ['-Z1', file], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** ppt/media/ 下的真文件：排除 zip 里的目录条目（结尾斜杠），只数真插进去的图 */
function mediaFiles(file: string): string[] {
  return entries(file).filter((e) => /^ppt\/media\/[^/]+$/.test(e))
}

/** 一页 slide XML 里的可见文字（<a:t> 全部拼起来） */
function slideText(xml: string): string {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .join(' ')
}

const page = readRepoFile('src/components/Result.tsx')
const overlay = readRepoFile('src/components/PptPreview.tsx')
const css = readRepoFile('src/styles.css')
/** 注释里可以解释「不写图位」——只看真渲染的代码 */
const overlayCode = overlay
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\/\/.*$/gm, '')

/* ------------------------- A. 接线：学生版，不是教师课件 ------------------------- */

if (!/from '\.\.\/lib\/student'/.test(page) || !/usePptxExport/.test(page)) {
  fail('Result 没接 usePptxExport（学生版导出的唯一入口）')
}
if (!/applySlideScenes\(student\.slides, deck\)/.test(page)) {
  fail('Result 没把场景按课件页分给学生版：applySlideScenes(student.slides, deck) 找不到')
}
if (!/classroomPptxName\(plan\.meta\.topic\)/.test(page)) {
  fail('Result 导出的文件名不是课堂 PPT（classroomPptxName）')
}

// 右栏只有两档：课件 / 学生版（TASKS/18 起「学生版」后面跟状态角标，字面量在 studentTab 里）
if (!/>\s*课件\s*<\/button>/.test(page)) fail('右栏切换少了「课件」这一档')
if (!/>\s*\{studentTab\}\s*<\/button>/.test(page) || !/const studentTab =[\s\S]{0,160}'学生版/.test(page)) {
  fail('右栏切换少了「学生版」这一档')
}

// 预览层真的被渲染，且四根线都接上：页、主题、下载态、页码
if (!/<PptPreview/.test(page)) fail('Result 没有渲染 PptPreview')
for (const prop of ['slides={', 'theme={', 'exportState={', 'index={', 'onIndex={']) {
  if (!new RegExp(`<PptPreview[\\s\\S]{0,300}?${prop.replace('{', '\\{')}`).test(page)) {
    fail(`PptPreview 没接上 ${prop}…}`)
  }
}
if (!/onDownload=\{\(animated\) => void handleExportPptx\(animated\)\}/.test(page)) {
  fail('预览层没接下载回调')
}

// 预览层只读：不许自己存一份页、不许 import deck 的编辑函数
if (/useState<[^>]*StudentSlide\[\]/.test(overlay) || /setSlides\(/.test(overlay)) {
  fail('预览层自己存了一份 StudentSlide[]：演示与下载就不再是同一份')
}
if (/from '\.\.\/lib\/deck'/.test(overlay)) fail('预览层引了 deck.ts：学生版不该认识课件')
if (/slide\.duration|pages=\{|deck#/.test(overlay)) {
  fail('预览层出现时长 / 课件页号：这一层只给学生看，不摆教案')
}
if (!/SLIDE_LABELS\[slide\.kind\]/.test(overlay)) fail('预览层没走学生版页名（SLIDE_LABELS）')

/* ------------------------- A2. 预览等于成品 ------------------------- */

// 老师的台词不进页框：只在下方的「讲稿」里
if (/ppt-notes/.test(overlayCode)) fail('预览层的备注还印在页框里')
if (!/讲稿/.test(overlayCode)) fail('预览层没有「讲稿」这一行')
// 图位只是一个空框：不写「图位」，也不把检索词印给学生
if (/图位/.test(overlayCode)) fail('预览层页框里还写着「图位」')
if (/imageHint\}/.test(overlayCode)) fail('预览层把检索词印进了页框')
// 场景角标删掉
if (/SCENE_NAME|场景 ·/.test(overlayCode)) fail('预览层还挂着「场景 · …」角标')
// 页框底色走 paperOf（封面吃封面纸），不许用容器灰
if (!/paperOf\(theme, slide\.kind\)/.test(overlayCode)) fail('页框底景没走 paperOf(theme, kind)')


/* ------------------------- B. 真出一份：内容与页数 ------------------------- */

mkdirSync(OUT, { recursive: true })
const plan = guihuaYu
const deck: DeckPage[] = buildDeck(plan, allocate(plan.segments, plan.meta.duration))
const slides = GUIHUA_STUDENT_SLIDES
/* 内置稿现在是 lesson m40 档的源（16 页实料）：导出校验必须递生成侧同一份 limits，
   不给则缺省三档并集 ENVELOPE（clip 10–14），16 页会被误拒——与 usePptxExport.run 同口径。 */
const LIMITS = limitsFor('standard', 'lesson', 2400)

// 场景先全清掉：这一节只验内容，不验图
const plain: StudentSlide[] = slides.map((s) => (s.scene ? { ...s, scene: '' } : s))
const plainFile = `${OUT}/student-plain.pptx`
try {
  await downloadPptx(plain, undefined, plainFile, undefined, { limits: LIMITS })
} catch (e) {
  fail(`学生版没能出片 —— ${e instanceof Error ? e.message : String(e)}`)
}

const zip = entries(plainFile)
const slideXmls = zip
  .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
  .sort((a, b) => Number(/(\d+)/.exec(a)?.[1]) - Number(/(\d+)/.exec(b)?.[1]))
  .map((e) => unzip(e, plainFile))

eq('导出的页数 = 学生版数组页数', slideXmls.length, countPptxPages(slides))
if (slideXmls.length === deck.length) {
  fail(`导出的页数 ${slideXmls.length} 与课件页数相同：又变成课件原样转了，学生版页数要跟着内容量走`)
}

const TEACHER_WORDS = ['环节', '引导', '预设', '布置', '板书', '说课', '本课']
slideXmls.forEach((xml, i) => {
  const text = slideText(xml)
  for (const w of TEACHER_WORDS) {
    if (text.includes(w)) fail(`第 ${i + 1} 页正文出现教学动作词「${w}」：${text.slice(0, 80)}`)
  }
  if (/各位评委老师好|我说课的题目|本节课|本课时/.test(text)) {
    fail(`第 ${i + 1} 页出现说课 / 教案话头：${text.slice(0, 80)}`)
  }
})

// 课件页眉那种「环节 07 03:12」的痕迹：学生版页脚只许页码
const notesXmls = zip
  .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
  .map((e) => slideText(unzip(e, plainFile)))
const allNotes = notesXmls.join('\n')
for (const w of TEACHER_WORDS) {
  if (allNotes.includes(w)) fail(`备注里出现教学动作词「${w}」（备注是念给学生听的）`)
}
if (/各位评委老师好|说课|教案/.test(allNotes)) fail('备注里还是说课稿 / 教案腔')

/* ------------------------- C. 场景：没场景不许叫动态版 ------------------------- */

const noMedia = mediaFiles(plainFile)
if (noMedia.length > 0) fail(`学生版没场景时仍插了 ${noMedia.length} 个媒体文件：${noMedia.slice(0, 3).join(' ')}`)
if (hasSlideScenes(plain)) fail('清空场景后 hasSlideScenes 仍为 true')

const animatedFile = `${OUT}/student-animated.pptx`
try {
  await downloadPptx(plain, undefined, animatedFile, undefined, { animated: true, limits: LIMITS })
} catch (e) {
  fail(`学生版动态版没能出片 —— ${e instanceof Error ? e.message : String(e)}`)
}
const animMedia = mediaFiles(animatedFile)
if (animMedia.length > 0) {
  fail(`没有场景却导出了 ${animMedia.length} 个媒体文件：animated 只该在页面真有场景时插图`)
}

// 有场景才插图：给两页挂花瓣，静态版仍是零媒体
const withScene = applySlideScenes(plain, deck).map((s, i) => (i === 1 || i === 4 ? { ...s, scene: 'petals' as const } : s))
if (!hasSlideScenes(withScene)) fail('挂了场景后 hasSlideScenes 仍为 false')
const sceneFile = `${OUT}/student-scene.pptx`
try {
  await downloadPptx(withScene, undefined, sceneFile, undefined, { animated: true, limits: LIMITS })
} catch (e) {
  fail(`有场景的学生版没能出片 —— ${e instanceof Error ? e.message : String(e)}`)
}
const sceneMedia = mediaFiles(sceneFile)
if (sceneMedia.length !== 2) fail(`两页有场景，应插 2 个媒体文件，实得 ${sceneMedia.length}`)
const sceneStatic = `${OUT}/student-scene-static.pptx`
try {
  await downloadPptx(withScene, undefined, sceneStatic, undefined, { animated: false, limits: LIMITS })
} catch (e) {
  fail(`有场景的静态版没能出片 —— ${e instanceof Error ? e.message : String(e)}`)
}
const sceneStaticMedia = mediaFiles(sceneStatic)
if (sceneStaticMedia.length > 0) fail(`静态版插了 ${sceneStaticMedia.length} 个媒体文件：一张图都不许有`)

// 只留一颗「下载 PPT」：不再摆「静态版 / 动态版」两个按钮，也不写状态文案
if (/本课无动态/.test(overlay)) fail('预览层还在写「本课无动态」')
if (/下载静态版|下载动态版/.test(overlay)) fail('预览层还摆着两个下载按钮')
if (!/下载 PPT/.test(overlay)) fail('预览层缺一个「下载 PPT」')

/* ------------------------- D. 视觉硬约束 ------------------------- */

const slideRules = [...css.matchAll(/\.ppt-slide\s*\{[^}]*\}/g)].map((m) => m[0])
if (slideRules.length === 0) fail('styles.css 里没有 .ppt-slide 的样式')
const merged = slideRules.join('\n')
if (!/aspect-ratio:\s*16\s*\/\s*9/.test(merged)) fail('.ppt-slide 不是 16:9（和导出的 pptx 纸形对不上）')
if (!/color:\s*var\(--ink\)/.test(merged)) fail('.ppt-slide 没吃主题 ink（换肤后纸面还是旧墨）')
if (!/background:\s*var\(--paper\)/.test(merged)) fail('.ppt-slide 没吃主题纸')
// 页框里不许出滚动条：最后一条 overflow 声明必须是 hidden
const overflowRules = slideRules.filter((r) => /overflow:/.test(r))
const lastOverflow = overflowRules[overflowRules.length - 1] ?? ''
if (!/overflow:\s*hidden/.test(lastOverflow)) fail('.ppt-slide 还留着滚动：页框里不许出滚动条')
for (const banned of ['linear-gradient', 'backdrop-filter']) {
  if (css.includes(banned)) fail(`样式表出现禁用项 ${banned}`)
}
// 圆角只有 2px（var(--radius)）；50% 只允许用在 5–6px 的圆点上（停顿点 / 麦克风）
const radiusBad = [...css.matchAll(/border-radius:\s*([^;]+);/g)]
  .map((m) => m[1].trim())
  .filter((v) => v !== 'var(--radius)' && v !== 'inherit' && v !== '0' && v !== '50%')
if (radiusBad.length) fail(`出现非 2px 圆角：${radiusBad.slice(0, 4).join(' / ')}`)
// 预览层的每一块盒子都必须是 2px 直角，圆点不在其中
for (const r of slideRules.concat([...css.matchAll(/\.(?:ppt-figure|ppt-script-text|ppt-panel|ask-box)\s*\{[^}]*\}/g)].map((m) => m[0]))) {
  const radius = /border-radius:\s*([^;]+);/.exec(r)?.[1]?.trim()
  if (radius === '50%') fail('预览区的盒子被做成了圆：只许 2px 直角')
}

// 文件名：课堂 PPT，不是「课件-2」
const name = classroomPptxName(plan.meta.topic)
if (!/课堂PPT\.pptx$/.test(name)) fail(`文件名 ${name} 不是课堂 PPT`)
if (/课件/.test(name)) fail(`文件名 ${name} 还带着「课件」：学生会以为是老师那份`)

// 判定源自检：教师词清单与 slides.ts 那份必须一致
for (const w of TEACHER_WORDS) {
  if (!findTeacherWords(w).includes(w)) fail(`findTeacherWords 漏了「${w}」`)
}

/* ------------------------- 逐页目录（验收存证） ------------------------- */

// 只打上屏文字（title / line / items），notes 不进表——备注已整份查过教学动作词
console.log(`\n  学生版逐页（${slides.length} 页）`)
slides.forEach((s, i) => {
  const head = [s.title, s.line ?? '', ...(s.items ?? [])].filter((t) => String(t ?? '').trim()).join(' / ')
  console.log(`   ${String(i + 1).padStart(2)}. [${s.kind}] ${head}`)
})

/* ------------------------- 汇总 ------------------------- */

console.log('  接线：两档切换（课件 / 学生版）| 学生版预览层只读 | 预览 = 下载同一份 StudentSlide[]')
console.log(
  `  出片：学生版 ${countPptxPages(slides)} 页（课件 ${deck.length} 页，不 1:1）| 逐页 XML 零教学动作词 | 备注零说课腔`
)
console.log('  场景：无场景 animated 零媒体 | 两页花瓣 → 2 个 GIF | 静态版零媒体 | 只有一颗「下载 PPT」')
console.log('  视觉：页框 16:9 吃主题纸墨 | 备注销出页框进「讲稿」 | 图位只留空框 | 无滚动条 · 无渐变 · 圆角 2px')

rmSync(OUT, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ PPT 预览层 ${failures.length} 处不合格：`)
  for (const f of failures.slice(0, 30)) console.error('  - ' + f)
  if (failures.length > 30) console.error(`  …另有 ${failures.length - 30} 处`)
  process.exit(1)
}
console.log('\n✓ PPT 先预览后下载：接线 / 学生版内容 / 场景标注 / 视觉 全部通过')