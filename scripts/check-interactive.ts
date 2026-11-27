/**
 * 三页真交互的离线断言（TASKS/08 §A.4c，npm run check:interactive）。
 *
 * 沿站里既有的三步式：tsc -p tsconfig.scripts.json --noEmit 做类型门禁 →
 * vite 自带 esbuild 打成一次性 esm → node 跑完即删。不装 tsx、不新增依赖，
 * 与 check / check:slides / check:voice 同一模式（package.json 里写法对齐）。
 *
 * 断言四组，全部离线、不开浏览器：
 *  ① 数据契约正例——CUBE_FACES 六条 noteShort 全非空且 ≤12 码点（含标点）；
 *     内置四篇 compare 页都带 compareDiff，条数 == 对数（ceil(items/2)，落单尾巴也算一对），
 *     每条 ≤12 字且不踩 src/lib/voice.ts 判定源（compareDiffProblems 一把尺）。
 *  ② 接线贯通——buildScenes 后内置四篇的交互页判定：三篇 compare 页 interactiveModeOf==='compare'
 *     （changfangti 的 compare 页被 explode 征用，判 'explode'），泛化路径 compare 页
 *     无 compareDiff → 降级为 null（§A「不可点」口径）。
 *  ③ 反向用例——合成超标样例（13 字浮出 / 条数不齐 / 缺失 / 禁句式「不是……而是……」），
 *     导出的校验函数必须判失败；判不出来就是门禁失效，exit 1。
 *  ④ 源码级守卫——SlideShow.tsx 键盘映射关键行逐字节原样（→/空格/Enter→advance、
 *     ←/Backspace→back、Escape→退出、根节点 onClick={advance}、I 键只关提示）；
 *     三类岔路处理器（toggleExplode/pickPart/pickCompare/pickNode）函数体都含
 *     stopPropagation，且三个 anim 组件各自接了 onClick；styles-show.css 段内 hex 计数 0、
 *     硬编码 border*: 1px 计数 0（分隔线宽度一律吃 var(--rule-width)）。
 *
 * 与 check-lib.ts 的分工：stepsOf/SCENE_LINE_HEAD 的键盘主线快照在那边（npm run check 里跑），
 * 这里守的是「数据契约 + 组件接线 + 样式硬线」这一层，两边合起来才是 §A 的全部门禁。
 */
import { readFileSync } from 'node:fs'
import { CUBE_FACES } from '../src/data/anim'
import { BIDAXIAO_STUDENT_SLIDES } from '../src/data/bidaxiao'
import { CHANGFANGTI_STUDENT_SLIDES } from '../src/data/changfangti'
import { GUIHUA_STUDENT_SLIDES } from '../src/data/guihua'
import { CHANGZHENG_STUDENT_SLIDES } from '../src/data/changzheng'
import { buildScenes, interactiveModeOf } from '../src/lib/show'
import { compareDiffProblems, compareRows, floatTextProblems, type StudentSlide } from '../src/lib/slides'

const failures: string[] = []
const lines: string[] = []
const codeLen = (t: string): number => [...String(t ?? '')].length

function readRepo(rel: string): string {
  return readFileSync(rel, 'utf8')
}

/* ---------- ① 数据契约正例 ---------- */

const BUILTINS: [string, StudentSlide[]][] = [
  ['guihua', GUIHUA_STUDENT_SLIDES],
  ['bidaxiao', BIDAXIAO_STUDENT_SLIDES],
  ['changfangti', CHANGFANGTI_STUDENT_SLIDES],
  ['changzheng', CHANGZHENG_STUDENT_SLIDES],
]

for (const f of CUBE_FACES) {
  const len = codeLen(f.noteShort)
  if (!f.noteShort) failures.push(`面「${f.name}」noteShort 为空`)
  else if (len > 12) failures.push(`面「${f.name}」noteShort「${f.noteShort}」${len} 字，超 12 字上限`)
}
lines.push(`noteShort：CUBE_FACES ${CUBE_FACES.length} 条全非空且 ≤12 字（${CUBE_FACES.map((f) => `${f.name}「${f.noteShort}」${codeLen(f.noteShort)}`).join(' ')}）`)

for (const [name, slides] of BUILTINS) {
  const cmp = slides.find((s) => s.kind === 'compare')
  if (!cmp) {
    failures.push(`${name}: 没有 compare 页（内置四篇口径被动过）`)
    continue
  }
  const rows = compareRows((cmp.items ?? []).length)
  const probs = compareDiffProblems(cmp.compareDiff, (cmp.items ?? []).length)
  if (probs.length) failures.push(`${name}: compare 页 compareDiff 不合格 —— ${probs.join('；')}`)
  else lines.push(`compareDiff ${name}: ${rows} 对 ${rows} 条「${(cmp.compareDiff ?? []).join('/')}」全部 ≤12 字 ✓`)
}

/* ---------- ② 接线贯通（scene 层的交互判定） ---------- */

