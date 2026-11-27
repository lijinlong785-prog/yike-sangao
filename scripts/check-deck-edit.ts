/**
 * TASKS/21 的离线验收：学生版 PPT 生成后还能增删改，改完下载的就是改过的那份。
 *
 * 九条硬断言（前六条照任务书，第七条补「三处同源」的接线，第八、九条补增页）：
 *   1. 改第 3 页标题 → 导出的第 3 页是新标题，旧标题在这一页零命中
 *   2. 删第 5 页 → 页数 −1，且第 5 页独有的 40 个词在整份 pptx 里零残留
 *   3. 把第 2 页移到第 1 位 → 导出的第 1 页 = 原来的第 2 页
 *   4. 改 3 处 + 删 1 页 + 换模板 → 四套模板各导一份，3 处改动逐字都在
 *   5. applyEdits 是纯函数：连跑两次结果相同，原 slides 数组一个字节没动
 *   6. 清空 edits（= 重新生成）→ 页数与内容回到原稿
 *   7. 预览 / 放映 / 下载三处读的都是 applyEdits 之后的那一叠（静态接线）
 *   8. 增页（§二.5）：插一页 → 页数 +1、排在当前页之后、导出与换模板都带它、
 *      删新页 / 删原页 / 挪新页都能回去，原 slides 仍然一个字节没动
 *   9. 新页可选页型（§二.5）：十种页型与整份 PPT 同一套，各插一张都能过导出校验
 *
 * 交付：/tmp/q21-before.pptx、/tmp/q21-after.pptx、/tmp/q21-edit.png、/tmp/q21-dump.txt
 *
 * 跑法：npm run check:deck-edit
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { findText } from '../src/data/texts'
import { limitsFor } from '../src/lib/scale'
import type { DensityLimits } from '../src/lib/density'
import { SLIDE_KINDS, SLIDE_LABELS, getBuiltinStudentSlides, validateSlides, type StudentSlide } from '../src/lib/slides'
import { skeletonPlan } from '../src/lib/skeleton'
import { downloadTemplatedPptx } from '../src/lib/pptx'
import { place } from '../src/lib/deck2/place'
import { INSERTABLE, INSERT_LABELS, newPage, type InsertKind } from '../src/lib/deck2/newPage'
import { FAMILY_IDS, FAMILY_REPS, TEMPLATES, type DeckTheme as TemplateTheme, type TemplateId } from '../src/lib/deck2/theme'
import {
  EMPTY_EDITS,
  addAfter,
  applyEdits,
  editCount,
  isEdited,
  moveAt,
  moveOriginal,
  patchOriginal,
  patchRef,
  removeAt,
  removeOriginal,
  stackLimits,
  type DeckEdits,
} from '../src/lib/deck2/edits'
import { encodePng, type RgbaImage } from '../src/lib/watermark'
import type { LessonInput } from '../src/types'

const OUT = '/tmp'
const FAIL: string[] = []
const fail = (msg: string) => FAIL.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

/* ------------------------------ pptx 读取 ------------------------------ */

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

/** 一页 slide XML 里所有 <a:t> 的文字：按页序返回 */
function slideTexts(file: string): string[] {
  const zip = entries(file)
  if (zip.length === 0) return []
  return zip
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort((a, b) => Number(/(\d+)/.exec(a)?.[1]) - Number(/(\d+)/.exec(b)?.[1]))
    .map((e) =>
      [...unzip(e, file).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
        .join(' ')
    )
}

/* -------------------------------- 夹具 -------------------------------- */

const entry = findText('观潮')
if (!entry) {
  console.error('✗ 找不到内置《观潮》，这一份门禁跑不起来')
  process.exit(1)
}
const input: LessonInput = {
  topic: '观潮',
  subject: '语文',
  stage: '小学',
  grade: '四年级',
  period: '第一课时',
  textbook: '部编版',
  duration: 2400,
  text: entry.quotes.join('\n'),
}
const LIMITS = limitsFor('standard', 'lesson', 2400)
const RAW: StudentSlide[] = getBuiltinStudentSlides(skeletonPlan(input), LIMITS)
const N = RAW.length
console.log(`-- 《观潮》学生版 ${N} 页（${LIMITS.pagesMin}–${LIMITS.pagesMax} 页区间）--`)

/** 改完删完插完之后页数会掉出 / 超出区间：导出只对「这一叠实际页数」负责（与产品同一份） */
function limitsOf(list: StudentSlide[]): DensityLimits {
  return stackLimits(LIMITS, list.length)
}

async function exportPptx(list: StudentSlide[], id: TemplateId, file: string): Promise<string[]> {
  rmSync(file, { force: true })
  await downloadTemplatedPptx(list, TEMPLATES[id], undefined, file, { animated: false, limits: limitsOf(list) })
  return slideTexts(file)
}

/** 备注页的文字（讲稿就落在这里，不进页面）：按 notesSlideN 的顺序返回 */
function notesTexts(file: string): string[] {
  return entries(file)
    .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]))
    .map((e) =>
      [...unzip(e, file).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
        .join(' ')
    )
}

