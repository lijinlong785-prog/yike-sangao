/**
 * 「逐页修补，不再整份退回」的离线验收（第二十二轮）。
 *
 * 背景：一台真机跑《平行四边形的面积》时，模型交的 10 页里只有第 10 页
 * 因为一句四字对偶（「必做两样，选做一样」）被语气闸判住，旧逻辑就把整份
 * 学生版换回骨架稿——学生看到的是「读读这一句」这种空壳。现在改成：只换那一页。
 *
 * 全程不碰网络：走内置稿当「好稿」与「兜底稿」，用改字段的方式造坏页。
 * 跑法：npm run check:repair
 */
import { limitsFor } from '../src/lib/scale'
import {
  auditProblems,
  getBuiltinStudentSlides,
  normalizeSlides,
  padPages,
  repairPages,
  sentenceKey,
  type StudentSlide,
} from '../src/lib/slides'
import { skeletonPlan } from '../src/lib/skeleton'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
import type { LessonInput } from '../src/types'

const failures: string[] = []
const fail = (msg: string): void => {
  failures.push(msg)
}

/** 中文之间夹一个空格（半角 / NBSP / 单个全角）：模型换行留下的洞 */
const CJK_SPACE =
  /[\u3400-\u4dbf\u4e00-\u9fff][\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000][\u3400-\u4dbf\u4e00-\u9fff]/
/** 汉字与句末标点之间夹一个空格：「今晚先做哪一件 ？」上屏也是洞 */
const TAIL_SPACE =
  /[\u3400-\u4dbf\u4e00-\u9fff][\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000][，。！？；：、]/
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
const bad = (msg: string, detail = ''): void => {
  console.log(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)
  failures.push(detail ? `${msg}：${detail}` : msg)
}

const input: LessonInput = {
  topic: '桂花雨',
  subject: '语文',
  stage: '小学',
  grade: '五年级',
  textbook: '部编版',
  period: '第一课时',
  duration: 40,
}
const plan = skeletonPlan(input)
const limits = limitsFor('auto', 'lesson', 40)
const good = getBuiltinStudentSlides(plan, limits)

if (good.length < 10) fail(`内置稿只有 ${good.length} 页，取证前提不成立`)
else ok(`取证底稿：${good.length} 页（lesson / 40 分钟 / standard）`)

/* ---------- 1. 两页坏、其余好：只换那两页 ---------- */
const dirty: StudentSlide[] = good.map((s) => ({ ...s }))
// 第 3 页：标题只剩动作，正文也只剩动作 → 材料闸报「没有材料」
dirty[2] = { ...dirty[2], title: '读一遍', line: '读一遍', items: undefined }
// 第 7 页：备注清空 → 格式闸报「备注是空的」
dirty[6] = { ...dirty[6], notes: '' }

const first = auditProblems(dirty, limits)
if (first.length < 2) fail(`造出来的坏稿只被判出 ${first.length} 处，判据没生效`)
else ok(`坏稿被判出 ${first.length} 处`, first[0].slice(0, 30))

const fixed = repairPages(dirty, good, limits, first)
if (!fixed) {
  bad('两页坏、其余好，修补返回 null（又整份退回了）')
} else {
  ok(`修补成功：换了 ${fixed.swapped} 页，页数 ${fixed.slides.length} 未变`)
  if (fixed.swapped !== 2) fail(`应该换 2 页，实际换了 ${fixed.swapped} 页`)
  if (fixed.slides.length !== dirty.length) fail('修补后页数变了')
  const untouched = [0, 1, 3, 4, 5, 7, 8, 9, 10].filter(
    (i) => i < dirty.length && fixed.slides[i] !== dirty[i]
  )
  if (untouched.length) fail(`不该动的页被换掉了：第 ${untouched.map((i) => i + 1).join('、')} 页`)
  else ok('好页一个都没动（引用相等）')
  if (fixed.slides[2].title === '读一遍') fail('第 3 页还是那张坏页')
  if (!String(fixed.slides[6].notes ?? '').trim()) fail('第 7 页的备注还是空的')
  const after = auditProblems(fixed.slides, limits)
  if (after.length) {
    for (const p of after) bad('修补后仍不合格', p)
  } else ok('修补后三道闸全过')
}

