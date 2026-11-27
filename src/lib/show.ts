/**
 * 网页演示的播放计划（TASKS/07 §4.3）。
 *
 * 这里只做一件事：给学生版那一叠 StudentSlide[] 逐页标注「这一页用哪个动效播」。
 * 一页一条记录——不增页、不删页、更不回头从 LessonPlan 另拼一套页。
 * 过去「演示 10 页 / 导出 11 页」的分叉就长在 SlideShow 自带的 buildPages 上，
 * 那个函数已经被删掉，页数现在只可能等于 slides.length。
 *
 * 本文件是纯数据（没有 JSX、没有 CSS、没有 React），所以 scripts/check-slides.ts
 * 能在 node 下直接把两侧页数打出来对账。动效数据仍出自 src/data/anim.ts 的手工定义。
 */
import { CUBE_FACES, hasCube, pickTrack, type Track, type TrackNode } from '../data/anim'
import { SLIDE_LABELS, compareDiffProblems, type StudentSlide, type StudentSlideKind } from './slides'

export type ShowTemplate = 'cover' | 'reveal' | 'explode' | 'path'

export type ShowScene =
  | { template: 'cover'; slide: StudentSlide }
  | {
      template: 'reveal'
      slide: StudentSlide
      items: string[]
      question: string
      figure: string
      /** 字词页：一行一词的大字（对应 pptx 的 54pt 下限） */
      big: boolean
      /** 对比页：左右两栏，和 pptx 同一件事对一件事 */
      columns: boolean
    }
  | { template: 'explode'; slide: StudentSlide; items: string[]; question: string; noteShorts: string[] }
  | { template: 'path'; slide: StudentSlide; track: Track; trail: string[]; question: string }

/** 左上角分类小字与 .pptx 用的是同一张表 */
export function sceneLabel(slide: StudentSlide): string {
  return SLIDE_LABELS[slide.kind] ?? String(slide.kind)
}

/** 引号里的那句就是老师要念、要问的那句——标成 **词**，由 RevealSlide 描朱红下线 */
export function mark(text: string): string {
  return markSafe(String(text ?? ''))
}

