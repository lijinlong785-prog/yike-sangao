import type { LessonPlan, PrepItem, SegmentTimed } from '../types'
import type { Pause } from '../types'
import { deckRangeFor, scaleOf } from './scale'
import { isSceneKind, type SceneSlot } from './scene'

/**
 * 页型。09 §S 之前只有 7 种，且每环节固定一页，于是 4 分钟和 40 分钟页数一模一样。
 * 新增的五种只服务「时长驱动页数」：
 *   design / hardpoint   开课前的两张「怎么上」——10 §一 要求的教学主张与难点处理
 *   segmentPoint         环节的要点页（lesson 档每环节的第二页，09 §S）
 *   pause                停顿点专页，clip 档页数不够时按环节补进来的那一页
 *   activity / assessment 课中练习 / 当堂检测（09 §S 硬要求：lesson 档必须有）
 */
export type DeckKind =
  | 'cover'
  | 'objectives'
  | 'keypoints'
  | 'design'
  | 'hardpoint'
  | 'segment'
  | 'segmentPoint'
  | 'pause'
  | 'activity'
  | 'assessment'
  | 'board'
  | 'prep'
  | 'homework'

/** 课件页 = 网页预览和 .pptx 共用的同一份数据，保证「看到的」就是「下载的」 */
export interface DeckPage {
  kind: DeckKind
  /** 左上角分类小字 */
  label: string
  title: string
  /** 正文要点 */
  bullets?: string[]
  /** 教学过程页的环节时长，如 01:10 */
  duration?: string
  /** 底部提问 */
  question?: string
  /** 需要配图时的图位说明 */
  figureHint?: string
  /** 教学准备页的三组内容 */
  prep?: { heading: string; items: PrepItem[] }[]
  /** 演讲者备注 = 该页口播逐字稿 */
  notes: string
  /**
   * 用户改过这一页（标题 / 要点 / 提问 / 备注任一被改，或是用户自己插的页）。
   * 课件持有化之后，「重新生成」不覆盖带这个标记的页（10 §七）。
   */
  userEdited?: boolean
  /**
   * 首次生成时的标题。用户把标题改掉之后，靠它认回「还是这一页」
   * （换规模、恢复单页都按它找）。buildDeck 保证每页都有。
   */
  baseTitle?: string
  /**
   * 这一页的版式（10 §十三 第 8 件）。由 assignDeckLayouts 统一排，不写进存档：
   * 它是「按当前这一叠怎么排」的推导结果，用户插的页也要立刻拿到一个版式。
   */
  layout?: PageLayout
  /** 这一页的视觉元素说明（版式名）。有它才算「每页至少一个视觉元素」 */
  visual?: string
  /**
   * 这一页的场景（TASKS 09 第 10 件）：petals / snow / rain / ''（留白）。
   * 与 layout 一样是推导结果、不进存档：换一篇课文、换一份方案就重排。
   */
  scene?: SceneSlot
}

/* ------------------ 版式轮换（10 §十三 第 8 件） ------------------ */

export const PAGE_LAYOUTS = ['full', 'split', 'cards', 'timeline', 'cloze'] as const

/** 五种版式：整页大图 / 左右分栏 / 卡片墙 / 时间轴 / 挖空猜 */
export type PageLayout = (typeof PAGE_LAYOUTS)[number]

export const LAYOUT_NAME: Record<PageLayout, string> = {
  full: '整页大图',
  split: '左右分栏',
  cards: '卡片墙',
  timeline: '时间轴',
  cloze: '挖空猜',
}

/** 页型 → 默认版式。整份至少三种版式靠这张表 + 下面的窗口补「整页大图」一起保证 */
const BASE_LAYOUT: Record<DeckKind, PageLayout> = {
  cover: 'full',
  objectives: 'cards',
  keypoints: 'split',
  design: 'timeline',
  hardpoint: 'cloze',
  segment: 'split',
  segmentPoint: 'cards',
  pause: 'cloze',
  activity: 'cards',
  assessment: 'cloze',
  board: 'timeline',
  prep: 'cards',
  homework: 'split',
}

const isLayout = (v: unknown): v is PageLayout =>
  (PAGE_LAYOUTS as readonly unknown[]).includes(v)