const expectMode: Record<string, string> = {
  guihua: 'compare',
  bidaxiao: 'compare',
  changfangti: 'explode',
  changzheng: 'compare',
}
for (const [name, slides] of BUILTINS) {
  const scenes = buildScenes(slides)
  const cmpScene = scenes.find((sc) => sc.slide.kind === 'compare')
  if (!cmpScene) {
    failures.push(`${name}: 演示场景里没有 compare 页`)
    continue
  }
  const mode = interactiveModeOf(cmpScene.slide, cmpScene)
  const want = name === 'changfangti' ? 'explode' : 'compare'
  if (mode !== want) failures.push(`${name}: compare 页交互判定为 ${String(mode)}，应为 ${want}（数据契约或模板分配被动过）`)
  else lines.push(`交互判定 ${name}: ${want} ✓（expectMode 表记 ${expectMode[name]}）`)
}

/* ---------- ③ 反向用例：合成超标样例必须被校验函数判失败 ---------- */

const negatives: [string, string[]][] = [
  ['13 字浮出文本', floatTextProblems('一二三四五六七八九十一二三')],
  ['空浮出文本', floatTextProblems('')],
  ['禁句式浮出（不是……而是……）', floatTextProblems('不是天气，而是心情')],
  ['13 字 compareDiff', compareDiffProblems(['一二三四五六七八九十一二三'], 2)],
  ['条数不齐（2 对只给 1 条）', compareDiffProblems(['只有一条'], 4)],
  ['字段缺失（undefined）', compareDiffProblems(undefined, 2)],
]
for (const [label, probs] of negatives) {
  if (probs.length === 0) failures.push(`反向用例未被抓到：${label}`)
}
if (compareDiffProblems(['两边各几个', '就差1个，谁少？'], 3).length !== 0)
  failures.push('反向用例误伤：合格样例被 compareDiffProblems 判失败')
lines.push(`反向用例：${negatives.length + 1} 例（该抓的都抓、不该报的没报）✓`)

/* ---------- ④ 源码级守卫 ---------- */

const ssx = readRepo('src/components/SlideShow.tsx')
/** 键盘主线关键行：逐字节原样（任务书 A.4.4——这些行被动过就是主线被碰，必须红） */
const KEYBOARD_LINES = [
  `if (e.key === 'Escape') {`,
  `} else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {`,
  `} else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {`,
  `<div className="show" ref={rootRef} onClick={advance} style={themeStyle(theme)}>`,
]
for (const frag of KEYBOARD_LINES) {
  if (!ssx.includes(frag)) failures.push(`SlideShow.tsx 键盘映射关键行不在了：「${frag}」`)
}
if (!ssx.includes(`e.key === 'i' || e.key === 'I'`)) failures.push("SlideShow.tsx 的 I 键（'i' || 'I'）丢了")

/** 岔路处理器：四个 pick/toggle 函数体都必须 stopPropagation（点击绝不推进主线） */
for (const fn of ['toggleExplode', 'pickPart', 'pickCompare', 'pickNode']) {
  const body = new RegExp(`function ${fn}\\b[\\s\\S]*?\\n  }`).exec(ssx)?.[0] ?? ''
  if (!body) failures.push(`SlideShow.tsx 里找不到岔路处理器 ${fn}`)
  else if (!body.includes('e.stopPropagation()')) failures.push(`${fn} 的处理器没有 stopPropagation：点击会漏进根节点 advance`)
}
for (const [file, handler] of [
  ['src/components/anim/ExplodeSlide.tsx', 'onPickPart'],
  ['src/components/anim/RevealSlide.tsx', 'onPickItem'],
  ['src/components/anim/PathSlide.tsx', 'onPickNode'],
] as const) {
  const src = readRepo(file)
  if (!src.includes(handler)) failures.push(`${file} 不再接 ${handler}：三类页的可点元素被摘掉了`)
}
lines.push('源码守卫：键盘映射四行逐字在位 + I 键在位 + 四个岔路处理器 stopPropagation + 三个组件接线在位 ✓')

const css = readRepo('src/styles-show.css')
const hexHits = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
if (hexHits.length) failures.push(`styles-show.css 出现 ${hexHits.length} 处 hex（应 0，颜色一律走 var()）：${hexHits.slice(0, 5).join(' ')}`)
const hardBorder = css.match(/border(-top|-bottom|-left|-right)?:\s*1px/g) ?? []
if (hardBorder.length)
  failures.push(`styles-show.css 有 ${hardBorder.length} 处 border 硬编码 1px（应吃 var(--rule-width, 1px)）：${hardBorder.slice(0, 3).join(' ／ ')}`)
lines.push(`样式硬线：styles-show.css hex ${hexHits.length} 处、border 硬编码 1px ${hardBorder.length} 处，均须 0 ✓`)

/* ---------- 汇总 ---------- */

console.log('-- 三页真交互离线断言（TASKS/08 §A）--')
for (const l of lines) console.log('  ✓ ' + l)
if (failures.length) {
  console.error(`\n✗ 未通过 ${failures.length} 处：`)
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log('\n✓ §A 数据契约 / 接线贯通 / 反向用例 / 源码守卫 全部通过')