async function exportNotes(list: StudentSlide[], id: TemplateId, file: string): Promise<string[]> {
  rmSync(file, { force: true })
  await downloadTemplatedPptx(list, TEMPLATES[id], undefined, file, { animated: false, limits: limitsOf(list) })
  return notesTexts(file)
}

const snap = (list: StudentSlide[]): string => JSON.stringify(list)
const ORIGINAL = snap(RAW)

/* --------------------------- 1 · 改第 3 页标题 --------------------------- */

/**
 * 改标题这一条要挑一页「改得动」的页：原文页的标题必须等于原文（validateSlides 会拦），
 * 封面也不该拿来做文字实验。以前写死第 3 页，页序一改就撞上原文页。
 */
const EDIT_AT = RAW.findIndex((s) => s.kind !== 'cover' && s.kind !== 'quote')
const PAGE_NO = EDIT_AT + 1
if (EDIT_AT < 0) {
  console.error('✗ 这一叠里没有可改标题的正文页')
  process.exit(1)
}

/**
 * 第 4 条要改的三处标题：封面 + 两页正文。原文页的标题就是原文（validateSlides 会拦掉），
 * 所以不问页序、只问页型——这样内容层一改页数也不用回来改门禁。
 */
const PATCH_AT = [
  0,
  ...RAW.map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i > 0 && s.kind !== 'quote')
    .slice(0, 2)
    .map(({ i }) => i),
]

/** 一页上的字：它自己的 title / text / line / items / note */
const pageText = (s: StudentSlide): string =>
  [s.title, s.text, s.line, s.note, ...(s.items ?? [])].filter(Boolean).join(' ')

/**
 * 删哪一页：挑「字最多」的那一页（封面与要改标题的页不参与）。
 * 以前写死第 5 页，内容一变那一页就只剩三句话，独有词凑不到四十个。
 */
const DEL_AT =
  RAW.map((s, i) => ({ s, i }))
    .filter(({ i }) => i > 0 && !PATCH_AT.includes(i))
    .sort((a, b) => pageText(b.s).length - pageText(a.s).length)[0]?.i ?? 1

console.log(`\n=== 1. 改第 ${PAGE_NO} 页标题：导出的第 ${PAGE_NO} 页是新标题，旧标题零命中 ===`)
const OLD3 = RAW[EDIT_AT]?.title ?? ''
const NEW3 = '把这一句读三遍'
const e1 = patchOriginal(EMPTY_EDITS, N, EDIT_AT, { title: NEW3 })
const list1 = applyEdits(RAW, e1)
const texts1 = await exportPptx(list1, 'suke', `${OUT}/q21-title.pptx`)
if (list1[EDIT_AT]?.title !== NEW3) fail(`1 applyEdits 后第 ${PAGE_NO} 页标题是「${list1[EDIT_AT]?.title}」，应为「${NEW3}」`)
if (!texts1[EDIT_AT]?.includes(NEW3)) fail(`1 导出的第 ${PAGE_NO} 页没有新标题「${NEW3}」：${texts1[EDIT_AT]?.slice(0, 60) ?? '（空）'}`)
else ok(`1 第 ${PAGE_NO} 页换了新标题`, `「${OLD3}」→「${NEW3}」`)
if (texts1[EDIT_AT]?.includes(OLD3)) fail(`1 导出的第 ${PAGE_NO} 页还留着旧标题「${OLD3}」`)
else ok('1 旧标题在这一页零命中', `第 ${PAGE_NO} 页 ${texts1[EDIT_AT]?.length ?? 0} 字`)

/* ----------------------------- 2 · 删第 5 页 ----------------------------- */