/** 窗口里挑一页做「整页大图」：优先环节页，其次最靠后的一页；不挑封面（封面本来就是） */
function pickFullSlot(pages: DeckPage[], from: number, to: number): number {
  for (let i = to - 1; i >= from; i--) {
    if (pages[i]?.kind === 'segment') return i
  }
  for (let i = to - 1; i >= from; i--) {
    if (pages[i]?.kind !== 'cover') return i
  }
  return to - 1
}

/**
 * 整叠排一遍版式（纯函数、确定性，不用随机）：
 *   0. AI 视觉方案给了第 i 页的版式就用它（`preferred`），没给才按页型兜底；
 *   1. 按页型给默认版式；环节页在「左右分栏 / 卡片墙 / 整页大图」里轮着来；
 *   2. 每 5 页至少一页「整页大图」——窗口里没有就补一页；
 *   3. 整份至少 3 种版式——不够就把中间几页换掉；
 *   4. 每页都写 visual（版式名），没有视觉元素这一页就不算合格。
 *
 * `preferred` 是 TASKS 09 第 9 件那条线：AI 读完课文自己排每页版式，前端按数据渲染。
 * 但它只被「采用」，不被「信任」：2、3 两条仍然在上面对它做一次体检式修补，
 * 因为模型排出来的版式照样可能五页全卡片、整份只用一种。
 *
 * `scenes` 是第 10 件那条线：每页的场景同样由模型按课文挑，这里只做形状对齐
 * （只认三种，其余一律留白），不管「该不该下雪」——那是课文的事，不是前端的事。
 */
export function assignDeckLayouts(
  pages: DeckPage[],
  preferred?: readonly (PageLayout | string | undefined)[] | null,
  scenes?: readonly (SceneSlot | string | undefined)[] | null
): DeckPage[] {
  const out: DeckPage[] = []
  let segmentSeen = 0
  pages.forEach((page, i) => {
    const want = preferred?.[i]
    let layout: PageLayout = isLayout(want)
      ? want
      : isLayout(page.layout)
        ? page.layout
        : BASE_LAYOUT[page.kind] ?? 'cards'
    if (page.kind === 'segment' && !isLayout(want) && !isLayout(page.layout)) {
      layout = segmentSeen % 2 === 0 ? 'split' : 'full'
      segmentSeen++
    }
    const wantScene = scenes?.[i]
    const scene: SceneSlot = isSceneKind(wantScene)
      ? wantScene
      : isSceneKind(page.scene)
        ? page.scene
        : ''
    out.push({ ...page, layout, visual: LAYOUT_NAME[layout], scene })
  })

  const fillWindows = () => {
    for (let i = 0; i + 5 <= out.length; i++) {
      const window = out.slice(i, i + 5)
      if (window.some((p) => p.layout === 'full')) continue
      const at = pickFullSlot(out, i, i + 5)
      out[at] = { ...out[at], layout: 'full', visual: LAYOUT_NAME.full }
    }
  }
  fillWindows()

  const kinds = () => new Set(out.map((p) => p.layout))
  if (out.length >= 3 && kinds().size < 3) {
    const wants: PageLayout[] = ['cards', 'timeline', 'cloze']
    let w = 0
    for (let i = 0; i < out.length && kinds().size < 3; i++) {
      if (out[i].layout === 'full' || out[i].kind === 'cover') continue
      const next = wants[w++ % wants.length]
      out[i] = { ...out[i], layout: next, visual: LAYOUT_NAME[next] }
      // 换掉的可能正好是某个窗口里唯一的「整页大图」，换完再补一次
      fillWindows()
    }
  }
  return out.map((p) => ({
    ...p,
    visual: p.visual || LAYOUT_NAME[(p.layout ?? 'cards') as PageLayout],
  }))
}

/**
 * 版式体检（离线门禁与界面共用一套判据）：
 *   整份 ≥3 种版式、每 5 页至少一页「整页大图」、每页都有视觉元素。
 * 返回问题清单，空数组 = 合格。
 */
