/**
 * 新插一页：页型与整份学生版**同一套**（TASKS/21 §二.5）。
 *
 * 为什么单独一个文件：界面（PptPreview 的页型下拉）与门禁（check:deck-edit
 * 把每种页型都插一遍、跑 validateSlides + 导出）必须用同一张表。
 * 默认文案散在组件里，门禁就测不到；散在门禁里，界面又会跟它漂。
 *
 * 两条硬约束（踩过就知道）：
 * 1. 默认页必须自己先过 `validateSlides`——标题带一个真动作（「每页一个落点」）、
 *    备注非空、原文页的标题必须等于原文。否则老师一插页、点下载就被自己的闸门打回。
 * 2. 同一句不许上两页：连插两张同类页时，第二张起在标题 / 条目里带序号。
 *
 * 封面不在可插列表里：一份课件只有一张封面（`cover` 整页是一张画，第二张会撞句）。
 */
import type { StudentSlide, StudentSlideKind } from '../slides'

/** 能插的页型：学生版除封面外的全部页型 */
export type InsertKind = Exclude<StudentSlideKind, 'cover'>

/** 选页型时给人看的名字——不是页脚那行页名（`SLIDE_LABELS`），别混 */
export const INSERT_LABELS: Record<InsertKind, string> = {
  hook: '开场页',
  goals: '目标页',
  words: '字词页',
  quote: '原文页',
  'close-read': '普通文字页',
  compare: '对比页',
  board: '板书页',
  drill: '练习页',
  homework: '作业页',
  end: '收尾页',
}

/** 下拉里的顺序：按一节课的走向排；默认停在「普通文字页」（最常用） */
export const INSERTABLE: readonly InsertKind[] = [
  'hook',
  'goals',
  'words',
  'quote',
  'close-read',
  'compare',
  'board',
  'drill',
  'homework',
  'end',
]

/** 每种页型的默认标题：都必须带一个学生做得到的动作（validateSlides 的落点判据） */
const TITLES: Record<InsertKind, string> = {
  hook: '先看屏幕上这一句',
  goals: '看这三件事，一件一件做',
  words: '把这几个词读准',
  quote: '抄一句课文原文',
  'close-read': '写下你要问的那一句',
  compare: '比一比这两句',
  board: '写下黑板上的这一行',
  drill: '把这一题做一遍',
  homework: '写下今天的作业',
  end: '再读一遍这一句',
}

/** 默认备注：老师上台念的第一句，不许出现教学动作词（环节 / 引导 / 预设 / 板书 …） */
const NOTES: Record<InsertKind, string> = {
  hook: '先看屏幕上这一句，猜猜今天要学什么。',
  goals: '先看这三件事，心里有个数，一会儿一件一件来。',
  words: '先把这个词读两遍，再想想它在这句话里的意思。',
  quote: '这一页把课文里的原句原样放在屏幕上，先自己读一遍。',
  'close-read': '先看屏幕上这一句，想想它问的是什么。',
  compare: '先读左边这一句，再读右边这一句，看看哪里不一样。',
  board: '先看黑板上的这一行，再跟着说一遍。',
  drill: '先自己算一遍，再和同桌对一对。',
  homework: '下课之前看一眼，回家照着做。',
  end: '下课之前，一起把这一句再读一遍。',
}

/** 第 2 张起带的序号：同一句不许上两页，默认文案也要各是各的 */
const serialOf = (n: number): string => (n > 1 ? `（${n}）` : '')

/**
 * 造一页新页。`serial` 是这一叠里第几张新页（从 1 起）：
 * 第 2 张起在标题 / 条目上带序号，避免默认文案跨页撞句。
 */
export function newPage(kind: InsertKind, serial = 1): StudentSlide {
  const n = Math.max(1, Math.floor(serial) || 1)
  const tail = serialOf(n)
  const title = `${TITLES[kind]}${tail}`
  const base: StudentSlide = { kind, title, notes: NOTES[kind] }

  /* 原文页：标题就是原文，一个字都不许改（validateSlides 会逐字比） */
  if (kind === 'quote') return { ...base, text: title }
  /* 字词页：≤4 词（物理上限），先给一个占位词，老师点开就换 */
  if (kind === 'words') return { ...base, items: [n > 1 ? `第 ${n} 个词` : '这个词'] }
  /* 对比页：items 两两一对，先给一对占位，老师改成真正的两句 */
  if (kind === 'compare') {
    return {
      ...base,
      items: n > 1 ? [`左边这一句（${n}）`, `右边这一句（${n}）`] : ['左边这一句', '右边这一句'],
    }
  }
  return base
}