console.log(`\n=== 2. 删第 ${DEL_AT + 1} 页：页数 −1，这一页独有的 40 个词零残留 ===`)
const e2 = removeOriginal(EMPTY_EDITS, N, DEL_AT)
const list2 = applyEdits(RAW, e2)
if (list2.length !== N - 1) fail(`2 删一页后是 ${list2.length} 页，应为 ${N - 1} 页`)
if (list2.some((s) => s === RAW[DEL_AT])) fail(`2 被删的第 ${DEL_AT + 1} 页还在结果里（只隐藏没真删）`)
const texts2 = await exportPptx(list2, 'suke', `${OUT}/q21-del.pptx`)
if (texts2.length !== N - 1) fail(`2 导出的 pptx 是 ${texts2.length} 页，应为 ${N - 1} 页`)
else ok('2 导出的页数跟着少一页', `${N} → ${texts2.length}`)

/** 其它页 + 页脚（课题） + 页名：这些是「不独有」的来源，先把它们排掉 */
const othersText =
  RAW.filter((_, i) => i !== DEL_AT).map(pageText).join(' ') +
  ' ' +
  input.topic +
  ' ' +
  Object.values(SLIDE_LABELS).join(' ')
const shingles = new Set<string>()
for (const piece of pageText(RAW[DEL_AT]).split(/[\s，。；：、！？「」“”（）]+/)) {
  const chars = [...piece]
  for (const size of [2, 3]) {
    for (let i = 0; i + size <= chars.length; i++) {
      const token = chars.slice(i, i + size).join('')
      if (!othersText.includes(token)) shingles.add(token)
    }
  }
}
const unique = [...shingles].filter((t) => t.trim().length > 0)
const probe = unique.slice(0, 40)
if (probe.length < 40) fail(`2 第 ${DEL_AT + 1} 页只挑得出 ${probe.length} 个独有词，凑不够 40 个（夹具太薄）`)
const leaked = probe.filter((t) => texts2.some((text) => text.includes(t)))
if (leaked.length) fail(`2 删了第 ${DEL_AT + 1} 页，却有 ${leaked.length} 个它的词还留在 pptx 里：${leaked.slice(0, 6).join(' / ')}`)
else ok(`2 第 ${DEL_AT + 1} 页的词零残留`, `${probe.length} 个独有词全部不在导出里（如「${probe[0]}」「${probe[1]}」）`)

/* ---------------------------- 3 · 第 2 页挪到第 1 位 ---------------------------- */

console.log('\n=== 3. 第 2 页移到第 1 位：导出的第 1 页就是原来的第 2 页 ===')
const e3 = moveOriginal(EMPTY_EDITS, N, 1, -1)
const list3 = applyEdits(RAW, e3)
if (list3[0] !== RAW[1] || list3[1] !== RAW[0]) fail('3 调序后前两页不是原来的第 2、1 页')
const texts3 = await exportPptx(list3, 'suke', `${OUT}/q21-move.pptx`)
if (!texts3[0]?.includes(RAW[1].title)) fail(`3 导出的第 1 页没有原第 2 页的标题「${RAW[1].title}」`)
else ok('3 第 1 页是原来的第 2 页', `「${RAW[1].title}」`)
if (!texts3[1]?.includes(RAW[0].title)) fail(`3 导出的第 2 页没有原第 1 页的标题「${RAW[0].title}」`)
else ok('3 第 2 页是原来的第 1 页', `「${RAW[0].title}」`)

/* ------------------- 4 · 改 3 处 + 删 1 页 + 换模板 ------------------- */

console.log('\n=== 4. 改 3 处 + 删 1 页 + 换模板：四套各导一份，3 处改动逐字都在 ===')
const PATCHES: { at: number; title: string }[] = [
  { at: PATCH_AT[0], title: '把课题读三遍' },
  { at: PATCH_AT[1], title: '圈出这个动作' },
  { at: PATCH_AT[2], title: '找出两处证据' },
]
let e4: DeckEdits = EMPTY_EDITS
for (const p of PATCHES) e4 = patchOriginal(e4, N, p.at, { title: p.title })
e4 = removeOriginal(e4, N, DEL_AT)
const list4 = applyEdits(RAW, e4)
if (list4.length !== N - 1) fail(`4 改完删完是 ${list4.length} 页，应为 ${N - 1} 页`)