export function layoutProblems(pages: DeckPage[]): string[] {
  const problems: string[] = []
  if (!Array.isArray(pages) || pages.length === 0) return ['一页都没有']
  const kinds = new Set<PageLayout>()
  pages.forEach((p, i) => {
    if (!isLayout(p.layout)) problems.push(`第 ${i + 1} 页没有版式`)
    else kinds.add(p.layout)
    if (!String(p.visual ?? '').trim()) problems.push(`第 ${i + 1} 页没有视觉元素`)
  })
  if (kinds.size < 3) problems.push(`整份只有 ${kinds.size} 种版式（${[...kinds].join('/')}），至少 3 种`)
  for (let i = 0; i + 5 <= pages.length; i++) {
    if (!pages.slice(i, i + 5).some((p) => p.layout === 'full')) {
      problems.push(`第 ${i + 1}–${i + 5} 页之间没有「整页大图」`)
    }
  }
  return problems
}

/** 把一段教师活动/学生活动切成可以直接上屏的短句 */
export function shortSentences(text: string, limit: number): string[] {
  return String(text ?? '')
    .split(/[。；;\n]/)
    .map((s) => s.trim().replace(/^[，,、]/, ''))
    .filter((s) => s.length > 1)
    .slice(0, limit)
    .map((s) => (s.length > 46 ? `${s.slice(0, 45)}…` : s))
}

