/**
 * 「导出吃当前 deck」的门禁（10 §七「手改的东西永远算用户的」）。
 *
 * 这是整条产品线上最致命的一根线：用户改了课件，导出的 .pptx / 文稿必须跟着改。
 * 所以这里不看合成数据，直接走真实链路：
 *
 *   1. 原样导出一份 .pptx，解包数 slide：页数必须等于 deck 页数
 *   2. 改一页标题、改一条要点、删两页、插一页 —— 再导一份
 *      断言：改后的标题 / 要点 / 插入页在 slide XML 里；被删那两页的标题一个字都没有
 *   3. 备注（演讲者备注）逐页一份，内容跟着手改走
 *   4. 教师版文稿（Markdown / Word）带同一叠 deck：「课件逐页」节数 == 页数，
 *      改过的在、删掉的没在
 *   5. 反向用例：不给 deck 时文稿里必须**没有**手改内容（证明是 deck 参数在起作用，不是碰巧）
 *
 * .pptx 只写 /tmp，仓库里不留文件。
 *
 * 跑法：
 *   npm run check:export
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { EXAMPLES } from '../src/data/examples'
import { planForScale } from '../src/data/lesson'
import { allocate } from '../src/lib/timing'
import {
  buildDeck,
  editDeckPage,
  insertDeckPage,
  removeDeckPage,
  setDeckBullet,
  type DeckPage,
} from '../src/lib/deck'
import { downloadDeckPptx } from '../src/lib/pptx'
import { planToMarkdown } from '../src/lib/markdown'
import { planToDocHtml } from '../src/lib/word'

const OUT = '/tmp/yike-check-deck'
const failures: string[] = []
const fail = (msg: string) => failures.push(msg)

function unzip(entry: string, file: string): string {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', file, entry], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
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

function slideFiles(file: string): string[] {
  return entries(file)
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
}

function notesFiles(file: string): string[] {
  return entries(file).filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e))
}

/** 一页在全文里出现几次（标题 / 要点 / 备注）：>1 就不能拿来当「删掉必须消失」的靶子 */
function occurrences(pages: DeckPage[], text: string): number {
  let n = 0
  for (const p of pages) {
    if (p.title.includes(text)) n++
    for (const b of p.bullets ?? []) if (b.includes(text)) n++
    if (p.notes.includes(text)) n++
  }
  return n
}

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const gf = EXAMPLES.find((e) => e.id === 'guihua')
  if (!gf) {
    console.error('找不到《桂花雨》内置示例，门禁无法运行')
    process.exit(1)
  }
  const plan = planForScale(gf.plan, 240)
  const timed = allocate(plan.segments, plan.meta.duration)
  const base = buildDeck(plan, timed)

  /* ------------------------- 1. 原样导出 ------------------------- */

  const f1 = `${OUT}/base.pptx`
  const r1 = await downloadDeckPptx(base, undefined, f1)
  const s1 = slideFiles(f1)
  if (s1.length === 0) fail('原样导出没有产出任何 slide（.pptx 没写出来或解包失败）')
  if (s1.length !== base.length) fail(`原样导出 ${s1.length} 页，deck 是 ${base.length} 页`)
  if (r1.pages !== base.length) fail(`downloadDeckPptx 回报 ${r1.pages} 页，应为 ${base.length} 页`)
  if (notesFiles(f1).length !== base.length) {
    fail(`备注 ${notesFiles(f1).length} 份，应为 ${base.length} 份（每页一条口播）`)
  }
  const baseXml = s1.map((e) => unzip(e, f1)).join('\n')
  const coverTitle = base[0].title
  if (!baseXml.includes(coverTitle)) fail('原样导出的第一页里找不到封面标题，解包取证链路本身有问题')

  /* ------------------- 2. 改 / 删 / 插之后再导 ------------------- */

  const MARK_TITLE = 'ZZMARK改过的标题'
  const MARK_BULLET = 'ZZMARK改过的要点'
  const MARK_INSERT = 'ZZMARK插进来的一页'

  // 用来改的两页：挑「标题在整叠里只出现一次」的第 2、3 页（删页不能删到它们身上）
  const titleTarget = base[2]
  const bulletTarget = base[3]

  // 找两页「标题在整叠里只出现一次」的来删，删掉之后才能断言一个字都没剩
  const targets: number[] = []
  for (let i = 1; i < base.length && targets.length < 2; i++) {
    if (i === 2 || i === 3) continue
    if (occurrences(base, base[i].title) === 1) targets.push(i)
  }
  if (targets.length < 2) {
    fail('找不到两页可删的靶子（标题不唯一），这条断言无法成立')
  }
  const victimTitles = targets.map((i) => base[i].title)
  // 从后往前删，索引才不会错位
  let edited = base
  for (const i of [...targets].sort((a, b) => b - a)) edited = removeDeckPage(edited, i)

  // 删完再按身份改，避免「改的是要被删掉的那页」这种假红
  edited = edited.map((p) => (p.title === titleTarget.title ? editDeckPage(p, { title: MARK_TITLE }) : p))
  edited = edited.map((p) =>
    p.title === bulletTarget.title ? setDeckBullet(p, 0, MARK_BULLET) : p
  )

  edited = insertDeckPage(edited, 2)
  const insertedAt = 3
  edited = edited.map((p, i) => (i === insertedAt ? editDeckPage(p, { title: MARK_INSERT }) : p))

  const expectCount = base.length - targets.length + 1

  const f2 = `${OUT}/edited.pptx`
  const r2 = await downloadDeckPptx(edited, undefined, f2)
  const s2 = slideFiles(f2)
  if (s2.length !== expectCount) {
    fail(`手改后导出 ${s2.length} 页，应为 ${expectCount} 页（原 ${base.length} − 删 ${targets.length} + 插 1）`)
  }
  if (r2.pages !== expectCount) fail(`downloadDeckPptx 回报 ${r2.pages} 页，应为 ${expectCount} 页`)
  if (notesFiles(f2).length !== expectCount) {
    fail(`手改后备注 ${notesFiles(f2).length} 份，应为 ${expectCount} 份`)
  }

  const xml2 = s2.map((e) => unzip(e, f2)).join('\n')
  if (!xml2.includes(MARK_TITLE)) fail('改过的标题没有进 .pptx')
  if (!xml2.includes(MARK_BULLET)) fail('改过的要点没有进 .pptx')
  if (!xml2.includes(MARK_INSERT)) fail('插进来的那一页没有进 .pptx')
  for (const t of victimTitles) {
    if (xml2.includes(t)) fail(`删掉的那页「${t}」又出现在 .pptx 里了`)
  }

  // 备注跟着页走：改过标题那一页的备注必须还是它自己的
  const notes2 = notesFiles(f2)
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
    .map((e) => unzip(e, f2))
    .join('\n')
  const editedNotes = edited.find((p) => p.title === MARK_TITLE)?.notes ?? ''
  if (editedNotes) {
    const probe = editedNotes.replace(/\s+/g, '').slice(0, 10)
    if (probe && !notes2.replace(/\s+/g, '').includes(probe)) {
      fail('改过的那一页的备注没有跟着进 .pptx（口播丢了）')
    }
  }

  /* ------------------- 3. 教师版文稿吃同一叠 deck ------------------- */

  const md = planToMarkdown(plan, timed, edited)
  const head = md.indexOf('## 二、课件（逐页，与预览一致）')
  const tail = md.indexOf('## 三、说课稿')
  if (head < 0 || tail < 0) {
    fail('Markdown 里没有「课件（逐页，与预览一致）」这一节')
  } else {
    const section = md.slice(head, tail)
    const count = (section.match(/### 第 \d+ 页/g) ?? []).length
    if (count !== expectCount) fail(`Markdown 课件节 ${count} 页，应为 ${expectCount} 页`)
    if (!section.includes(MARK_TITLE)) fail('Markdown 里没有改过的标题')
    if (!section.includes(MARK_BULLET)) fail('Markdown 里没有改过的要点')
    for (const t of victimTitles) {
      if (section.includes(t)) fail(`Markdown 里删掉的那页「${t}」又出现了`)
    }
  }

  const html = planToDocHtml(plan, timed, edited)
  const hHead = html.indexOf('<h2>二、课件（逐页，与预览一致）</h2>')
  const hTail = html.indexOf('<h2>三、说课稿</h2>')
  if (hHead < 0 || hTail < 0) {
    fail('Word 文稿里没有「课件（逐页，与预览一致）」这一节')
  } else {
    const section = html.slice(hHead, hTail)
    const count = (section.match(/<p class="label">第 \d+ 页/g) ?? []).length
    if (count !== expectCount) fail(`Word 课件节 ${count} 页，应为 ${expectCount} 页`)
    if (!section.includes(MARK_TITLE)) fail('Word 里没有改过的标题')
    for (const t of victimTitles) {
      if (section.includes(t)) fail(`Word 里删掉的那页「${t}」又出现了`)
    }
  }

  /* ------------------- 4. 反向用例 ------------------- */

  const plainMd = planToMarkdown(plan, timed)
  if (plainMd.includes(MARK_TITLE)) {
    fail('反向用例未被抓到：不给 deck 的文稿里竟然也有手改内容')
  }
  if (plainMd.includes('课件（逐页')) {
    fail('反向用例未被抓到：不给 deck 时不该有「课件逐页」这一节')
  }

  /* ------------------- 汇总 ------------------- */

  console.log(
    `-- 原样导出 --\n  ${base.length} 页 → ${s1.length} slide，备注 ${notesFiles(f1).length} 份\n` +
      `-- 改 / 删 / 插之后 --\n` +
      `  改标题、改要点、删 ${targets.length} 页、插 1 页 → ${s2.length} slide（应为 ${expectCount}）\n` +
      `  改过的标题 / 要点 / 插入页在片里 ✓；删掉的「${victimTitles.join('」「')}」一个字没剩 ✓\n` +
      `-- 教师版文稿 --\n` +
      `  Markdown / Word 都带「课件逐页」节：${expectCount} 页，改过的在、删掉的没在\n` +
      `-- 反向用例 --\n  不给 deck → 文稿里没有手改内容、也没有课件节 ✓`
  )

  if (failures.length) {
    console.error(`\n✗ 导出吃 deck 门禁 ${failures.length} 处不合格：`)
    failures.forEach((f) => console.error('  - ' + f))
    console.error(`\n（.pptx 留在 ${OUT} 供排查）`)
    process.exit(1)
  }

  rmSync(OUT, { recursive: true, force: true })
  console.log(
    `\n✓ 导出吃 deck 全通过：.pptx 页数跟 deck 走、改过的进片、删掉的不复现、` +
      `备注逐页齐全、教师版文稿同源、反向用例被抓到。`
  )
}

main().catch((e) => {
  console.error('✗ 门禁自身崩了：', e)
  process.exit(1)
})