/* after 这一份给眼睛看：换的是宣纸那套版面，文字改过 3 处、少 1 页 */
const afterTexts = await exportPptx(list4, 'xuan', `${OUT}/q21-after.pptx`)
const beforeTexts = await exportPptx(RAW, 'suke', `${OUT}/q21-before.pptx`)
if (beforeTexts.length !== N) fail(`原稿导出 ${beforeTexts.length} 页，应为 ${N} 页`)
else ok('原稿出片', `${beforeTexts.length} 页 → ${OUT}/q21-before.pptx（素课）`)

/* 换模板保字：六族各导一份，三处改动逐字都在（TASKS/24 起同族配色只换纸，坐标由 23 的门禁管） */
for (const id of FAMILY_IDS.map((f) => FAMILY_REPS[f])) {
  const texts = await exportPptx(list4, id, `${OUT}/q21-tpl-${id.replace(/[^\w-]/g, '')}.pptx`)
  const missing = PATCHES.filter((p) => !texts.some((t) => t.includes(p.title)))
  if (missing.length) fail(`4 ${id}：${missing.length} 处改动没进片（${missing.map((m) => m.title).join(' / ')}）`)
  else ok(`4 ${id} 三处改动逐字都在`, PATCHES.map((p) => p.title).join(' / '))
}

/* --------------------------- 5 · 纯函数 --------------------------- */

console.log('\n=== 5. applyEdits 是纯函数：两次结果相同，原数组不动 ===')
const a1 = applyEdits(RAW, e4)
const a2 = applyEdits(RAW, e4)
if (snap(a1) !== snap(a2)) fail('5 同一输入跑两次，结果不同（不是纯函数）')
else ok('5 同输入同输出', `${a1.length} 页逐字相同`)
if (snap(RAW) !== ORIGINAL) fail('5 applyEdits 把原始 slides 改了')
else ok('5 原 slides 一个字节没动', `${N} 页深比较相等`)
const untouched = RAW.map((s, i) => ({ s, i })).filter(({ i }) => !PATCHES.some((p) => p.at === i) && i !== DEL_AT)
const copied = untouched.filter(({ s }) => a1.includes(s))
if (copied.length !== untouched.length) {
  fail(`5 ${untouched.length - copied.length} 个没改过的页被复制成了新对象（纯函数不该造新引用）`)
} else ok('5 没改过的页原样返回', `${copied.length} 页保持同一引用`)

/* -------------------- 6 · 重新生成：清空 edits 回到原稿 -------------------- */

console.log('\n=== 6. 重新生成 = 清空 edits：页数与内容回到原稿 ===')
if (!isEdited(e4)) fail('6 改过 3 处 + 删 1 页，isEdited 却是 false')
else ok('6 动过就认得出', `editCount = ${editCount(e4)} 处`)
if (isEdited(EMPTY_EDITS)) fail('6 EMPTY_EDITS 被判成了「改过」')
const back = applyEdits(RAW, EMPTY_EDITS)
if (back.length !== N) fail(`6 清空 edits 后 ${back.length} 页，应回到 ${N} 页`)
else if (snap(back) !== ORIGINAL) fail('6 清空 edits 后内容与原稿不一致')
else ok('6 回到原稿', `${N} 页，逐字与原稿相同`)

/* ------------------ 7 · 三处同源（静态接线，不是靠注释） ------------------ */

