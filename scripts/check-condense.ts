/**
 * 「凝练 + 无图不画大色块」的离线验收（2026-11-23 用户拍板「修，必须修」）。
 *
 * 背景：真机《狼牙山五壮士》25 页里，第 22 页是第 10 页原文的前半句、第 5 页
 * 空活动页的标题在下一页 notes 里原样躺着、第 23 页作业只有一条「必做｜」前缀、
 * 第 18 / 20 页是同一道练习的两半；同时 18 张无图页右半张各压着一块 27% 的空灰绿版。
 * 现在：condenseSlides 把水页凝掉（密度优先于页数），place() 没图没引文不画那块版。
 *
 * 全程不碰网络：合成页 + 内置模板离线渲染。跑法：npm run check:condense
 */
import { condenseSlides, sentenceKey, type StudentSlide } from '../src/lib/slides'
import { place } from '../src/lib/deck2/place'
import { FAMILY_REPS, TEMPLATES } from '../src/lib/deck2/theme'

const failures: string[] = []
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
const bad = (msg: string, detail = ''): void => {
  console.log(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)
  failures.push(detail ? `${msg}：${detail}` : msg)
}

function S(s: Partial<StudentSlide> & Pick<StudentSlide, 'kind' | 'title'>): StudentSlide {
  return { notes: '', ...s }
}

/* ---------- ① 原文页全局包含去重 ---------- */
{
  const long = '为了拖住敌人，七连六班的五个战士一边痛击追上来的敌人，一边有计划地把大批敌人引上了狼牙山。班长马宝玉沉着地指挥战斗。'
  const half = '为了拖住敌人，七连六班的五个战士一边痛击追上来的敌人，一边有计划地把大批敌人引上了狼牙山。'
  const deck = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'quote', title: long, text: long }),
    S({ kind: 'drill', title: '冰雹砸下来', items: ['石头像雹子一样砸下去。'] }),
    S({ kind: 'quote', title: half, text: half }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  const out = condenseSlides(deck)
  if (out.length === 4 && out.some((s) => s.text === long) && !out.some((s) => s.text === half))
    ok('① 被长原文盖住的半句页删掉', `${deck.length} → ${out.length}`)
  else bad('① 重复原文页没删', out.map((s) => s.kind).join('/'))
}

/* ---------- ② 空活动页：标题已被邻页 notes 盖住 ---------- */
{
  const deck = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'close-read', title: '三个字都是第四声', line: 'jìnchájì，几个？' }),
    S({
      kind: 'words',
      title: '读准这几个词',
      items: ['日寇', '晋察冀', '雹子', '坠落'],
      notes: '晋察冀，三个字都是第四声。（停三秒）哪个词最容易读错？',
    }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  const out = condenseSlides(deck)
  if (out.length === 3 && !out.some((s) => s.title === '三个字都是第四声'))
    ok('② 空活动页被邻页盖住 → 删', `${deck.length} → ${out.length}`)
  else bad('② 空活动页没删', out.map((s) => s.title).join('/'))
  /* 反向：邻页没盖住它，一页不许删 */
  const lonely = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'close-read', title: '悬崖绝壁什么样', line: '三面都是什么？' }),
    S({ kind: 'words', title: '读准这几个词', items: ['日寇', '晋察冀'], notes: '日寇的寇，上面一个宝盖头。' }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  if (condenseSlides(lonely).length === 4) ok('② 反向：没被盖住的空页保留')
  else bad('② 反向：没被盖住的空页被误删')
}

/* ---------- ③ 同类碎片页吸收 ---------- */
{
  const deck = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'homework', title: '句子要写具体的人', items: ['必做｜句子要写具体的人'], line: '今晚先做哪一件？' }),
    S({
      kind: 'homework',
      title: '今天的作业',
      items: ['抄写：日寇、晋察冀，各两遍', '用“斩钉截铁”写一句话', '用“屹立”写一句话'],
      notes: '必做前四个，选做最后一个。句子要写具体的人。',
    }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  const out = condenseSlides(deck)
  if (out.length === 3 && !out.some((s) => s.title === '句子要写具体的人'))
    ok('③ 「必做｜」碎片作业页被整页作业吸收', `${deck.length} → ${out.length}`)
  else bad('③ 碎片作业页没删', out.map((s) => s.title).join('/'))
}