export function clip(text: string, max: number): string {
  const chars = [...String(text ?? '').trim()]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('')
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 同一叠里标题不许重名（12 §二）。
 *
 * 两个理由：目录上重名就看不出哪页是哪页；页身份 deckPageKey = 页型|首版标题，
 * 同页型重名会让删页/恢复认错页。重名时从第二次出现起加序号，不改第一页的写法。
 */
export function uniqueTitles(pages: DeckPage[]): DeckPage[] {
  const seen = new Map<string, number>()
  return pages.map((p) => {
    const n = (seen.get(p.title) ?? 0) + 1
    seen.set(p.title, n)
    return n === 1 ? p : { ...p, title: `${p.title}（${n}）` }
  })
}

/* ---------------- 每个页型一个函数，页序由 buildDeck 拼 ---------------- */

function coverPage(plan: LessonPlan): DeckPage {
  const scale = scaleOf(plan.meta.duration)
  return {
    kind: 'cover',
    label: '课题',
    title: `《${plan.meta.topic}》`,
    bullets: [
      `${plan.meta.stage}${plan.meta.grade} · ${plan.meta.subject} · ${plan.meta.period}`,
      plan.meta.textbook ? plan.meta.textbook : '教材版本不限',
      `${mmss(plan.meta.duration)}`,
    ],
    notes: `各位评委老师好，我说课的题目是《${plan.meta.topic}》，选自${plan.meta.textbook || ''}${plan.meta.stage}${plan.meta.grade}，本次为${plan.meta.period}。${scale === 'lesson' ? '我把每个环节要做什么、要停在哪里问，都写在后面几页。' : ''}下面开始我的课堂。`,
  }
}

function objectivesPage(plan: LessonPlan): DeckPage {
  return {
    kind: 'objectives',
    label: '学习目标',
    title: '这一课要带学生弄懂什么',
    bullets: [
      `课文里的｜${clip(plan.objectives.knowledge, 56)}`,
      `课上怎么练｜${clip(plan.objectives.process, 56)}`,
      `读完留下的｜${clip(plan.objectives.emotion, 56)}`,
    ],
    notes: `这一课我只盯三件事。第一，课文要读准、读懂：${plan.objectives.knowledge} 第二，方法要在课上练出来：${plan.objectives.process} 第三，读完心里得留下点东西：${plan.objectives.emotion}`,
  }
}

function keyPointsPage(plan: LessonPlan): DeckPage {
  return {
    kind: 'keypoints',
    label: '重难点',
    title: '哪一处要多花时间，哪一处会卡住',
    bullets: [`要多花时间的｜${clip(plan.keyPoint, 60)}`, `容易卡住的｜${clip(plan.hardPoint, 60)}`],
    notes: `这一课的重点是${plan.keyPoint}。难点是${plan.hardPoint}。到难点我会慢下来，先让学生自己说，说错了再回去读课文。`,
  }
}

/** 「这一课我这么想」：10 §一 要的教学主张，写人话，不写教研套话 */
function designPage(plan: LessonPlan, timed: SegmentTimed[]): DeckPage {
  const first = timed[0]
  const middle = timed[Math.floor(timed.length / 2)]
  return {
    kind: 'design',
    label: '设计意图',
    title: '这一课，我这么想',
    bullets: [
      `从「${first?.name ?? '导入'}」进来：${clip(first?.goal ?? '', 44)}`,
      `中间这一段放开手让学生试：${clip(middle?.goal ?? plan.keyPoint, 44)}`,
      `最后收在「${clip(plan.keyPoint, 40)}」上`,
    ],
    notes: `先说这一课为什么这么排。开头不讲知识，先把学生拉进那个场景，${clip(first?.goal ?? '', 40)} 中段是学生自己动手、自己说的那一段，我退到旁边，只在他们卡住时递一句。最后回到${clip(plan.keyPoint, 36)}，让这一节课有一个能带走的落点。`,
  }
}

/** 难点怎么办：写清用什么东西把学生拉回课文，不复述难点 */
function hardPointPage(plan: LessonPlan): DeckPage {
  return {
    kind: 'hardpoint',
    label: '难点怎么办',
    title: '卡住的地方，我准备这么拆',
    bullets: [
      `卡在哪｜${clip(plan.hardPoint, 50)}`,
      `先给什么｜一个看得见、摸得着的东西，让学生有话可说`,
      `然后再问｜「你从哪儿看出来的」，让学生自己回到课文`,
    ],
    notes: `这个难点我不直接讲答案。${clip(plan.hardPoint, 60)} 直接讲，学生点头，下课就忘。我先给一个具体的东西让他看、让他摸，再问「你从哪儿看出来的」，让他自己走到那句话上。真没人接，就回黑板那一行，请刚才没举手的孩子再说一遍。`,
  }
}

function segmentPage(seg: SegmentTimed, index: number, total: number): DeckPage {
  const acts = shortSentences(seg.teacher, 2)
  return {
    kind: 'segment',
    label: total > 1 ? `环节 ${String(index + 1).padStart(2, '0')}` : '教学过程',
    title: seg.name,
    duration: mmss(seg.seconds),
    bullets: acts.length > 0 ? acts : [seg.goal],
    question: seg.pauses?.[0]?.question,
    notes: [
      seg.script,
      ...(seg.pauses ?? []).map((p) => `（停 ${p.seconds} 秒）${p.question}`),
    ].join(' '),
  }
}

/** lesson 档每环节的第二页：一页写「老师做什么」，一页写「学生做什么」。
 *  标题就用学生真要动手的那一句（不冠环节名）：同一种页型会出现五六次，
 *  冠上环节名就和上一页几乎一样，目录上一眼看不出这页干什么（12 §二）。 */
function segmentPointPage(seg: SegmentTimed, index: number): DeckPage {
  const stu = shortSentences(seg.student, 2)
  const first = stu[0] ?? seg.goal
  return {
    kind: 'segmentPoint',
    label: `环节 ${String(index + 1).padStart(2, '0')} · 学生做什么`,
    title: clip(first, 26),
    duration: mmss(seg.seconds),
    bullets: [
      `要做的｜${clip(seg.goal, 52)}`,
      ...(stu.length > 0 ? stu.map((s) => `学生｜${s}`) : ['学生｜先自己试，再同桌说']),
    ],
    question: seg.pauses?.[1]?.question ?? seg.pauses?.[0]?.question,
    notes: `${clip(seg.goal, 50)} 这一段我不替他们说。${stu.length > 0 ? stu.join('，') + '。' : ''}给足时间，等三五个孩子举手再点人，说错了也让他说完。`,
  }
}

function pausePage(seg: SegmentTimed, pause: Pause): DeckPage {
  return {
    kind: 'pause',
    label: '停一停',
    title: `停 ${pause.seconds} 秒：${clip(pause.question, 20)}`,
    question: pause.question,
    bullets: [`在「${clip(seg.name, 18)}」这一段停下来`, `问完不要马上接话，等手举起来`],
    notes: `（停 ${pause.seconds} 秒）${pause.question} 问完就闭嘴，数到三，别自己把答案说了。有人举手再点人；没人举手，就换成「说给你旁边的人听」。`,
  }
}

/** 课中练习 / 课堂活动：lesson 档必须有的一页（09 §S） */
function activityPage(plan: LessonPlan, timed: SegmentTimed[]): DeckPage {
  const pick =
    timed.find((s) => /练习|活动|操作|动手|搭建|摆|算一算|写一写|画一画|讨论|合作/.test(`${s.name}${s.teacher}${s.goal}`)) ??
    timed[timed.length - 1]
  const stu = shortSentences(pick?.student ?? '', 2)
  return {
    kind: 'activity',
    label: '课中活动',
    title: `学生自己做：${clip(pick?.name.split('·').pop()?.trim() ?? '这一段', 16)}`,
    duration: pick ? mmss(pick.seconds) : undefined,
    bullets: [
      `做什么｜${clip(pick?.name ?? plan.keyPoint, 40)}`,
      ...(stu.length > 0 ? stu.map((s) => `学生｜${s}`) : ['学生｜同桌互相说一遍，再请两个全班说']),
      '我做什么｜走下去听，挑一个说得不一样的，留到全班讲',
    ],
    question: pick?.pauses?.[0]?.question ?? '谁的说法和刚才不一样？',
    notes: `这一段我少说话。${clip(pick?.goal ?? plan.keyPoint, 46)} 学生在下面做，我走下去听，专门挑一个说得不一样的，等会儿请他上来讲。做不完不要紧，做错也不要紧，这一段就是要看见他们怎么想。`,
  }
}

/** 当堂检测：下课之前，怎么知道这节课成了 */
function assessmentPage(plan: LessonPlan, timed: SegmentTimed[]): DeckPage {
  const last = timed[timed.length - 1]
  return {
    kind: 'assessment',
    label: '当堂检测',
    title: '下课之前，对一对',
    bullets: [
      `每个人都要会｜${clip(plan.keyPoint, 40)}`,
      `能说清的才算过｜${clip(plan.hardPoint, 38)}`,
      '怎么查｜挑两个人说一遍，说不清就回到板书那一行',
    ],
    question: last?.pauses?.[0]?.question ?? '谁能用一句话说清今天学了什么？',
    notes: `最后留两分钟对一对。${clip(plan.keyPoint, 40)} 这条每个人都得会。请两个孩子用自己的话说一遍，说不清的地方，说明我前面讲快了，下一节课补。`,
  }
}

function boardPage(plan: LessonPlan): DeckPage {
  return {
    kind: 'board',
    label: '板书设计',
    title: '这一课，落在这几行字上',
    bullets: plan.blackboard.order.slice(0, 5),
    notes: `板书按这个顺序写：${plan.blackboard.order.join('；')}。字不多，但每一行都要在对应的环节落下去。`,
  }
}

function prepPage(plan: LessonPlan): DeckPage {
  return {
    kind: 'prep',
    label: '教学准备',
    title: '上课前，把这些备齐',
    prep: [
      { heading: '课件素材', items: plan.prep.courseware },
      { heading: '实物教具', items: plan.prep.physical },
      { heading: '音视频', items: plan.prep.media },
    ],
    figureHint: '此处放：本课主图（按检索词自行下载后替换）',
    notes: '教学准备分三组：课件素材、实物教具、音视频。每一项都写了用途和检索词，按清单备齐即可，不需要额外制作。',
  }
}

function homeworkPage(plan: LessonPlan): DeckPage {
  return {
    kind: 'homework',
    label: '作业',
    title: '课后做两件事',
    bullets: [`必做｜${clip(plan.homework.must, 60)}`, `选做｜${clip(plan.homework.optional, 60)}`],
    notes: `作业分两层。必做：${plan.homework.must} 选做：${plan.homework.optional}`,
  }
}

/**
 * 从教学设计推出课件页。纯本地排版，不调用模型，也不碰 pptxgenjs。
 *
 * 页数由 scale.ts 决定（09 §S）：
 *   clip   封面 / 目标 / 重难点 / 设计意图 + 每环节一页 + 板书 / 准备 / 作业 = 7 + S
 *   lesson 上面再加「难点处理 / 课中活动 / 当堂检测」，每环节摊成两页（环节 + 要点）= 10 + 2S
 * 不足下限时按环节顺序补「停一停」页，补够就停；因此四个内置示例在两档里都稳稳落在区间内。
 */
export function buildDeck(plan: LessonPlan, timed: SegmentTimed[]): DeckPage[] {
  const scale = scaleOf(plan.meta.duration)
  const lesson = scale === 'lesson'
  // 页数按所选时长分档（20 / 30 / 40 各不相同），不再只分 clip / lesson
  const range = deckRangeFor(plan.meta.duration)
  const segs = timed.length > 0 ? timed : []

  const head: DeckPage[] = [
    coverPage(plan),
    objectivesPage(plan),
    keyPointsPage(plan),
    designPage(plan, segs),
  ]
  if (lesson) head.push(hardPointPage(plan))

  const blocks: DeckPage[][] = segs.map((seg, i) => {
    const block = [segmentPage(seg, i, segs.length)]
    if (lesson) block.push(segmentPointPage(seg, i))
    return block
  })

  const tail: DeckPage[] = lesson
    ? [
        activityPage(plan, segs),
        assessmentPage(plan, segs),
        boardPage(plan),
        prepPage(plan),
        homeworkPage(plan),
      ]
    : [boardPage(plan), prepPage(plan), homeworkPage(plan)]

  const count = () => head.length + blocks.reduce((n, b) => n + b.length, 0) + tail.length

  // 页数不够下限：按环节顺序补「停一停」页（每环节最多一页），补够就停
  for (let i = 0; i < blocks.length && count() < range.min; i++) {
    const pause = segs[i].pauses?.[0]
    if (pause) blocks[i].push(pausePage(segs[i], pause))
  }
  // 还是没有停顿点可补（教案没写）：给最长的几个环节各补一页「学生做什么」，页数下限不能让教案缺字段拖垮
  const byLength = blocks
    .map((b, i) => ({ i, secs: segs[i].seconds }))
    .sort((a, b) => b.secs - a.secs)
  for (const { i } of byLength) {
    if (count() >= range.min) break
    blocks[i].push(segmentPointPage(segs[i], i))
  }

  const pages = [...head, ...blocks.flat(), ...tail]
  // 上限兜底：只可能发生在环节特别多 + 每环节都有停顿点的情况，从尾部保留主干，砍掉多出来的停一停
  while (pages.length > range.max) {
    const at = pages.map((p) => p.kind).lastIndexOf('pause')
    if (at < 0) break
    pages.splice(at, 1)
  }
  // 首版标题落一份：用户改过标题之后，换规模 / 恢复单页仍认得出是同一页
  return uniqueTitles(pages).map((p) => (p.baseTitle ? p : { ...p, baseTitle: p.title }))
}

/* ================================================================== *
 * 可编辑（TASKS/09 §E / 10 §七）：以下全是纯函数，界面只负责调。       *
 *                                                                    *
 * 一条边界：改课件不反写教案。deck 是独立的一份状态，plan 是原始凭据。 *
 * ================================================================== */

/** 一页的身份：页型 + 首版标题。标题被改掉之后也认得出是同一页 */
export function deckPageKey(page: DeckPage): string {
  return `${page.kind}|${page.baseTitle ?? page.title}`
}

/**
 * 给老师自己看、不上学生版的页（TASKS/17 §二.3 / 22 §2.1）。
 * 「设计意图」写的是这一课为什么这么排，「上课前备齐」写的是老师要准备的东西——
 * 这两页投到墙上，学生既不能读也不能做。从前它们会被当成精读 / 情境页搬上屏，
 * 再被 asTask 补一个动词，变成「读这一课，我这么想」这种四字对偶腔。
 *
 * 教师视角的句子特征（TASKS/22 §2.1）：主语是老师、动作是备课 / 排课 / 点名，
 * 学生照着做不了。这里用句子特征判，不按页型一刀切——重难点页里如果写的是课文内容
 * （「潮来时声音越来越大」），那一句该留给学生看。
 */
const TEACHER_VOICE =
  /我准备|我打算|我这样|我要先|先给什么|然后再问|卡在哪|学情|预设|我会问|板书设计|这个环节|本环节的设计|谁读给大家听|谁来说|全班对答案|同桌互查/

const TEACHER_PAGE_KINDS = new Set<DeckKind>(['design', 'prep'])

/** 页型 + 内容双判：任一命中就算教师页，不上学生版、也不进模型的页清单 */
export function isTeacherPage(page: DeckPage | null | undefined): boolean {
  if (!page) return false
  if (TEACHER_PAGE_KINDS.has(page.kind)) return true
  if (TEACHER_VOICE.test(String(page.title ?? ''))) return true
  const hits = (page.bullets ?? []).filter((b) => TEACHER_VOICE.test(String(b ?? '')))
  return hits.length >= 2
}

/* ================================================================== *
 * 改过就作废（TASKS/17 §二.5）：学生版的缓存钥匙里得有这一叠课件的指纹。 *
 * ================================================================== */

/**
 * 这一叠课件的指纹：页数 + 每一页的页型 / 标题 / 要点 / 提问。
 * 只算「老师看得见的内容」：layout / scene / userEdited 都是推导出来的，
 * 把它们算进去会让「什么都没改」也换钥匙。改一个字就得换钥匙，不许命中旧叠。
 *
 * 用 FNV-1a 哈希：同步、确定、不依赖 crypto / 不依赖序列化顺序。
 */
export function deckFingerprint(pages: readonly DeckPage[] | null | undefined): string {
  const list = pages ?? []
  let h = 2166136261
  const feed = (text: unknown): void => {
    const s = String(text ?? '')
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    // 字段之间插一个分隔符：「ab|c」与「a|bc」不能撞成一把钥匙
    h ^= 0x1f
    h = Math.imul(h, 16777619)
  }
  for (const page of list) {
    feed(page?.kind)
    feed(page?.title)
    for (const b of page?.bullets ?? []) feed(b)
    feed(page?.question)
  }
  return `${list.length}-${(h >>> 0).toString(36)}`
}

/**
 * 两叠页是不是同一叠：页数、页序、页身份全都一样。
 * 判断「用户到底动过没有」用它——只删了一页、只调了序，userEdited 是空着的。
 */
export function sameDeckStack(a: DeckPage[], b: DeckPage[]): boolean {
  if (a.length !== b.length) return false
  return a.every((page, i) => deckPageKey(page) === deckPageKey(b[i]))
}

/** 改一个字段：打 userEdited、留住首版标题（第一次改时把当时的标题记下） */
export function editDeckPage(page: DeckPage, patch: Partial<DeckPage>): DeckPage {
  return {
    ...page,
    ...patch,
    baseTitle: page.baseTitle ?? page.title,
    userEdited: true,
  }
}

/**
 * 改第 index 条要点：空字符串视为删掉这一条（09 §E.2）。
 * index 超出长度时当追加，空串追加不生效（不留一条看不见的空行）。
 */
export function setDeckBullet(page: DeckPage, index: number, text: string): DeckPage {
  const list = [...(page.bullets ?? [])]
  const trimmed = text.trim()
  if (index >= list.length) {
    if (trimmed) list.push(text)
  } else if (trimmed) {
    list[index] = text
  } else {
    list.splice(index, 1)
  }
  return editDeckPage(page, { bullets: list })
}

/** 插一页空白页（09 §E.3 定死的样子），插入即视为用户内容 */
export function blankDeckPage(): DeckPage {
  return {
    kind: 'segment',
    label: '补充',
    title: '（点这里写标题）',
    bullets: [''],
    notes: '',
    userEdited: true,
  }
}

/** 在第 index 页后面插一页空白页；index 越界就接在末尾 */
export function insertDeckPage(pages: DeckPage[], index: number): DeckPage[] {
  const next = [...pages]
  const at = Math.min(Math.max(index + 1, 0), next.length)
  next.splice(at, 0, blankDeckPage())
  return next
}

/** 删第 index 页。封面（kind === 'cover'）不许删，返回原数组 */
export function removeDeckPage(pages: DeckPage[], index: number): DeckPage[] {
  const page = pages[index]
  if (!page || page.kind === 'cover') return pages
  return pages.filter((_, i) => i !== index)
}

/** 上移 / 下移（delta = -1 / +1），越界不动 */
export function moveDeckPage(pages: DeckPage[], index: number, delta: number): DeckPage[] {
  const to = index + delta
  if (!pages[index] || to < 0 || to >= pages.length) return pages
  const next = [...pages]
  const [page] = next.splice(index, 1)
  next.splice(to, 0, page)
  return next
}

/**
 * 恢复这页：按身份回原始版本，改过的标记一并抹掉。
 * 找不到同身份的原始页（用户自己插的页）就原样返回。
 */
export function restoreDeckPage(
  pages: DeckPage[],
  index: number,
  original: DeckPage[]
): DeckPage[] {
  const page = pages[index]
  if (!page) return pages
  const key = deckPageKey(page)
  const src = original.find((p) => deckPageKey(p) === key)
  if (!src) return pages
  const next = [...pages]
  next[index] = { ...src }
  return next
}

/**
 * 重新生成后的合页（10 §七「只要这页没被点名，重生成多少次都原样保留」）。
 *
 * 规则：
 *   1. 页序、页数以新生成的那份为准；
 *   2. 带 userEdited 的页，按身份（页型 + 首版标题）认回新稿里的同一页，内容用用户的；
 *   3. 新稿里找不到身份的，就是用户自己插的页：接在它原来前一页的后面；
 *   4. 没打标记的页一律用新稿（编辑过却没打标记的情况不该存在，真出现了也以新稿为准）。
 */
export function mergeDeck(fresh: DeckPage[], prev: DeckPage[] | null | undefined): DeckPage[] {
  if (!prev || prev.length === 0) return fresh
  const pool = prev.filter((p) => p.userEdited)
  if (pool.length === 0) return fresh

  const out = fresh.map((page) => {
    const at = pool.findIndex((p) => deckPageKey(p) === deckPageKey(page))
    return at < 0 ? page : pool.splice(at, 1)[0]
  })

  // 剩下的是用户自己插的页：接在它原来前一页（那一页在新稿里也有）的后面
  for (const orphan of pool) {
    const at = prev.indexOf(orphan)
    const anchor = prev
      .slice(0, Math.max(0, at))
      .reverse()
      .find((p) => out.some((o) => deckPageKey(o) === deckPageKey(p)))
    const at2 = anchor ? out.findIndex((o) => deckPageKey(o) === deckPageKey(anchor)) : -1
    out.splice(at2 >= 0 ? at2 + 1 : out.length, 0, orphan)
  }
  return out
}

/* ------------------ 删页墓碑 / 调序（10 §十三 第 3、4 件） ------------------ */

/**
 * 一叠课件在「页身份」层面的布局。
 *   deleted  用户删掉的页 id（kind|首版标题）——墓碑，重建时照这个劝退
 *   order    用户拖出来的页序（也是 id 数组）
 * 两个都用 `deckPageKey`，不用下标：下标一换规模就全错位了。
 */
export interface DeckLayout {
  deleted: string[]
  order: string[]
}

/** 从「用户看到的那一叠 + 这一版原稿」反推出布局。纯函数，界面上每次改动都重算一次 */
export function layoutOfDeck(pages: DeckPage[], base: DeckPage[]): DeckLayout {
  const kept = new Set(pages.map(deckPageKey))
  return {
    deleted: base.map(deckPageKey).filter((id) => !kept.has(id)),
    order: pages.map(deckPageKey),
  }
}

/**
 * 按布局重建：先剔掉删过的页（碑），再按用户拖过的顺序重排。
 *
 * 重排只动「用户见过的那几页」：新稿新长出来的页（新环节、新课型）留在它们原来的
 * 位置，不被打包扔到末尾。做法是只在「已知页占的槽位」之间按 order 重新安放，
 * 未命名的页原地不动——这样换规模后既保住了拖拽结果，也没把结构拆散。
 */
export function applyDeckLayout(
  fresh: DeckPage[],
  layout: DeckLayout | null | undefined
): DeckPage[] {
  if (!layout) return fresh
  const dead = new Set(layout.deleted ?? [])
  const kept = fresh.filter((p) => !dead.has(deckPageKey(p)))
  const rank = new Map<string, number>()
  ;(layout.order ?? []).forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i)
  })
  if (rank.size === 0) return kept

  const slots: number[] = []
  kept.forEach((page, i) => {
    if (rank.has(deckPageKey(page))) slots.push(i)
  })
  const known = slots
    .map((slot) => ({ page: kept[slot], slot }))
    .sort((a, b) => (rank.get(deckPageKey(a.page)) ?? 0) - (rank.get(deckPageKey(b.page)) ?? 0) || a.slot - b.slot)

  const out = [...kept]
  slots.forEach((slot, i) => {
    out[slot] = known[i].page
  })
  return out
}