/* ---------- 2. 问题没有页码（页数不够）：整份退回 ---------- */
const short = good.slice(0, 4)
const shortProblems = auditProblems(short, limits)
const noPage = shortProblems.every((p) => !/^第\s*\d+\s*页/.test(p))
if (!shortProblems.length) fail('四页的稿居然判过，页数区间没生效')
else if (!noPage) fail(`四页的稿被判出的问题里混着页码：${shortProblems[0].slice(0, 24)}`)
else if (repairPages(short, good, limits, shortProblems) !== null)
  fail('页数不够的稿竟然被逐页修补救回来了（应该整份退回）')
else ok(`页数不够（${short.length} 页）→ 整份退回，逐页修补不硬凑`)

/* ---------- 3. 每页都坏：整份退回，不留半份 ---------- */
// 封面不吃「材料闸」（封面本来就不该有材料），所以三张闸一起上：标题空壳 + 备注空。
const allBad: StudentSlide[] = good.map((s) => ({
  ...s,
  title: '读一遍',
  line: '读一遍',
  items: undefined,
  notes: '',
}))
const allProblems = auditProblems(allBad, limits)
if (!allProblems.length) fail('整份都是空壳，判据居然没报')
else if (repairPages(allBad, good, limits, allProblems) !== null)
  fail('整份都坏的稿被「修补」了（应该退回）')
else ok(`整份都坏（${allBad.length} 页）→ 整份退回`)

/* ---------- 4. 好稿不动：没有问题时不进修补 ---------- */
const clean = auditProblems(good, limits)
if (clean.length) {
  for (const p of clean) bad('内置稿自己就没过硬闸', p)
} else ok('好稿零问题（不该触发修补，也不该白跑三轮验证）')

/* ---------- 5. items 里的问句一律清掉，中文之间不留空格（真机《桂花雨》第 9 页） ---------- */
// 模型交过这么一页：line 已经是一句问话，items 里又挂着「课文写了哪几个地点？」；
// 而且 line 中间还夹着一个半角空格（「哪个词在 写声音？」）。两样都不许上屏。
// 第四次真机又见到两处漏网的（squeezeHan 之前只认半角空格）：
//   「哪个词在\u00A0写声音？」（NBSP）、「今晚先做哪一件\u3000？」（单个全角空格）。
const raw = {
  slides: [
    { kind: 'cover', title: '桂花雨', line: '雨，也可以是香的', notes: '这一课我们读一篇写雨的文章，雨里带着桂花香。' },
    {
      kind: 'close-read',
      title: '摇哇摇',
      line: '读《桂花雨》这一句，哪个词在 写声音？',
      items: ['课文写了哪几个地点？'],
      notes: '摇是抱着树使劲晃，有声音、有动态、有满身的花；摘是一个人轻轻拿下来。',
    },
    {
      kind: 'words',
      title: '读准这四个词',
      line: '哪个字写出等不及？',
      items: ['箩筐', '杭州', '浸润', '糕饼'],
      notes: '这四个词先各自读两遍，再把它们放回课文里找一个句子。',
    },
    {
      kind: 'compare',
      title: '我喊，母亲不喊',
      line: '哪个词在\u00A0写声音？',
      items: ['我：抱住桂花树', '母亲：只洗洗手'],
      notes: '把两个人的动作摆在一起看，一个喊一个不喊，差在哪儿。',
    },
    {
      kind: 'homework',
      title: '回家做两件事',
      line: '这两件事今晚先做哪一件\u3000？',
      items: ['抄写生字词，各两遍'],
      notes: '两件事都不难，回家先挑一件做完，明天上课对一遍。',
    },
    /* 填写位不许动：全角空格夹在括号里是老师留的空，不是排版残留 */
    {
      kind: 'drill',
      title: '填这句话，写你家的味道',
      line: '我一闻到（　），就想起（　）。',
      items: ['桂花：甜香', '艾草：苦香'],
      notes: '照着课文的样子，把两个空填满，再读给旁边的人听。',
    },
  ],
}
const normalized = normalizeSlides(raw, plan, limits)
/* 只判模型自己挂上来的那一句：ensureQuestion 补的标准问句是每页本来就该有的，
   不是「items 里挂问句」这个毛病（它补的叫问句，模型挂的是另一件事）。 */
const polluted = normalized.filter((s) =>
  [s.line ?? '', ...(s.items ?? [])].some((t) => String(t ?? '').includes('课文写了哪几个地点'))
)
if (polluted.length) {
  bad('模型挂上来的问句还在', polluted.map((s) => s.title).join('、'))
} else ok(`模型挂上来的问句一律清掉（${normalized.length} 页逐页扫过）`)