function markSafe(text: string): string {
  return text.replace(/["“]([^"”]{1,24})["”]/g, '**“$1”**')
}

/** 一张页面切成「条目」与「问句」：问句排最后一步揭示，页面才留得住那片白 */
export function splitBody(slide: StudentSlide): { items: string[]; question: string } {
  const items = (slide.items ?? []).map(markSafe)
  const line = String(slide.line ?? '').trim()
  if (!line) return { items, question: '' }
  if (/[？?]/.test(line)) return { items, question: markSafe(line) }
  items.push(markSafe(line))
  return { items, question: '' }
}

/** 页面里那条「A → B → C」主线：路径型内容的信号，动效数据仍取自 anim.ts */
function chainOf(slide: StudentSlide): string[] | null {
  for (const text of slide.items ?? []) {
    if (!/(→|—|>)/.test(text)) continue
    const chain = text
      .split(/(→|—|>)/)
      .filter((piece) => !/(→|—|>)/.test(piece))
      .map((piece) => piece.trim())
      .filter(Boolean)
    if (chain.length >= 2) return chain
  }
  return null
}

/** 动效模板只看这一叠页面里的文字，不再看教案一眼 */
function subjectText(slides: StudentSlide[]): string {
  return slides
    .map((s) => [s.title, s.line ?? '', ...(s.items ?? [])].join(' '))
    .join(' ')
}

function indexOfKind(slides: StudentSlide[], kind: StudentSlideKind): number {
  return slides.findIndex((s) => s.kind === kind)
}

/**
 * 逐页分配模板（任务 04 的三种动效一种都不丢）：
 * - cover → 封面页（课题 + 一句引子，没有信息条）
 * - 有 track（桂花雨 / 长征）且该页写着 → 主线 → PathSlide 路径生长
 * - 有 cube（长方体）→ 落在对比页（「相对的面一样大、相对的棱一样长」正是拆解图要说的话），
 *   没有对比页退到精读页
 * - 其余（goals / words / close-read / compare / board / drill / homework / end）→ RevealSlide 逐层揭示
 */
export function buildScenes(slides: StudentSlide[]): ShowScene[] {
  const text = subjectText(slides)
  const track = pickTrack(text)
  const cube = hasCube(text)

  let pathIndex = -1
  if (track) {
    pathIndex = slides.findIndex((s) => s.kind === 'board' && chainOf(s))
    if (pathIndex < 0) pathIndex = slides.findIndex((s) => chainOf(s))
  }

  let explodeIndex = -1
  if (cube) {
    explodeIndex = indexOfKind(slides, 'compare')
    if (explodeIndex < 0) explodeIndex = indexOfKind(slides, 'close-read')
    if (explodeIndex === pathIndex) explodeIndex = -1
  }

  return slides.map((slide, i) => {
    const { items, question } = splitBody(slide)

    if (slide.kind === 'cover') return { template: 'cover', slide }

    if (i === explodeIndex)
      return { template: 'explode', slide, items, question, noteShorts: CUBE_FACES.map((f) => f.noteShort) }

    if (track && i === pathIndex) {
      // 那条 → 主线交给路径生长来演，剩下的条目当板书旁注，问句留在页面上
      const trail = items.filter((t) => !/(→|—|>)/.test(t))
      return { template: 'path', slide, track, trail, question }
    }

    return {
      template: 'reveal',
      slide,
      items,
      question,
      figure: String(slide.imageHint ?? ''),
      big: slide.kind === 'words',
      columns: slide.kind === 'compare',
    }
  })
}

/** 一页里有几步动效：条目一步一条、问句压到最后一步；拆解三步；路径一站一步 */
export function stepsOf(scene: ShowScene): number {
  if (scene.template === 'reveal') {
    return Math.max(1, scene.items.length + (scene.question ? 1 : 0))
  }
  if (scene.template === 'explode') return 3
  if (scene.template === 'path') return Math.max(1, scene.track.nodes.length)
  return 1
}

/* ================================================================== *
 * TASKS/08 §A：三页真交互的纯函数（鼠标岔路）
 *
 * 铁律「键盘走主线，鼠标走岔路」的落地形式：
 * · 上面 stepsOf 的返回值一个都没动，键盘逐层揭示的节拍与 HEAD 完全一致；
 * · 这一段每个函数都只吃进「岔路 state + 页面数据」，产出「该显示什么」，
 *   不产生任何对 step / page 的回写——两条线不共享可变状态。
 * 全部是纯数据（无 JSX / 无 CSS），scripts/check-lib.ts 才能在 node 下离线对账。
 * ================================================================== */

export type InteractiveMode = 'explode' | 'compare' | 'path'

/** 拆解页零件浮出短字的硬上限（§A.2①「≤12 字」，数据侧由 slides.ts floatTextProblems 把关） */
export const PART_NOTE_MAX = 12
/** 对比页浮出「哪儿不一样」的硬上限：与零件短标签同一把尺，§A 数据契约定的 ≤12 字 */
export const COMPARE_HINT_MAX = 12

/** 揭示排版用的 **词** 标记不吃进浮出小字 */
function stripRich(text: string): string {
  return String(text ?? '').replace(/\*\*/g, '').trim()
}

/**
 * 这一页有没有岔路（A.4.5：交互只存在于这三类页）。判定只认 kind / template：
 * - explode 模板页 → 'explode'（拆开/合上 + 零件点选）
 * - path 模板页 → 'path'（跳站）
 * - reveal 模板且是两栏版式的 compare 页，**且 compareDiff 齐整合格** → 'compare'（左右联动）；
 *   字段缺失/条数不齐/超 12 字/踩语气判定的页，对比岔路降级为不可点（§A 数据契约）。
 * 其余一律 null。
 */
export function interactiveModeOf(slide: StudentSlide, scene: ShowScene): InteractiveMode | null {
  if (scene.template === 'explode') return 'explode'
  if (scene.template === 'path') return 'path'
  if (scene.template === 'reveal' && scene.columns && slide.kind === 'compare') {
    return compareDiffProblems(slide.compareDiff, scene.items.length).length === 0 ? 'compare' : null
  }
  return null
}

export type CompareSide = 'left' | 'right'

export interface ComparePair {
  /** 左栏那一项在 items 里的下标 */
  left: number
  /** 右栏对应项下标；奇数项时右栏缺这一项，为 -1（只高亮被点的自己） */
  right: number
  /** 越界回落后实际的被点项下标 */
  active: number
  /** 中间浮出的「哪儿不一样」，来自该页 compareDiff[row]；没带 slide 时为空串 */
  hint: string
}

/**
 * 对比页左右联动：两栏版式按行优先铺 items，偶数下标在左栏、奇数在右栏，
 * 所以「第 r 行」就是 (2r, 2r+1) 的一对。index = 被点列内的行号（0 起），
 * side = 被点的那一栏。越界一律回落（不 throw）：行号钉到存在的最后一行；
 * 点右栏而该行没有右栏项（奇数项尾巴）就回落到上一整行。
 * 浮出的 hint 取回落后的那一行的 compareDiff[row]（数据层已保证每条 ≤12 字）。
 * 「再点同一项清除」是组件自己的事（把 pairIndex 置 -1），这里保持无状态。
 */
export function comparePairOf(
  index: number,
  side: CompareSide,
  count: number,
  slide?: Pick<StudentSlide, 'compareDiff'>
): ComparePair | null {
  if (!Number.isFinite(count) || count < 1) return null
  const rows = Math.ceil(count / 2)
  let row = Number.isFinite(index) ? Math.floor(index) : 0
  if (row < 0) row = 0
  if (row > rows - 1) row = rows - 1
  let left = row * 2
  let right = left + 1 < count ? left + 1 : -1
  if (side === 'right' && right < 0) {
    row = Math.max(0, row - 1)
    left = row * 2
    right = left + 1 < count ? left + 1 : -1
  }
  return {
    left,
    right,
    active: side === 'right' ? right : left,
    hint: stripRich(String(slide?.compareDiff?.[row] ?? '')),
  }
}

/**
 * 路径页跳站：点第 i 站就把渲染推进到「第 i+1 步」的同款画面（线长到那站、
 * 那站的一句话展开）。任意节点可达、允许倒退——这里不做任何单调约束；
 * 越界回落钳进 [0, n-1]。返回值只喂给渲染，绝不写回键盘的 step。
 */
export function pathStepOf(nodeIndex: number, nodes: readonly TrackNode[]): number {
  const n = Array.isArray(nodes) ? nodes.length : 0
  if (n < 1) return 1
  let i = Number.isFinite(nodeIndex) ? Math.floor(nodeIndex) : 0
  if (i < 0) i = 0
  if (i > n - 1) i = n - 1
  return i + 1
}

/* ---------- 「这里可以点」提示（§A.3.3）：纯状态机，定时器只有 showing 一个出口 ---------- */

export const HINT_TEXT = '这里可以点'
export const HINT_AUTO_HIDE_MS = 3000

export interface HintState {
  /** 已经提示过的页码：同一页只提一次（「首次进入」） */
  seen: number[]
  /** I 键全局关闭（会话内状态，不落 localStorage） */
  disabled: boolean
  /** 当前正在提示的页码，-1 = 没有 */
  showing: number
}

export const initialHintState: HintState = { seen: [], disabled: false, showing: -1 }

/** 进页时该不该亮提示：只给有交互的页、每页一次、关掉后永不再亮 */
export function hintOnPageEnter(state: HintState, page: number, interactive: boolean): HintState {
  if (state.disabled || !interactive || state.seen.indexOf(page) >= 0) {
    return state.showing === -1 ? state : { ...state, showing: -1 }
  }
  return { ...state, seen: [...state.seen, page], showing: page }
}

/** 3 秒到，自己淡出 */
export function hintOnAutoHide(state: HintState): HintState {
  return state.showing === -1 ? state : { ...state, showing: -1 }
}

/** 按 I：全局关闭，连正在淡着的也立刻收掉 */
export function hintOnDisableKey(state: HintState): HintState {
  return { ...state, disabled: true, showing: -1 }
}