/* ---------- ④ 同类两张薄页并成一张（中间隔着带图页也并） ---------- */
{
  const deck = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({
      kind: 'drill',
      title: '带着什么',
      line: '选一个场面，填进这句。',
      items: ['像（　）一样，带着（　），带着（　）。', '下课铃响、雨点砸窗、人群跑来'],
      notes: '例子：下课铃响，像潮水一样。',
    }),
    S({ kind: 'close-read', title: '石头带着什么', items: ['石头像雹子一样砸下去。', '带着决心，带着仇恨。'], illustration: 'data:image/png;base64,xx' }),
    S({
      kind: 'drill',
      title: '写一句',
      line: '写你熟悉的一个场面。',
      items: ['写完读一遍，看“带着”的是什么。'],
      notes: '写两分钟。',
    }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  const out = condenseSlides(deck)
  const merged = out.find((s) => s.title === '带着什么')
  if (
    out.length === 4 &&
    merged &&
    (merged.items ?? []).length === 3 &&
    !out.some((s) => s.title === '写一句') &&
    merged.notes.includes('写你熟悉的一个场面') &&
    merged.notes.includes('写两分钟')
  )
    ok('④ 两道薄练习并成一页', `条目 ${(merged.items ?? []).length} 条，后页 line/notes 进 notes`)
  else bad('④ 薄页没并好', JSON.stringify(out.map((s) => ({ t: s.title, n: (s.items ?? []).length }))))
  /* 带插画的页不参与合并 */
  if (out.some((s) => s.illustration)) ok('④ 带图页原样保留')
  else bad('④ 带图页被误动')
}

/* ---------- ⑤ 幂等 + 屏上的字一个不改 ---------- */
{
  const deck = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'quote', title: '五位战士胜利地完成了掩护任务，准备转移。', text: '五位战士胜利地完成了掩护任务，准备转移。' }),
    S({ kind: 'quote', title: '五位战士胜利地完成了掩护任务，准备转移。', text: '五位战士胜利地完成了掩护任务，准备转移。' }),
    S({ kind: 'drill', title: '带着什么', line: '选一个场面。', items: ['像（　）一样。'] }),
    S({ kind: 'drill', title: '写一句', line: '写一个场面。', items: ['写完读一遍。'] }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  const once = condenseSlides(deck)
  const twice = condenseSlides(once)
  if (JSON.stringify(once) === JSON.stringify(twice)) ok('⑤ 幂等：凝过的再凝不变')
  else bad('⑤ 不幂等')
  /* 留下的每一个可见字符串都必须原样出自原稿（合并只搬不改） */
  const before = new Set(deck.flatMap((s) => [s.title, s.text ?? '', s.line ?? '', ...(s.items ?? [])].map(sentenceKey)))
  const leaked = once.flatMap((s) => [s.title, s.text ?? '', s.line ?? '', ...(s.items ?? [])]).filter((t) => {
    const k = sentenceKey(t)
    return k.length >= 4 && !before.has(k)
  })
  if (leaked.length === 0) ok('⑤ 屏上的字一个不改（只整页搬 / 删）')
  else bad('⑤ 出现了原稿没有的字', leaked.join(' / '))
}

/* ---------- ⑥ 合并上限：>6 条不并；字词页不并 ---------- */
{
  const four = ['甲说了一句话。', '乙说了一句话。', '丙说了一句话。', '丁说了一句话。']
  const deck = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'drill', title: '带着什么', items: four }),
    S({ kind: 'drill', title: '写一句', items: ['戊说了一句话。', '己说了一句话。', '庚说了一句话。'] }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  if (condenseSlides(deck).length === 4) ok('⑥ 合并后超 6 条 → 不并')
  else bad('⑥ 超量也并了')
  const words = [
    S({ kind: 'cover', title: '狼牙山五壮士' }),
    S({ kind: 'words', title: '读准这几个词', items: ['日寇', '晋察冀'] }),
    S({ kind: 'words', title: '写对这几个词', items: ['悬崖绝壁', '斩钉截铁'] }),
    S({ kind: 'end', title: '记住这声音' }),
  ]
  if (condenseSlides(words).length === 4) ok('⑥ 字词页不并（读准 / 写对是两件事）')
  else bad('⑥ 字词页被误并')
}