/* 逐字段判：把几个字段拼起来再比，拼用的那个空格自己就成了命中 */
const spaced = normalized.filter((s) =>
  [s.title, s.line ?? '', ...(s.items ?? [])].some((t) => {
    const one = String(t ?? '')
    return CJK_SPACE.test(one) || TAIL_SPACE.test(one)
  })
)
if (spaced.length) {
  for (const s of spaced) bad('中文之间还有空格（半角 / NBSP / 单个全角）', `${s.title}：${s.line ?? ''}`)
} else ok('中文之间不留空格（半角 / NBSP / 单个全角都清掉）')

/* 反着验一条：括号里的全角空格是老师留的填写位，清空格的规则不许把它一起吃掉 */
const blankSlide = normalized.find((s) => s.kind === 'drill')
const kept = String(blankSlide?.line ?? '')
if (kept.includes('（　）')) ok('填写位不被动：括号里的全角空格还在', kept)
else bad('填写位被吃掉了：括号里的全角空格不见了', kept || '（整页没了）')

/* ---------- 6. 页数不足自动补页（2026-11-21 用户验收 s2） ---------- */
// 模型交 5 页、40 分钟要 16 页：以前整份退回，好页也没了；现在先补，补不编造。
// 补页的素材从「这一课自己的教案」里取：拿一份真教案（《桂花雨》原稿）当输入。
{
  const lim40 = limitsFor('standard', 'lesson', 2400)
  const richPlan = {
    ...planForScale(guihuaYu, 2400),
    meta: {
      ...guihuaYu.meta,
      duration: 2400,
      text: '桂花开了，满树都是金黄的，好看得很。\n外地的桂花再香，还是比不得家乡旧宅院子里的金桂。',
    },
  }
  /* 拿另一篇课的头两页 + 尾三页当「模型稿」：内容与这一课不同，才能看出补的是本课自己的材料 */
  const whole = getBuiltinStudentSlides(skeletonPlan({ ...input, topic: '将相和', duration: 2400 }), lim40)
  const foreign = [...whole.slice(0, 2), ...whole.slice(-3)]
  const padded = padPages(foreign, richPlan, lim40)
  if (padded.length < lim40.pagesMin) {
    bad(`补页后仍只有 ${padded.length} 页（下限 ${lim40.pagesMin}）`)
  } else if (padded.length > lim40.pagesMax) {
    bad(`补页后 ${padded.length} 页，破了上限 ${lim40.pagesMax}`)
  } else ok(`页数不足自动补页：${foreign.length} → ${padded.length} 页`, `下限 ${lim40.pagesMin}`)

  const tail = padded.slice(-3).map((s) => s.kind).join('/')
  if (tail === 'board/homework/end') ok('补页不抢尾部三页的位置', tail)
  else bad('尾部三页被补页顶掉了', tail)

  const bare = padded.filter((s) => {
    if (s.kind === 'cover' || s.kind === 'quote' || s.kind === 'end') return false
    const body = [s.line ?? '', ...(s.items ?? [])].join(' ').trim()
    return body.replace(/[\s，。！？；：、]/g, '').length < 4
  })
  if (bare.length) bad('补进来的页是空壳', bare.map((s) => s.title).join('、'))
  else ok('补进来的每一页都挂着材料')

  const added = padded.filter((s) => s.kind === 'quote' && !foreign.includes(s))
  if (added.length > 0) ok('补页优先用没上屏的课文原句', `${added.length} 页原文`)
  else bad('有原文却一页都没补')

  /* 原文页的 title 与 text 本来就是同一句（页面就是那句原文），不算撞句 */
  const keys = padded.flatMap((s) =>
    (s.kind === 'quote' ? [s.text ?? ''] : [s.title ?? '', s.text ?? '', s.line ?? '', ...(s.items ?? [])]).map(
      sentenceKey
    )
  )
  const dup = keys.filter((k, i) => k.length >= 4 && keys.indexOf(k) !== i)
  if (dup.length) bad(`补页后同一句上了两页：${dup.slice(0, 3).join(' / ')}`)
  else ok('补页不撞句（整叠逐句扫过）')
}

console.log('')
if (failures.length) {
  console.log(`✗ 逐页修补有 ${failures.length} 处不合格：`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('逐页修补全链路通过（只换坏页 / 无页码整份退回 / 整份坏退回 / 好稿不动 / 不定页数自动补页）')