console.log('\n=== 7. 预览 / 放映 / 下载三处读的都是 applyEdits 之后的那一叠 ===')
const resultSrc = readFileSync('src/components/Result.tsx', 'utf8')
const previewSrc = readFileSync('src/components/PptPreview.tsx', 'utf8')
if (!/applyEdits\(rawSlides, edits\)/.test(resultSrc)) fail('7 Result 没有把 applyEdits 的结果当唯一一叠（找不到 applyEdits(rawSlides, edits)）')
if (/slides=\{student\.slides\}/.test(resultSrc)) fail('7 还有一处把原始 student.slides 直接交给预览 / 放映')
if (!/<PptPreview[\s\S]{0,400}?slides=\{slides\}/.test(resultSrc)) fail('7 预览层拿的不是编辑后的那一叠')
if (!/<SlideShow slides=\{slides\}/.test(resultSrc)) fail('7 放映拿的不是编辑后的那一叠')
if (!/const list = slides\.length \? slides : await onEnsureStudent\(\)/.test(resultSrc)) {
  fail('7 下载拿的不是编辑后的那一叠')
}
if (/applyEdits\(/.test(previewSrc)) fail('7 预览层自己又应用了一遍编辑（逻辑散成了两份）')
/* 只允许拿类型（PageRef）；拿 applyEdits / addAfter 这些函数就是逻辑外泄。
   正则不能跨行：本项目不写分号，[^;]* 会一口吃掉后面所有 import。 */
if (/import\s+(?!type\s)[^'\n]*from '\.\.\/lib\/deck2\/edits'/.test(previewSrc)) {
  fail('7 预览层直接引了 edits.ts 的运行时代码：应用逻辑应只留在 Result 一处')
} else ok('7 三处同源', '预览 / 放映 / 下载都只读 applyEdits 的结果')

/* ------------------------ 8 · 增页（TASKS/21 §二.5） ------------------------ */

const ADD_AT = 2
console.log(`\n=== 8. 在第 ${ADD_AT + 1} 页后插一页：页数 +1、位置对、导出与换模板都带它 ===`)
const NEW_ID = 'new-check-1'
const NEW_TITLE = '写下这一句'
const NEW_NOTES = '先读一遍，再用自己的话说说这句话的意思。'
const born: StudentSlide = { kind: 'close-read', title: NEW_TITLE, notes: NEW_NOTES }
const e8 = addAfter(EMPTY_EDITS, N, ADD_AT, NEW_ID, born)
const list8 = applyEdits(RAW, e8)
if (list8.length !== N + 1) fail(`8 插一页后是 ${list8.length} 页，应为 ${N + 1} 页`)
else if (list8[ADD_AT + 1]?.title !== NEW_TITLE) {
  fail(`8 新页没排在原第 ${ADD_AT + 1} 页之后：该位是「${list8[ADD_AT + 1]?.title}」`)
} else ok('8 新页紧跟在当前页之后', `第 ${ADD_AT + 2} 页「${NEW_TITLE}」`)
if (editCount(e8) !== 1) fail(`8 只插了一页，editCount 却是 ${editCount(e8)}`)
else ok('8 改过 1 处', '插页只算一处，不虚高')

/* 导出：新页真的进了 pptx */
const texts8 = await exportPptx(list8, 'suke', `${OUT}/q21-add.pptx`)
if (texts8.length !== N + 1) fail(`8 导出的 pptx 是 ${texts8.length} 页，应为 ${N + 1} 页`)
else ok('8 导出的页数跟着多一页', `${N} → ${texts8.length}`)
if (!texts8.some((t) => t.includes(NEW_TITLE))) fail(`8 新页的标题「${NEW_TITLE}」没进 pptx`)
else ok('8 新页的字进了 pptx', `第 ${ADD_AT + 2} 页「${NEW_TITLE}」`)

/* 换模板：新页跟着换纸，字一个不丢（六族代表各导一份） */
for (const id of FAMILY_IDS.map((f) => FAMILY_REPS[f])) {
  const texts = await exportPptx(list8, id, `${OUT}/q21-add-${id.replace(/[^\w-]/g, '')}.pptx`)
  if (!texts.some((t) => t.includes(NEW_TITLE))) fail(`8 ${id}：新页在换模板后丢了`)
  else if (texts.length !== N + 1) fail(`8 ${id}：换模板后是 ${texts.length} 页，应为 ${N + 1} 页`)
  else ok(`8 ${id} 新页还在`, `${texts.length} 页`)
}

/* 新页上改字：patchRef 落到 added 那一份，导出跟着变；原 slides 不动 */
const NEW_TITLE2 = '这一句写下来'
const e8p = patchRef(e8, N, NEW_ID, { title: NEW_TITLE2 })
const texts8p = await exportPptx(applyEdits(RAW, e8p), 'suke', `${OUT}/q21-add-patch.pptx`)
if (!texts8p.some((t) => t.includes(NEW_TITLE2))) fail(`8 新页改字没进 pptx：「${NEW_TITLE2}」零命中`)
else ok('8 新页上改的字进了 pptx', `「${NEW_TITLE}」→「${NEW_TITLE2}」`)
if (editCount(e8p) !== 1) fail(`8 新页里改字又算了一处：editCount = ${editCount(e8p)}`)
else ok('8 新页里改字不重复计数', '仍是一页算一处')

/* 挪新页：往前一格 → 它到了原第 2 页后面 */
const e8m = moveAt(e8, N, ADD_AT + 1, -1)
const list8m = applyEdits(RAW, e8m)
if (list8m[ADD_AT]?.title !== NEW_TITLE) fail('8 新页往前挪一格没生效')
else ok('8 新页能往前挪', `到第 ${ADD_AT + 1} 位`)

/* 删新页：直接从 seq / added 里摘掉，页数回原样，字零残留 */
const e8r = removeAt(e8, N, ADD_AT + 1)
const list8r = applyEdits(RAW, e8r)
if (list8r.length !== N) fail(`8 删掉新页后是 ${list8r.length} 页，应为 ${N} 页`)
else if (list8r.some((s) => s.title === NEW_TITLE)) fail('8 删掉新页后它的字还在')
else ok('8 删新页回到原页数', `${N + 1} → ${list8r.length}`)

/* 删原页：插过页之后删一页，也要算一处（旧实现会在 seq 分支漏掉） */
const e8d = removeAt(e8, N, 0)
if (editCount(e8d) !== 2) fail(`8 插一页 + 删一页，editCount 是 ${editCount(e8d)}，应为 2`)
else ok('8 插过页后删原页也计数', '插 1 + 删 1 = 2')

if (snap(RAW) !== ORIGINAL) fail('8 增删挪把原始 slides 改了')
else ok('8 原 slides 仍然一个字节没动', `${N} 页深比较相等`)

/* ------------------- 9 · 新页可选页型（与整份 PPT 同套） ------------------- */

console.log('\n=== 9. 十种页型各插一张：与整份 PPT 同一套，都能过导出校验 ===')
/* 口径：学生版的全部页型（封面除外）都能插，不多不少 */
const expectKinds = SLIDE_KINDS.filter((k) => k !== 'cover').slice().sort()
const gotKinds = [...INSERTABLE].sort()
if (JSON.stringify(gotKinds) !== JSON.stringify(expectKinds)) {
  fail(`9 可插页型与整份 PPT 不一致：缺 ${expectKinds.filter((k) => !gotKinds.includes(k)).join('/') || '无'}，多 ${gotKinds.filter((k) => !expectKinds.includes(k)).join('/') || '无'}`)
} else ok('9 页型与整份 PPT 同一套', `${gotKinds.length} 种（封面除外）`)
const labels = INSERTABLE.map((k) => INSERT_LABELS[k])
if (labels.some((l) => !String(l ?? '').trim()) || new Set(labels).size !== labels.length) {
  fail(`9 页型名有空或重名：${labels.join(' / ')}`)
} else ok('9 页型名齐全不重', labels.join(' / '))

/* 每种页型插一张，拼成一叠；先过导出校验（与学生版同一道闸） */
let e9: DeckEdits = EMPTY_EDITS
const born9: { kind: InsertKind; title: string }[] = []
INSERTABLE.forEach((kind, i) => {
  const page = newPage(kind, 1)
  e9 = addAfter(e9, N, N + i - 1, `new-kind-${i}`, page)
  born9.push({ kind, title: page.title })
})
const list9 = applyEdits(RAW, e9)
if (list9.length !== N + INSERTABLE.length) fail(`9 十种页型插完是 ${list9.length} 页，应为 ${N + INSERTABLE.length} 页`)
const check9 = validateSlides(list9, stackLimits(LIMITS, list9.length))
if (!check9.ok) fail(`9 新页没过导出校验：${check9.problems.slice(0, 3).join('；')}`)
else ok('9 十张默认新页全部合格', '落点 / 备注 / 跨页撞句 三项全过')

/* 每种页型在各族里都能排：零抛错、块子不为空、零越界 */
let cells9 = 0
let out9 = 0
for (const fam of FAMILY_IDS) {
  const tpl = TEMPLATES[FAMILY_REPS[fam]]
  for (const { kind } of born9) {
    const placed = place(newPage(kind, 1), tpl)
    cells9 += placed.length
    if (placed.length === 0) fail(`9 ${fam} / ${kind} 一页排出来是空的`)
    for (const p of placed) {
      if (p.x < -1e-6 || p.y < -1e-6 || p.x + p.w > 1.000001 || p.y + p.h > 1.000001) out9 += 1
    }
  }
}
if (out9 > 0) fail(`9 新版式在各族里越出纸面 ${out9} 块`)
else ok('9 十种页型 × 各族全部排得下', `${cells9} 块，零越界`)

/* 真的导两份：素课 + 四卡（plain / words / compare / quote / end 五种 arch 都走到） */
for (const id of ['suke', 'ka'] as TemplateId[]) {
  const texts = await exportPptx(list9, id, `${OUT}/q21-kinds-${id}.pptx`)
  if (texts.length !== N + INSERTABLE.length) fail(`9 ${id} 导出 ${texts.length} 页，应为 ${N + INSERTABLE.length} 页`)
  const lost = born9.filter((b) => !texts.some((t) => t.includes(b.title)))
  if (lost.length) fail(`9 ${id}：${lost.length} 张新页的字没进 pptx（${lost.map((b) => b.title).join(' / ')}）`)
  else ok(`9 ${id} 十张新页逐张在片`, `${texts.length} 页`)
}

/* 连插两张同页型：默认文案不许跨页撞句 */
let dbl: DeckEdits = addAfter(EMPTY_EDITS, N, 2, 'dbl-1', newPage('words', 1))
dbl = addAfter(dbl, N, 3, 'dbl-2', newPage('words', 2))
const list9b = applyEdits(RAW, dbl)
const check9b = validateSlides(list9b, stackLimits(LIMITS, list9b.length))
if (!check9b.ok) fail(`9 连插两张字词页没过校验：${check9b.problems.slice(0, 2).join('；')}`)
else ok('9 连插两张同类页不撞句', `第 ${3}、${4} 页`)

/* 接线：界面必须用这张表，不许自己另写一份页型清单 */
if (!/from '\.\.\/lib\/deck2\/newPage'/.test(previewSrc)) fail('9 预览层没接 pages 表（newPage.ts）')
else if (!/<select[\s\S]{0,400}?INSERTABLE\.map/.test(previewSrc)) fail('9 页型下拉不是拿 INSERTABLE 生成的')
else ok('9 页型下拉与门禁同一张表', 'INSERTABLE / INSERT_LABELS / newPage')

/* ------------------- 10 · 讲稿可改，改完进 .pptx 备注页（TASKS/21 §二.6） ------------------- */

console.log(`\n=== 10. 改第 ${PAGE_NO} 页讲稿：导出的备注换新句，旧句零命中，且不上页面 ===`)
const OLD_NOTE = String(RAW[EDIT_AT]?.notes ?? '')
const NEW_NOTE = '先自己读一遍，读完抬头看我，我请两位同学说。'
if (!OLD_NOTE.trim()) fail(`10 第 ${PAGE_NO} 页原本没有讲稿，这一条验不了`)
const e10 = patchOriginal(EMPTY_EDITS, N, EDIT_AT, { notes: NEW_NOTE })
const list10 = applyEdits(RAW, e10)
if (list10[EDIT_AT]?.notes !== NEW_NOTE) {
  fail(`10 applyEdits 后第 ${PAGE_NO} 页讲稿还是「${String(list10[EDIT_AT]?.notes ?? '').slice(0, 20)}」`)
} else ok('10 讲稿改得动', `「${OLD_NOTE.slice(0, 12)}…」→「${NEW_NOTE.slice(0, 12)}…」`)
if (editCount(e10) !== 1) fail(`10 只改了一处讲稿，editCount 却是 ${editCount(e10)}`)
else ok('10 改讲稿只算一处', '不虚高')

const notes10 = await exportNotes(list10, 'suke', `${OUT}/q21-notes.pptx`)
if (!notes10.some((t) => t.includes(NEW_NOTE))) fail('10 新讲稿没进 pptx 备注页')
else ok('10 新讲稿进了 pptx 备注页', `共 ${notes10.length} 页备注`)
if (notes10.some((t) => OLD_NOTE.trim().length > 6 && t.includes(OLD_NOTE.trim()))) {
  fail('10 旧讲稿还留在备注页里（改了个寂寞）')
} else ok('10 旧讲稿在备注里零命中', '整份逐页扫过')

const page10 = await exportPptx(list10, 'suke', `${OUT}/q21-notes-page.pptx`)
if (page10.some((t) => t.includes(NEW_NOTE))) fail('10 讲稿爬上页面正文了（只许进备注）')
else ok('10 讲稿不上页面', '页面 XML 零命中')

/* 接线：类型表里必须有 notes，界面改的是 notes 而不是 note（两者不是同一个字段） */
const editsSrc = readFileSync('src/lib/deck2/edits.ts', 'utf8')
const pickLine = /export type SlidePatch = Partial<\s*Pick<StudentSlide,([^>]*)>/.exec(editsSrc)?.[1] ?? ''
if (!/['"]notes['"]/.test(pickLine)) fail('10 SlidePatch 不收 notes：讲稿改不了')
else ok('10 SlidePatch 收了 notes', pickLine.replace(/\s+/g, ' ').trim())
if (!/setText\('notes',/.test(previewSrc)) fail("10 预览层的讲稿输入框没接 'notes'（接成 note 就改错了字段）")
else if (!/value=\{slide\.notes/.test(previewSrc)) fail('10 讲稿输入框读的不是这一页的 notes')
else ok('10 界面读写同一个字段', "value={slide.notes} / setText('notes')")

/* -------------------------------- 交付物 -------------------------------- */

mkdirSync(OUT, { recursive: true })
const dump: string[] = []
const line = (label: string, list: StudentSlide[]) =>
  `${label}｜${list.length} 页｜${list.map((s, i) => `${i + 1}.${s.title}`).join(' / ')}`
dump.push(line('原稿', RAW))
dump.push(line('改 3 处 + 删第 5 页', list4))
dump.push(line('删第 5 页', list2))
dump.push(line('第 2 页挪到第 1 位', list3))
dump.push(line('插一页', list8))
dump.push(line('十种页型各一张', list9))
writeFileSync(`${OUT}/q21-dump.txt`, dump.join('\n') + '\n')

/** 对照图：两行（原稿 / 改后），三列（前 3 页）。块面位置就是 place() 的坐标 */
const pw = 320
const ph = 180
const sheet: RgbaImage = { width: pw * 3, height: ph * 2, pixels: new Uint8Array(pw * 3 * ph * 2 * 4) }
const hex = (v: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(v)
  const n = m ? parseInt(m[1], 16) : 0x888888
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rows: { list: StudentSlide[]; id: TemplateId }[] = [
  { list: RAW, id: 'suke' },
  { list: list4, id: 'xuan' },
]
rows.forEach((row, r) => {
  const tpl: TemplateTheme = TEMPLATES[row.id]
  const paper = hex(tpl.paper)
  for (let c = 0; c < 3; c++) {
    const ox = c * pw
    const oy = r * ph
    const put = (x: number, y: number, rgb: [number, number, number], alpha = 1) => {
      const px = ox + Math.round(x * pw)
      const py = oy + Math.round(y * ph)
      if (px < ox || px >= ox + pw || py < oy || py >= oy + ph) return
      const i = (py * sheet.width + px) * 4
      sheet.pixels[i] = Math.round(sheet.pixels[i] * (1 - alpha) + rgb[0] * alpha)
      sheet.pixels[i + 1] = Math.round(sheet.pixels[i + 1] * (1 - alpha) + rgb[1] * alpha)
      sheet.pixels[i + 2] = Math.round(sheet.pixels[i + 2] * (1 - alpha) + rgb[2] * alpha)
    }
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        const i = ((oy + y) * sheet.width + ox + x) * 4
        sheet.pixels[i] = paper[0]
        sheet.pixels[i + 1] = paper[1]
        sheet.pixels[i + 2] = paper[2]
        sheet.pixels[i + 3] = 255
      }
    const slide = row.list[c]
    if (!slide) continue
    for (const p of place(slide, tpl)) {
      const rgb = hex(p.fill ?? p.color ?? tpl.ink)
      const alpha = p.kind === 'text' ? 0.55 : (p.opacity ?? 1) * 0.85
      for (let y = 0; y < Math.max(1, Math.round(p.h * ph)); y++)
        for (let x = 0; x < Math.max(1, Math.round(p.w * pw)); x++)
          put((p.x * pw + x) / pw, (p.y * ph + y) / ph, rgb, alpha)
    }
  }
})
writeFileSync(`${OUT}/q21-edit.png`, Buffer.from(await encodePng(sheet)))
console.log(`  交付：${OUT}/q21-before.pptx（原稿）`)
console.log(`  交付：${OUT}/q21-after.pptx（改 3 处 + 删 1 页 + 换宣纸）`)
console.log(`  交付：${OUT}/q21-edit.png（上排原稿 / 下排改后，前 3 页）`)
console.log(`  交付：${OUT}/q21-dump.txt（六叠逐页标题）`)

/* -------------------------------- 收尾 -------------------------------- */

console.log('')
if (FAIL.length) {
  for (const f of FAIL) console.log(`✗ ${f}`)
  console.log(`\n编辑门禁：${FAIL.length} 条未通过`)
  process.exit(1)
}
console.log('编辑门禁：十条全过（改字 / 删页 / 调序 / 换模板保字 / 纯函数 / 重新生成 / 三处同源 / 增页 / 页型可选 / 讲稿可改）')