/* ---------- ⑦ 无图无引文：林地不画那块 27% 的空版，正文放宽 ---------- */
{
  const tpl = TEMPLATES[FAMILY_REPS.lindi]
  const bare = S({ kind: 'close-read', title: '五件事排一排', items: ['接受任务', '诱敌上山', '引上绝路', '顶峰歼敌', '英勇跳崖'], line: '把五件事按课文顺序排好。' })
  const out = place(bare, tpl)
  const plate = out.filter((p) => p.kind === 'rect' && p.w * p.h > 0.2)
  if (plate.length === 0) ok('⑦ 林地无图无引文：大色块不画')
  else bad('⑦ 空大色块还在', plate.map((p) => `${(p.w * p.h * 100).toFixed(0)}%@(${p.x},${p.y})`).join(' '))
  const body = out.find((p) => p.kind === 'text' && p.text && p.text.includes('接受任务'))
  if (body && body.w >= 0.6) ok('⑦ 正文放宽到整页', `w=${body.w.toFixed(2)}`)
  else bad('⑦ 正文没放宽', body ? `w=${body.w.toFixed(2)}` : '找不到正文')
  /* 有引文：版要画（它是引文块的底） */
  const pulled = { ...bare, pull: '石头像雹子一样，带着五位壮士的决心，向敌人头上砸去。' }
  const out2 = place(pulled, tpl)
  if (out2.some((p) => p.kind === 'rect' && p.w * p.h > 0.2)) ok('⑦ 有引文：图版保留当引文底')
  else bad('⑦ 有引文时图版被误删')
  /* 原文页：永不压侧图 → 版不画，句子放宽 */
  const quote = S({ kind: 'quote', title: '五位战士胜利地完成了掩护任务，准备转移。', text: '五位战士胜利地完成了掩护任务，准备转移。' })
  const out3 = place(quote, tpl)
  if (!out3.some((p) => p.kind === 'rect' && p.w * p.h > 0.2)) ok('⑦ 原文页不画空版')
  else bad('⑦ 原文页还有空版')
  const q = out3.find((p) => p.kind === 'text' && p.text && p.text.includes('五位战士'))
  if (q && q.w >= 0.7) ok('⑦ 原文页句子放宽', `w=${q.w.toFixed(2)}`)
  else bad('⑦ 原文页句子没放宽')
}

/* ---------- ⑧ 商务蓝：无图无引文不画那条 24% 通顶 panel ---------- */
{
  const tpl = TEMPLATES[FAMILY_REPS.shangwu]
  const bare = S({ kind: 'close-read', title: '五件事排一排', items: ['接受任务', '诱敌上山', '引上绝路'], line: '按课文顺序排好。' })
  const out = place(bare, tpl)
  const panel = out.filter((p) => p.kind === 'rect' && p.h >= 0.99 && p.w >= 0.2)
  if (panel.length === 0) ok('⑧ 商务蓝无图无引文：通顶 panel 不画')
  else bad('⑧ 空 panel 还在', `${panel.length} 条`)
  const pulled = { ...bare, pull: '石头像雹子一样，带着五位壮士的决心，向敌人头上砸去。' }
  if (place(pulled, tpl).some((p) => p.kind === 'rect' && p.h >= 0.99 && p.w >= 0.2))
    ok('⑧ 有引文：panel 保留当引文底')
  else bad('⑧ 有引文时 panel 被误删')
}

if (failures.length) {
  console.error(`\n${failures.length} 项不合格`)
  process.exit(1)
}
console.log('\n凝练 + 无图不画大色块：全部合格')