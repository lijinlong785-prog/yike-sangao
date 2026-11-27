import type { LessonPlan, Segment } from '../types'
import { postChatJson, type LLMConfig } from './llm'
import { buildStudentSlidesPrompt } from './prompt'
import { scanVoiceDocs, scanVoice, tasteProblems, type VoiceDocEntry } from './voice'
import {
  DEFAULT_LIMITS,
  ENVELOPE,
  PAGE_RANGE,
  WORDS_ITEMS_MAX,
  limitsOf,
  type DensityLimits,
} from './density'
import { limitsFor, planOfScale, scaleOf, slideRangeFor, tierOf, type Scale } from './scale'
import { isSceneKind, type SceneSlot } from './scene'
import { isTeacherPage, type DeckKind, type DeckPage } from './deck'
import { splitQuotes } from '../data/texts'
import { directorCache, illustCache } from './deckStore'
import { ILLUST_MODEL } from './illustrate'
import { allowFor, runDeckDirector, type TextLayout } from './director'
import { packOf, type SubjectPack } from './subject'
import { motifOf, type MotifKey } from './motifs'
import { GUIHUA_STUDENT_SLIDES } from '../data/guihua'
import { BIDAXIAO_STUDENT_SLIDES } from '../data/bidaxiao'
import { CHANGFANGTI_STUDENT_SLIDES } from '../data/changfangti'
import { CHANGZHENG_STUDENT_SLIDES } from '../data/changzheng'
import { HETANG_STUDENT_SLIDES } from '../data/hetang'
import { CHUN_STUDENT_SLIDES } from '../data/chun'
import { BEIYING_STUDENT_SLIDES } from '../data/beiying'
import { FENSHU_STUDENT_SLIDES } from '../data/fenshu'
import { YUANMIANJI_STUDENT_SLIDES } from '../data/yuanmianji'
import { CAOCHUAN_STUDENT_SLIDES } from '../data/caochuan'
import { attachBuiltinArt } from '../data/builtinArt'

/* ================================================================== *
 * 学生版课堂 PPT 的唯一真源                                          *
 *                                                                    *
 * 课件（DeckPage）是给老师读的，这一份是给学生抬头看的。两者内容不同、 *
 * 页数不同，但网页演示和导出的 .pptx 必须共用这里的同一份 StudentSlide[]。 *
 * 页型、页序、禁词、字号——只在本文件定义，别处一律 import；正文上限、条目数、  *
 * 页数、精读页数按档取值，唯一真源在 density.ts。                              *
 * ================================================================== */

export const SLIDE_KINDS = [
  'cover',
  'hook',
  'goals',
  'words',
  'close-read',
  'compare',
  'board',
  'drill',
  'homework',
  'end',
  /* TASKS/19a：原文页。只进合法页型，不进下面的页序骨架——没有原文时一页都不出 */
  'quote',
] as const

export type StudentSlideKind = (typeof SLIDE_KINDS)[number]

/** 课件页 = 学生版课堂 PPT 共用数据；notes 是这一页老师说什么（口语，可直接念） */
export interface StudentSlide {
  kind: StudentSlideKind
  /** 学生看到的大字（≥40pt，不计入正文字数；正文字数按档取值，见 density.ts） */
  title: string
  /** 一句原文 / 一个问句（只能一句） */
  line?: string
  /**
   * 原文页（kind = 'quote'）的正文：课文里逐字存在的一句，一个字都不许改。
   * 其余页型的正文仍在 line / items 里，这里留空。
   */
  text?: string
  /** 原文页的出处或一句提示（≤12 字，可空）；其余页型不填 */
  note?: string
  /** 字词页、作业页、对比页用，每项一行 */
  items?: string[]
  /** 图位检索词：渲染在虚线占位框里的灰字，课前要换成真图 */
  imageHint?: string
  /**
   * 封面上的教材标注（TASKS/25）：如「小学语文 · 五年级上册」。
   * 只在 kind='cover' 用；模型给不出就由 plan.meta 拼一个，老师能直接改。
   */
  meta?: string
  /**
   * 封面上的署名（年级班级 / 授课人）：如「五年级（3）班 · 张老师」。
   * 班级号没有来源，默认留一个空位给老师填，填过就记住。
   */
  byline?: string
  /**
   * 这一页配的插画（TASKS/11 + 12）：`data:image/png;base64,...`，由 buildStudentSlides
   * 在「两遍导演都跑通」时填进来。没有就是没有——那页按原来的纯文字排版走，
   * 不补空框、不提示、不影响现有流程。
   */
  illustration?: string
  /**
   * 引文块（2026-11-22）：这一页没配图时，把本页那句**逐字出自课文**的原句
   * 摆进图位那块色块里，别让版面留一块空色。
   *
   * 与 `text` 的区别：`text` 是原文页（kind='quote'）整页的正文，一页只有它；
   * `pull` 是活动页（goal / hook / drill / words）右半块里的一句提词，可空。
   * 由 buildStudentSlides 逐字比对课文后填——比不上的句子一律不填，
   * 编造的「课文原句」比空块坏得多。
   */
  pull?: string
  /**
   * 图落在哪半边（TASKS/12 §三）：由第二遍按「图上量出来的空白侧」定，
   * 导出的 .pptx 与预览层都按它取左/右，不再写死贴右。
   */
  artSide?: 'left' | 'right'
  /**
   * 封面的构图（TASKS/20b §2.3）：只在 kind='cover' 且这一页真的有画时生 效。
   * 由导演那一层按图上量出来的四象限空占比定（deck2/place.ts 的 coverLayoutOf），
   * 这一字段只是把那个判定的结果记下来——place() 是纯函数，不许自己再看图。
   */
  coverArch?: 'left' | 'bottom' | 'rightTop'
  /** 封面压底的透明度（0–1，默认 .78）：图上到处都满时提到 .88，字才压得住 */
  coverScrim?: number
  /**
   * 封面无图时画哪套线稿（TASKS/24 §三）：由学科判定写进来，place() 只读这个字段。
   * 语文画雨丝、数学画方格、英语画四线三格、科学画柱、史地画经纬网——
   * 封面没图也不许一律画成桂花雨。
   */
  motif?: MotifKey
  /**
   * 这一页的文字版式（五个之一，TASKS/12 §三）：无画的页必须挑一个，绝不留白。
   * 有画的页一律 'split'（图与文两栏），版式由插画坐标接管。
   */
  layout?: TextLayout
  /**
   * 仅对比页（TASKS/08 §A.2②）：items[2k] 与 items[2k+1] 是一对（奇数尾巴单独算一对），
   * compareDiff[k] 是第 k 对在网页演示里点开浮出的「哪儿不一样」提示。
   * 每条 ≤12 字（含标点）；不进页面正文渲染、不进 notes、不进 .pptx，只供岔路浮出。
   */
  compareDiff?: string[]
  /** 演讲者备注 = 答案与教学意图只写在这里 */
  notes: string
  /**
   * 这一页放在哪片动态背景上（花瓣 / 雪 / 雨 / 留白）。
   * 由 applySlideScenes() 从教师课件那一叠推导过来：课件哪一页有场景，这里同一位置才有，
   * 推导不出就留空——分不清就不画，绝不为了「动态版」三个字硬塞一片花瓣。
   */
  scene?: SceneSlot
}

/** §三 的页序骨架。close-read 允许 1–3 页，其余每个 kind 一页 */
export const SLIDE_PAGE_ORDER: StudentSlideKind[] = [
  'cover',
  'hook',
  'goals',
  'words',
  'close-read',
  'compare',
  'board',
  'drill',
  'homework',
  'end',
]

/** 页码条 / pptx 左上角分类小字用；属于页面装饰，不计入正文字数（按档取值，见 density.ts） */
export const SLIDE_LABELS: Record<StudentSlideKind, string> = {
  cover: '课题',
  hook: '先看一眼',
  goals: '三件事',
  words: '字词关',
  'close-read': '读这一句',
  quote: '原文',
  compare: '比一比',
  board: '看黑板',
  drill: '练一练',
  homework: '课后',
  end: '一句话',
}

/**
 * 目标页的页名只有一个写法（TASKS/17 §四.2.1）：
 * 课件那一页叫「这一课要带学生弄懂什么」，学生版一律写这一句。
 */
const GOALS_TITLE = '这节课做三件事'

/**
 * 兼容导出：默认档（standard）的上限快照，只供旧 import 点读取展示口径。
 * 逐档取值一律走 density.ts；页数区间是三档并集（10–14），不再钉死单一数字。
 */
export const SLIDE_LIMITS = {
  bodyChars: DEFAULT_LIMITS.bodyChars,
  pagesMin: PAGE_RANGE.min,
  pagesMax: PAGE_RANGE.max,
}

export const SLIDE_FORBIDDEN = [
  '教学目标',
  '教学重难点',
  '教学过程',
  '本环节旨在',
  '核心素养',
  '环节',
  '时长',
  /* TASKS 10 §十三 第 12 件：教案与课堂上的教学动作，一个都不许上台 */
  '引导',
  '预设',
  '布置',
  '板书',
  '说课',
  '本课',
]

/**
 * 第 12 件验的七个词：学生版页面与备注里一个都不许出现。
 * 上屏那半边已经在 SLIDE_FORBIDDEN 里被 findForbidden 拦住；备注是老师要念的话，
 * 以前只算警告，现在同样是硬失败——「嘴上说的」和「屏幕上写的」不能两套标准。
 */
export const TEACHER_WORDS = ['环节', '引导', '预设', '布置', '板书', '说课', '本课'] as const

export const SLIDE_POINTS = { titleMin: 40, bodyMin: 24, wordsMin: 54, coverTitle: 48 }

/* 内部预算：留出台阶，模型给的东西才不会一压就破线 */
const TITLE_MAX = 14
const LINE_MAX = 20
const ITEM_MAX = 12
const WORDS_ITEM_MAX = 6
const HINT_MAX = 12
/* items 数量、精读页数不再写死：按当前档从 density.ts 取（见 PlanBits.limits）。
   ITEM_MAX / WORDS_ITEM_MAX 是「每条字数」预算，与档位无关，保留。 */
/**
 * 课题裁剪上限。老师手输的长课题会被拼进 cover / end 的问句里
 * （「你的“${topic}”是什么？」等），不截断就会把整行顶破当前档的正文上限
 * （按档取值，见 density.ts），而且内置回退同样不合格 → 用户无法自救（任务 #1）。
 * 裁到 12 字后，拼进现成短问句整行仍 ≤20 字，连最紧的 lean 档也稳稳落在线内。
 */
const TOPIC_MAX = 12

/* ------------------------- 原文页（TASKS/19a） ------------------------- */

/** 原文页正文上限：2026-11-22 用户拍板「原文页印整段 ≤120 字」——
 *  一句一行太薄，学生没法指着读一整段；120 字与 QUOTE_PT 第四档（≥81 字）同一个数。 */
export const QUOTE_BODY_MAX = 120
/** 原文页的出处 / 提示上限（与浮出小字同一把尺） */
export const QUOTE_NOTE_MAX = 12
/** 一份课件最多几张原文页：句子再多也只挑 5–8 句（§2.4） */
export const QUOTE_PAGE_MAX = 8
/** 原文页在总页数里至少占的份额（§2.4 / §三.1） */
export const QUOTE_MIN_SHARE = 0.25
/**
 * 字词页词数上限不再写在本文件：见 density.ts 的 WORDS_ITEMS_MAX——物理裁决，
 * 任何档位都锁 ≤4 词（pptx 侧 54pt 每行、不写 normAutofit，5 行已顶到页脚之上，
 * 任务 #4）。rich 的 items ≤6 只作用于非字词页，够不着这里。
 */

/* ------------------- 岔路浮出短文本的硬校验（TASKS/08 §A） ------------------- */

/** 浮出短文本的硬上限：零件 noteShort 与对比 compareDiff 共用，§A.2 定的 ≤12 字（按码点计，含标点） */
export const FLOAT_TEXT_MAX = 12

/** 对比页切成几对：items 两个一行，奇数尾巴单独也算一对（与 show.ts comparePairOf 的行划分同源） */
export function compareRows(itemCount: number): number {
  return Math.ceil(Math.max(0, itemCount) / 2)
}

/** 一条浮出短文本的体检：非空、≤12 字、不踩 §D.2 句式与禁词；返回问题清单，空数组 = 合格 */
export function floatTextProblems(text: unknown): string[] {
  const t = String(text ?? '').trim()
  if (!t) return ['是空串']
  const problems: string[] = []
  const n = [...t].length
  if (n > FLOAT_TEXT_MAX) problems.push(`「${t}」${n} 字，超 ${FLOAT_TEXT_MAX} 字上限`)
  const hits = scanVoice(t).hits
  if (hits.length) problems.push(`「${t}」踩了语气判定：${hits.map((h) => h.label).join('、')}`)
  return problems
}

/** compare 页的 compareDiff 体检：条数必须等于对数，每条过 floatTextProblems；非空 = 该字段应被剥掉 */
export function compareDiffProblems(diff: unknown, itemCount: number): string[] {
  if (!Array.isArray(diff)) return ['没带 compareDiff 或它不是数组']
  const rows = compareRows(itemCount)
  if (rows < 1) return ['对比页没有 items，不成对']
  if (diff.length !== rows) return [`compareDiff 给了 ${diff.length} 条，应有 ${rows} 条（items 两两一对）`]
  const problems: string[] = []
  diff.forEach((d, i) => {
    for (const p of floatTextProblems(d)) problems.push(`第 ${i + 1} 对：${p}`)
  })
  return problems
}

/* ------------------------- 字数与问句 ------------------------- */

const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/
const ALNUM = /[0-9A-Za-z]/

/** 数「看得懂的字」：中日韩汉字 + 字母数字；标点、空白、①②③、全角括号一律不算 */
export function countVisibleChars(text: string): number {
  let n = 0
  for (const ch of String(text ?? '')) {
    if (CJK.test(ch) || ALNUM.test(ch)) n++
  }
  return n
}

/** 这一页给学生读的文字：title 之外的一切（text + line + items）。 */
export function bodyParts(slide: StudentSlide): string[] {
  return [slide.text ?? '', slide.line ?? '', ...(slide.items ?? [])].filter((s) => s.trim().length > 0)
}

/**
 * 正文合计字数（验收第 4 条就用它）。
 * 规则：只算 title 以外的可见文字（line + items），标点与空白不计，①②③ 与（　）不计。
 * imageHint 不计——它是图位占位框里给老师复制去搜图的检索词，课前要换成真图，
 * 不属于「学生抬头读的内容」。但本文件已把它压到 12 字以内，
 * 即使 #10 决定把它印在页面上，也仍然不会破当前档的正文上限（按档取值，见 density.ts）。
 */
export function bodyCharCount(slide: StudentSlide): number {
  return bodyParts(slide).reduce((sum, t) => sum + countVisibleChars(t), 0)
}

/** 页面上出现的全部文字（含 title 与 imageHint），禁词扫描用 */
export function pageVisibleText(slide: StudentSlide): string[] {
  return [slide.title ?? '', ...bodyParts(slide), slide.imageHint ?? '']
}

/** 每页至少一个问句：页面可见文字里必须有 ？ 或 ?（答案只许在 notes 里） */
export function hasQuestion(slide: StudentSlide): boolean {
  return /[？?]/.test([slide.title ?? '', ...bodyParts(slide)].join(' '))
}

/**
 * 这一页有没有「落点」：一句要学生回答的话，或一个学生当场要做的动作。
 *
 * 第七轮之前是「每页一个问句」，到第二十轮发现硬凑：一整节课 27 页，硬凑出 27 个
 * 各不相同的问句，只能靠模板句反复凑数（“这一空，你会填什么？”就是这么来的）。
 * 现在的口径是——每页要么有一句能问出口的话，要么有一个学生真做的动作（读 / 圈 / 写 / 比…）；
 * 两样都占不到的空页，仍然是硬失败。
 */
export function hasAskable(slide: StudentSlide): boolean {
  if (hasQuestion(slide)) return true
  /* 标题也是学生眼睛要落的地方：「闭眼闻一闻」这种动手页，动作就写在标题上 */
  const text = [slide.title ?? '', slide.line ?? '', ...(slide.items ?? [])].join(' ')
  return /读|圈|写|画|标|填|数|比|做|演|背|找|听|看|说|试|闻|闭|换|讨论|交流|打开|翻|举|跟|摸|摆|搭|指|量|拼|剪|折|贴|排|唱|算|练|观察/.test(
    text
  )
}

/**
 * 同一句的去重键：去空白、去标点、去引号。
 * 「这一空，你会填什么？」与「这一空你会填什么」算同一句——它们上屏是一样的。
 */
export function sentenceKey(text: unknown): string {
  return String(text ?? '')
    .replace(/[“”"‘’'（）()【】「」《》〈〉　 ]/g, '')
    .replace(/[，,。.；;：:、！!？?—－\-…·~～]/g, '')
    .trim()
}

/** 页面上一共有哪几句「学生看得到的字」：标题 / 原文 / 正文 / 每一条 items */
export function pageSentences(slide: StudentSlide): string[] {
  return [slide.title ?? '', slide.text ?? '', slide.line ?? '', ...(slide.items ?? [])]
    .map((t) => String(t ?? '').trim())
    .filter((t) => countVisibleChars(t) >= 4)
}

/**
 * 学生页标题里不许出现的「教案环节名」：环节名留在课件，学生只看东西本身。
 * 只判开头那一段（「初读 · 整体感知」），正文里提到「导入」不算。
 */
const STAGE_TITLE = /^(导入|初读|精读|拓展|小结|总结|字词|练习|检测|新授|复习|布置作业)\s*[·•・\-—]/

/**
 * 学生页标题只许两种（TASKS/17 §四.2.4）：**指令**（「圈出这三句里的动词」）
 * 或**结论**（「潮水是从远处一条白线开始的」）。问学生「你觉得呢」属于第三种，一律不行。
 *
 * 这一条与 hasAskable 是一对：「猜谜型标题」与「没有动作的空白页」是同一个毛病。
 */
export const TITLE_GUESS = /哪一件|哪一行|哪一句|哪个字最重要|先做哪|谁最重要|你觉得呢|你想到什么/

/** 目标页三条不许是这种三字空话（§四.3.2）：必须是学生当场能做的动作 + 本课的东西 */
export const EMPTY_TASK = /^(读懂|说出想法|写一段|学习课文|理解内容)$/

/**
 * 「指令」标题里得有一个真动作（§四.3.3 的动词表）。
 * 比任务书那一串（读/圈/写/说/找/画/量/比/填/连/标）多收了一批课堂里同样用得着的：
 * 数/算/做/看/听/练/试/挑/选/排/组/背/搭/摆/摸/剪/折/贴/抄/记/带/讲/问/演/认。
 * 少收一个，像「这节课做三件事」这样的正例就会被自己的门禁判死。
 */
export const TITLE_VERB =
  /读|圈|写|说|找|画|量|比|填|连|标|数|算|做|看|听|练|试|挑|选|排|组|背|搭|摆|摸|剪|折|贴|抄|记|带|讲|问|演|认|改|换|分/

/**
 * drill 页的「填空话术」：句子里指着空说事（填 / 这一空 / 第一空 / 空格），
 * 页面上却一个空都没有（没有（　）、＿、___）——指代是空的。
 */
const BLANK_WORDING = /这一空|第一空|这个空|填空|空格/
const BLANK_MARK = /（\s*　?\s*）|\(\s*\)|＿|___|____/

function blankWordingProblems(slide: StudentSlide): string[] {
  const body = [slide.line ?? '', ...(slide.items ?? [])]
  const wording = body.filter((t) => BLANK_WORDING.test(String(t ?? '')))
  if (wording.length === 0) return []
  const hasBlank =
    body.some((t) => BLANK_MARK.test(String(t ?? ''))) || BLANK_MARK.test(slide.title ?? '')
  if (hasBlank) return []
  return wording.map((t) => String(t))
}

/**
 * 禁词命中。页面文字（title/line/items/imageHint）命中即判不合格；
 * notes 是给老师念的，命中只算警告——见 findNoteWarnings。
 */
export function findForbidden(slide: StudentSlide): string[] {
  return hitWords(pageVisibleText(slide).join(' '))
}

/** notes 里的禁词：警告，不影响 ok（只保留旧口径的教研词，教学动作已升为硬判） */
export function findNoteWarnings(slide: StudentSlide): string[] {
  return hitWords(slide.notes ?? '')
}

/** notes 里的七个教学动作词：硬失败，返回命中词 */
export function findTeacherWords(text: string): string[] {
  const t = String(text ?? '')
  return TEACHER_WORDS.filter((w) => t.includes(w))
}

/** 上屏短句（标题 / 一行字 / 每条）过的三类句式判据：对偶 / 三连 / 动作流水账 */
export function findTaste(slide: StudentSlide): string[] {
  const lines = [slide.title ?? '', slide.line ?? '', ...(slide.items ?? [])].filter(
    (s) => String(s).trim().length > 0
  )
  const out: string[] = []
  for (const line of lines) out.push(...tasteProblems(line))
  return out
}

function hitWords(text: string): string[] {
  const t = String(text ?? '')
  return SLIDE_FORBIDDEN.filter((w) => t.includes(w))
}

export interface SlideValidation {
  ok: boolean
  problems: string[]
  /** notes 里的禁词等不致命的毛病；不影响 ok */
  warnings: string[]
}

/**
 * 整份学生版体检：页数区间（按这一叠自己的档位）、每页正文字数上限、items 数量、每页落点、
 * 禁词零命中、notes 非空、kind 合法，以及第二十轮新增的两条：
 *   ① 同一句不许出现在两页及以上（比的是学生看得到的标题 / 正文 / 条目）；
 *   ② 页面上没有空，就不许用「填 / 这一空」这类指着空说话的字。
 * 默认按三档并集 ENVELOPE 兜底（pptx 导出、离线校验的安全网）；锁档时由调用方传入该档 limits。
 */
export function validateSlides(slides: StudentSlide[], limits: DensityLimits = ENVELOPE): SlideValidation {
  const problems: string[] = []
  const warnings: string[] = []

  if (!Array.isArray(slides) || slides.length === 0) {
    return { ok: false, problems: ['一份页面都没有拿到。'], warnings }
  }
  if (slides.length < limits.pagesMin) {
    problems.push(`只有 ${slides.length} 页，少于 ${limits.pagesMin} 页。`)
  }
  if (slides.length > limits.pagesMax) {
    problems.push(`有 ${slides.length} 页，超过 ${limits.pagesMax} 页。`)
  }

  /** 去重键 → 第一次出现的页码；同一句再出现就在第二页上报错 */
  const seen = new Map<string, number>()

  slides.forEach((s, i) => {
    const at = `第 ${i + 1} 页`
    if (!s || typeof s !== 'object') {
      problems.push(`${at}不是合法页面。`)
      return
    }
    if (!SLIDE_KINDS.includes(s.kind)) problems.push(`${at}的页型「${s.kind}」不认识。`)
    if (!String(s.title ?? '').trim()) problems.push(`${at}没有大标题。`)
    /* 原文页（TASKS/19a）：标题与正文都是那句原文，不审「有没有问句 / 标题像不像指令 /
       像不像老师的语气」——原文一个字都不许改，那几条判据拿它没辙；只审逐字与篇幅。 */
    const isQuote = s.kind === 'quote'
    if (isQuote) {
      const text = String(s.text ?? '').trim()
      if (!text) problems.push(`${at}是原文页，却没有逐字抄下课文那一句（text 为空）。`)
      else {
        if (String(s.title ?? '').trim() !== text)
          problems.push(`${at}原文页的标题与原文不一致：原文页的标题就是那一句。`)
        const n = countVisibleChars(text)
        if (n > QUOTE_BODY_MAX) problems.push(`${at}原文页 ${n} 字，超了 ${QUOTE_BODY_MAX} 字上限。`)
      }
      if ((s.items ?? []).length) problems.push(`${at}原文页带了条目，原文页只放原文与出处。`)
    }
    if (!isQuote && STAGE_TITLE.test(String(s.title ?? '').trim()))
      problems.push(`${at}标题「${String(s.title).slice(0, 12)}」带着教案环节名，环节名留在课件。`)
    if (!isQuote && TITLE_GUESS.test(String(s.title ?? '').trim()))
      problems.push(`${at}标题「${String(s.title).slice(0, 12)}」是让学生猜老师的心思：标题要么一句指令，要么一个结论。`)
    // 破折号一摆就没下文：学生页上只要出现「——」，就是半截话（第二十轮第 5 条）
    const dash = pageSentences(s).filter((t) => t.includes('——'))
    if (dash.length) problems.push(`${at}有半截话带破折号：「${dash[0].slice(0, 16)}」。`)
    const chars = bodyCharCount(s)
    if (!isQuote && chars > limits.bodyChars) problems.push(`${at}正文 ${chars} 字，超了 ${limits.bodyChars} 字上限。`)
    const itemCount = (s.items ?? []).length
    if (s.kind === 'words' && itemCount > WORDS_ITEMS_MAX)
      problems.push(`${at}字词页有 ${itemCount} 个词，超 ${WORDS_ITEMS_MAX} 个上限（任何档位都锁 ≤${WORDS_ITEMS_MAX}）。`)
    if (s.kind !== 'words' && itemCount > limits.itemsMax)
      problems.push(`${at}有 ${itemCount} 条 items，超 ${limits.itemsMax} 条上限。`)
    /* 目标页三条必须是「动词 + 本课的东西」（TASKS/17 §四.2.1）：
       「读懂」「说出想法」「写一段」这类三字空话，投到哪一课都成立，也投到哪一课都没用。 */
    if (s.kind === 'goals') {
      const empty = (s.items ?? []).filter((t) =>
        EMPTY_TASK.test(String(t ?? '').replace(/^[①②③]\s*/, '').trim())
      )
      if (empty.length)
        problems.push(`${at}目标页有 ${empty.length} 条三字空话（「${empty[0]}」）：要写学生当场能做的事。`)
    }
    if (!isQuote && s.kind !== 'cover' && !hasAskable(s))
      problems.push(`${at}既没有一句能问出口的话，也没有学生要做的动作。`)
    const hits = isQuote ? [] : findForbidden(s)
    if (hits.length) problems.push(`${at}页面上出现禁词：${hits.join('、')}。`)
    const taste = isQuote ? [] : findTaste(s)
    if (taste.length) problems.push(`${at}的文案不像老师写的：${taste.join('；')}。`)
    if (!String(s.notes ?? '').trim()) problems.push(`${at}备注是空的，老师不知道该说什么。`)
    const actHits = findTeacherWords(s.notes ?? '')
    if (actHits.length) problems.push(`${at}备注里出现教学动作词：${actHits.join('、')}（备注是念给学生听的，不是教案）。`)
    const noteHits = findNoteWarnings(s)
    if (noteHits.length) warnings.push(`${at}备注里有教研腔用词：${noteHits.join('、')}。`)

    // ① 同一句不许上两页：页内自己先合一遍（标题与正文同字不算跨页）
    const mine = new Set<string>()
    for (const sent of pageSentences(s)) {
      const key = sentenceKey(sent)
      if (!key) continue
      const prev = seen.get(key)
      if (prev !== undefined && prev !== i + 1) {
        problems.push(`${at}与第 ${prev} 页是同一句「${sent.slice(0, 16)}」，一句只能用一次。`)
        continue
      }
      if (!mine.has(key)) {
        mine.add(key)
        if (prev === undefined) seen.set(key, i + 1)
      }
    }

    // ② 页面上没有空，就不许说「填 / 这一空」
    const blanks = isQuote ? [] : blankWordingProblems(s)
    if (blanks.length) problems.push(`${at}页面上没有空，却在说填空：「${blanks[0].slice(0, 16)}」。`)
  })

  return { ok: problems.length === 0, problems, warnings }
}

/**
 * 只有动作、没说对象的标题（TASKS/25）。
 *
 * 这类标题不是学生看的，是老师讲稿里的一截：「再一起看这几个词，放回句子里读」
 * 被切成页之后，就只剩「放回句子里读」——读哪句？页面上找不到。
 * 模型/内置只要交出这种标题，就是没把「材料」搬上屏。
 */
export const BARE_ACTION_TITLE =
  /^(?:放回句子(?:里)?(?:读|念)|读一遍|再读一遍|读一读|齐读|默读|自由朗读|朗读|读出声|再读|圈(?:出)?|画出?|说说|想一想|做动作|闭眼|写一写|抄一抄|背一背|练一练|看(?:一看)?|试一试)$/

/**
 * 正文页太薄（2026-11-22 用户验收「内容太少」）：drill / close-read / hook 除标题外
 * 只有一句短问（<12 字）、一条条目都没有。materialProblems（模型交稿闸）与
 * padPages（补页闸）共用这一把尺——带一条实料（原文 / 填空句）的页不算薄。
 */
export function isThinBody(s: StudentSlide): boolean {
  const kind = s?.kind
  return (
    (kind === 'drill' || kind === 'close-read' || kind === 'hook') &&
    (s.items ?? []).length === 0 &&
    countVisibleChars(String(s.line ?? '')) < 12
  )
}

/* ------------------- 内容下限（2026-11-22 真机 27 页 16 页薄） ------------------- *
 * 用户指着真机稿说「字数太少，不知道在说什么」。旧闸只查「items 空 + 短问」，
 * 模型塞两三个单字条目（抱/摇/喊）就逃闸——屏上 15 字，学生指不到任何材料。
 * 新尺都只进 materialProblems（模型交稿闸 + repair 换页触发），不进
 * validateSlides：后者还被离线门禁用着，口径不能一起动。
 *
 * 校准记录（同日）：第一版曾加「活动页 ≥24 字」的全场下限，拿九篇内置金标准稿
 * 一量全红——好页本来就活在 12–23 字（一年级课明写每页 ≤26 字）。薄不是字数少，
 * 是「没有一条完整材料」：真机坏页（香/雨、抱/摇/喊、（　）再香）全被下面两条
 * 尺接住，精短的好页（3 ＞ 2、4 ○ 2、字词关）一条不伤。字数目标交给提示词。
 * -------------------------------------------------------------------------- */

/** 一条完整材料句的最低字数：「浸」这种单字不是材料，「没有不浸在桂花香里的」才是 */
const MATERIAL_SENT_MIN = 8

/** 单字条目：一个汉字（或带括号注音/序号外壳）——字词页认字可以，活动页不行 */
const SINGLE_CHAR_ITEM = /^[（(【\[]?[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF][）)】\]]?$/

/** 算式条目：「4 ○ 2」「1/2 ○ 1/4」「7 和 9」——数学课的材料就是式子本身，不按字数判 */
const MATH_EXPR_ITEM = /[0-9]\s*(?:[○〇□＞＜＝=><+\-×÷*]|和|比)\s*[0-9]/

/** 公式填空条目：「r²=（　）」「S=π×（　）」——字母公式也是完整材料 */
const FORMULA_ITEM = /[a-zA-Z]²?\s*[=×]/

/** 这一页是不是活动页（封面/原文/收尾/目标/作业/板书之外都要有实料） */
function isActivityKind(kind: StudentSlideKind | undefined): boolean {
  return (
    kind === 'hook' ||
    kind === 'words' ||
    kind === 'close-read' ||
    kind === 'compare' ||
    kind === 'drill'
  )
}

/**
 * 每页都得有一件学生能指着的东西（TASKS/25）。
 *
 * 封面/原文页/收尾页豁免：封面本来就不该有材料，原文页本身就是材料。
 * 其余页面的 line + items 合起来至少得是一句话；标题也不许是光杆动作。
 * 这条只用在模型交稿那道闸上，不塞进 validateSlides —— 后者还被 24 个离线门禁
 * 用在内置稿上，口径不能一起动。
 */
export function materialProblems(slides: StudentSlide[]): string[] {
  const out: string[] = []
  slides.forEach((s, i) => {
    const kind = s?.kind
    if (!s || kind === 'cover' || kind === 'quote' || kind === 'end') return
    const at = `第 ${i + 1} 页`
    const items = s.items ?? []
    const body = [s.line ?? '', ...items].join(' ').trim()
    const title = String(s.title ?? '').trim()
    if (BARE_ACTION_TITLE.test(title))
      out.push(`${at}标题「${title.slice(0, 12)}」只有动作，没说读什么/看哪个`)
    if (countVisibleChars(body) < 4)
      out.push(`${at}没有材料：既没有一句原文，也没有词、空、数字或步骤`)
    /* 2026-11-22 用户验收：「内容太少，肯定不够讲 40 分钟」。真机 24 页里有三页 drill
       只有标题 + 一句短问（items 空），屏上 13–20 字。正文页除标题外至少要有两条上屏
       内容，或一句整话（≥12 字）；达不到判问题页，repairPages 只换那一页。 */
    if (isThinBody(s))
      out.push(`${at}正文页太薄：除标题外只有一句短问，没有可上屏的材料`)
    if (!isActivityKind(kind)) return
    /* 新尺②：单字条目只许上字词页，或该字已锚在同页另一条整句材料里——
       「浸」旁摆着「没有不浸在桂花香里的」，合法；真机「抱/摇/喊」没有整句，照打。 */
    if (kind !== 'words') {
      const anchors = items.filter((t) => countVisibleChars(String(t ?? '')) >= MATERIAL_SENT_MIN)
      const lonely = items.some((t) => {
        const m = SINGLE_CHAR_ITEM.exec(String(t ?? '').trim())
        if (!m) return false
        const ch = m[0].replace(/^[（(【\[]/, '').replace(/[）)】\]]$/, '')
        return !anchors.some((a) => String(a).includes(ch))
      })
      if (lonely)
        out.push(`${at}条目里有单字：单字只能上字词页，活动页要把字放回整句原文里`)
    }
    /* 新尺③：至少一条完整材料。≥8 字的原文/整话、一条算式/公式都算；
       drill 的题干在 items 里（line 只是提示语，不算材料——真机 P21 就是拿一句
       完整提示语配「（　）再香」半句填空逃闸的）；填空常把一句拆两条，合并计字；
       compareDiff 也是上屏内容，一并候选。字词页豁免——词本身就是材料。 */
    if (kind !== 'words') {
      const pool = kind === 'drill' ? items : [s.line ?? '', ...items, ...(s.compareDiff ?? [])]
      const hasMaterial =
        pool.some((t) => countVisibleChars(String(t ?? '')) >= MATERIAL_SENT_MIN) ||
        pool.some((t) => MATH_EXPR_ITEM.test(String(t ?? ''))) ||
        (kind === 'drill' &&
          (countVisibleChars(items.join('')) >= MATERIAL_SENT_MIN ||
            items.some((t) => FORMULA_ITEM.test(String(t ?? '')))))
      if (!hasMaterial)
        out.push(`${at}没有一条完整材料：条目全是碎词短问，至少摆一句 ≥8 字的原文、填空句或算式`)
    }
  })
  return out
}

/* ------------------------- 精简与加固 ------------------------- */

/** 禁词换成学生话；长词优先，免得「环节」先把「本环节旨在」拆残 */
const FORBIDDEN_REPL: Record<string, string> = {
  本环节旨在: '这节课',
  教学重难点: '要读懂的地方',
  教学目标: '要拿走的本领',
  教学过程: '一步一步',
  核心素养: '本领',
  环节: '这一段',
  时长: '',
  引导: '带',
  预设: '',
  布置: '',
  板书: '黑板',
  说课: '',
  本课: '这一课',
}

function scrubForbidden(text: string): string {
  let out = String(text ?? '')
  const keys = Object.keys(FORBIDDEN_REPL).sort((a, b) => b.length - a.length)
  for (const k of keys) out = out.split(k).join(FORBIDDEN_REPL[k])
  // 兜底：替换后仍命中的直接抹掉
  for (const w of hitWords(out)) out = out.split(w).join('')
  /* 半角双引号统一成全角引号：屏幕上「说出"寒"字带来的画面」和全书的引号不是一个
     字形，学生一眼就看出这是拼出来的 */
  let half = false
  out = out.replace(/"/g, () => (half = !half) ? '“' : '”')
  return squeezeHan(out.replace(/[*_`#>|]/g, ' ').replace(/\s{2,}/g, ' ').trim())
}

/**
 * 中文之间的半角空格是模型换行 / 排版留下的，不是句子里真有空儿。
 * 真机跑出来的「哪个词在 写声音？」「两个 人的心思一样吗 ？」投影上就是两个洞。
 * 只收拾半角空格与制表符：全角空格有一个例外（见下一条 LONE_FULL_SPACE）——
 * 夹在字中间孤零零一个的是排版残留，而「（　）」与「五年级　　班」那种填写位一个都不许动。
 *
 * 2026-11-21 第四次真机：真机那两处洞在 `squeezeHan` 之后还在，说明模型写的不是
 * 半角空格，而是 NBSP 一类英文排版空格（`[ \t]` 一条也匹配不到）。这里先把它们
 * 归一成半角空格，再走下面那两条规则。
 */
const EXOTIC_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\uFEFF]/g

/**
 * 单独一个全角空格夹在字中间，是排版残留（「哪个词在　写声音？」）——上屏就是个洞。
 * 三种不动：挨着括号 / 下划线的是填写位（「我一闻到（　）」），两个以上连排的是
 * 老师留的空（「五年级　　班」），首尾的空。
 */
const LONE_FULL_SPACE = /(?<![\s（(【「『＿_　])　(?![\s）)】」』＿_　])/g

function squeezeHan(text: string): string {
  return String(text ?? '')
    .replace(EXOTIC_SPACE, ' ')
    .replace(LONE_FULL_SPACE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/(?<=[\u3400-\u4DBF\u4E00-\u9FFF，。！？；：、（）“”‘’]) /g, '')
    .replace(/ (?=[\u3400-\u4DBF\u4E00-\u9FFF，。！？；：、（）“”‘’])/g, '')
}

function clipChars(text: string, max: number): string {
  const chars = [...String(text ?? '').trim()]
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

/**
 * 只服务老师、不该上屏的东西：时间数字、课本页码、教研名词。
 * 禁词表拦不住的「教案味」靠它拦，命中就整段不上页（notes 不受此限）。
 */
const TEACHER_NOISE =
  /分钟|教案|评委|说课|试讲|学法|教法|落点|意图|旨在|目标|重难点|课件|评分|时间|设计/

function isTeacherNoise(text: string): boolean {
  return TEACHER_NOISE.test(String(text ?? ''))
}

/** 引号里装的是生字表还是句子？带教学动作的一律不是原文 */
const NOT_QUOTE = /生字|词语|会写|认识|理解|掌握|朗读|背诵|目标|环节|时长|小结|作业/

/** 抹掉零散引号（对比页从长句里拆栏时用，免得引号半开半合） */
function unquote(text: string): string {
  return text.replace(/[“”"‘’]/g, '').trim()
}

/**
 * 压短或截断后括号只剩一半时（书名号开了没收），直接把那一段抹掉，
 * 页面上永远不出现半句话。已经配对的（如练一练那三个空格）不动。
 */
function dropDangling(text: string): string {
  let out = String(text ?? '')
  for (const [open, close] of [
    ['《', '》'],
    ['“', '”'],
    ['（', '）'],
    ['【', '】'],
    ['「', '」'],
  ] as [string, string][]) {
    const o = out.split(open).length - 1
    const c = out.split(close).length - 1
    if (o > c) out = out.slice(0, out.lastIndexOf(open))
  }
  return out.replace(/[，、：:；;\s]+$/, '').trim()
}

/**
 * 截断到哪都不许停在半截语上：「在《平行四边形的》里找两」就是掉在了「找两」上。
 * 尾巴上挂着的单字动词、量词、方位词一律擦掉，擦完不够四字就交回调用方自己找短句。
 */
const CUT_TAIL =
  /(?:找|读|看|数|画|圈|写|说|比|试|做|问|听|想|指|标|填|量|算|背|抄|练|里|上|下|中|后|前|的|地|得|和|与|在|把|被|从|向|对|就|先|再|又|个|条|组|遍|来|去|出|两|三|四|五|六|几|一|概括|概)$/

function trimDanglingTitle(text: string): string {
  let out = dropDangling(String(text ?? '').trim())
  for (let i = 0; i < 6; i++) {
    const next = out.replace(CUT_TAIL, '').replace(/[，、：:；;\s]+$/, '').trim()
    if (next === out) break
    out = next
  }
  return out
}

/**
 * 压到 max 字以内——不是切半句：先按标点拆句，取一条能独立站住的短句；
 * 实在一句都拆不出来时才整字截断（宁可丢修饰，也不给半句）。
 * 截断时书名号里那一块整块拿掉：「在《平行四边形的面积》里找两组」压不下时，
 * 留「在《平行四边形」和留「里找两组」一样不能用。
 */
function shortenPhrase(text: string, max: number): string {
  const clean = scrubForbidden(text)
  if (countVisibleChars(clean) <= max) return clean
  const hasHan = /[\u3400-\u4DBF\u4E00-\u9FFF]/
  const clauses = clean
    .split(/[，,；;、：:\s。！？!?]+/)
    .map((c) => c.trim())
    .filter((c) => countVisibleChars(c) >= 3 && hasHan.test(c) && !isTeacherNoise(c))
    .sort((a, b) => countVisibleChars(b) - countVisibleChars(a))
  // 已经按字数从大到小排，第一条装得下的就是信息量最大的那条，不要取最短
  const fit = clauses.find((c) => countVisibleChars(c) <= max)
  if (fit) return fit
  /* 截断点落在书名号里（「在《平行四边形的面积》里…」）：书名号那一截整块拿掉再截，
     否则标题里会留一个《半截书名》。不在书名号里就正常截断 + 擦尾。 */
  const cutIn = /《[^》]*$/.test([...clean].slice(0, max).join(''))
  const raw = cutIn ? clean.replace(/《[^》]*》?/g, '') : clean
  return trimDanglingTitle(clipChars(raw, max))
}

/** 页面问句超 20 字时：能摘出问句就摘问句，否则用这一页型的现成短问句 */
function tightenLine(text: string, kind: StudentSlideKind, bits: PlanBits): string {
  /* 一行只准一句话：「每个词念两遍，再写一遍。《草原》这几个词，你能读准几个？」
     上屏就成了两句叠在一起。问句是这页的主干，前面那截口令留给 notes 去说。 */
  const oneLine = (s: string): string => {
    const ask = /[^。！？；;\n]*[？?]\s*$/.exec(s)
    return ask && countVisibleChars(ask[0]) >= 4 ? ask[0].trim() : s
  }
  const clean = oneLine(scrubForbidden(text))
  /* 封面没有正文就是没有（TASKS/25）：以前这里退回一句现成问句，于是每张封面
     都顶着「这个题目里，你认得哪几个字？」——投影一出来学生先看问题、不看课。 */
  if (kind === 'cover' && (!clean || isTeacherNoise(clean))) return ''
  if (!clean || isTeacherNoise(clean)) return pickQuestion(kind, bits)
  if (countVisibleChars(clean) <= LINE_MAX) return clean
  const question = (clean.match(/[^。！？；;\n]*[？?]/) ?? [''])[0].trim()
  if (question && countVisibleChars(question) <= LINE_MAX) return question
  return pickQuestion(kind, bits)
}

/** 这一页页型的现成短问句（模型漏写问句、或写太长时顶上，保证「每页一个问句」） */
function pickQuestion(kind: StudentSlideKind, bits: PlanBits): string {
  return bits.pack.ask(kind, bits.topic)
}

/* ------------------------- 原文页（TASKS/19a） ------------------------- */

/** 原文页的备注：老师念给学生听的那一句（不含任何教学动作词） */
function quoteNotes(text: string): string {
  const t = String(text ?? '').trim()
  return t
    ? `这一页把这句话原样放在屏幕上：「${t}」先自己读一遍，再说哪个词让你停了一下。`
    : '这一页把课文里的原句原样放在屏幕上，一个字都不改。'
}

/** 一句原文 → 一页原文页：标题与正文都是那句原文，note 是出处（可空） */
function quoteSlideOf(text: string, topic: string, note?: string): StudentSlide {
  const one = String(text ?? '').trim()
  const source = String(note ?? `《${String(topic ?? '').replace(/[《》\s]/g, '')}》`).trim()
  return {
    kind: 'quote',
    title: one,
    text: one,
    ...(source && [...source].length <= QUOTE_NOTE_MAX ? { note: source } : {}),
    notes: quoteNotes(one),
  }
}

/**
 * 原文页的「加固」：一个字都不许改。
 * harden 里的 scrubForbidden / shortenPhrase / ensureQuestion 都会改字，
 * 所以原文页绕开那一整套，只补最低限度的字段（标题、备注、note 上限）。
 */
function hardenQuote(slide: StudentSlide): StudentSlide {
  const text = String(slide.text ?? slide.title ?? '').trim()
  const note = String(slide.note ?? '').trim()
  return {
    kind: 'quote',
    title: text || String(slide.title ?? '').trim(),
    ...(text ? { text } : {}),
    ...(note && [...note].length <= QUOTE_NOTE_MAX ? { note } : {}),
    notes: String(slide.notes ?? '').replace(/\s+/g, ' ').trim() || quoteNotes(text),
  }
}

/**
 * 长原文逐字拆页（用户铁底线：篇幅可变，内容不可丢）。
 *
 * 以前超过 QUOTE_BODY_MAX 的句子整句被滤掉（withQuotes / padPages 的
 * `countVisibleChars(q) <= QUOTE_BODY_MAX`）——老师想讲的那一句就因为长
 * 而不上屏了。现在改成拆：按标点贪心拼接，每块 ≤ max 字，拆完接起来
 * 与原文逐字一致（只允许空白差异，标点一个不动）。
 *
 * 拆点优先级：句末标点（。！？；…）→ 句中标点（，、：）→ 实在没有标点
 * 才按字数硬切（硬切也不改字，只是 page break 落在句中）。
 */
export function chunkQuote(text: string, max: number = QUOTE_BODY_MAX): string[] {
  const one = String(text ?? '').trim()
  if (!one) return []
  if (countVisibleChars(one) <= max) return [one]
  /* 把原文切成「小句 + 尾标点」的序列：标点跟着前一块走，接缝不丢标点 */
  const parts = one.match(/[^，、；：。！？…\n]+[，、；：。！？…\n]?|[，、；：。！？…\n]/g) ?? [one]
  const out: string[] = []
  let buf = ''
  const flush = () => {
    const t = buf.trim()
    if (t) out.push(t)
    buf = ''
  }
  for (const p of parts) {
    if (countVisibleChars(p) > max) {
      /* 一个小句就超 max：先 flush 攒着的，再按字数硬切（逐字，不改一个字） */
      flush()
      const chars = Array.from(p)
      while (chars.length > 0) {
        const take = chars.splice(0, max).join('').trim()
        if (take) out.push(take)
      }
      continue
    }
    if (buf && countVisibleChars(buf + p) > max) flush()
    buf += p
  }
  flush()
  return out.length > 0 ? out : [one]
}

/**
 * 封面的问句挪去导入页：封面版式只画标题 / 副题 / 册次，items 在封面上
 * 以前被静默丢掉（check:integrity 第 5 条抓出来的）。问句本身是教学钩子，
 * 挑到第一张导入页（其次精读页）的 items 里：不改一个字、不改页数。
 * 封面没有正文就是没有（TASKS/25）——那条规矩不变，只是字换了个上屏的地方。
 */
export function moveCoverAsk(slides: StudentSlide[]): StudentSlide[] {
  const at = slides.findIndex(
    (s) => s.kind === 'cover' && (s.items ?? []).some((t) => String(t ?? '').trim())
  )
  if (at < 0) return slides
  const ask = (slides[at].items ?? []).filter((t) => String(t ?? '').trim())
  let host = slides.findIndex((s) => s.kind === 'hook')
  if (host < 0) host = slides.findIndex((s) => s.kind === 'close-read')
  if (host < 0)
    host = slides.findIndex(
      (s, i) => i !== at && !['cover', 'quote', 'words', 'compare', 'end'].includes(s.kind)
    )
  if (host < 0) return slides
  return slides.map((s, i) => {
    if (i === at) return { ...s, items: [] }
    if (i === host) return { ...s, items: [...(s.items ?? []), ...ask] }
    return s
  })
}

/**
 * 一叠页里的超长原文页 → 多张逐字原文页（标题 = 正文 = 那一块，出处跟着每一块）。
 * 短原文页原引用返回（内置数据不被改写的那条规矩不变）。
 * 拆出来的相邻两块不会被 mergeHalfQuotes 并回去：并起来必然超 QUOTE_BODY_MAX。
 */
export function expandQuotePages(slides: StudentSlide[]): StudentSlide[] {
  if (
    !slides.some(
      (s) => s.kind === 'quote' && countVisibleChars(String(s.text ?? s.title ?? '')) > QUOTE_BODY_MAX
    )
  )
    return slides
  return slides.flatMap((s) => {
    if (s.kind !== 'quote') return [s]
    const chunks = chunkQuote(String(s.text ?? s.title ?? ''))
    if (chunks.length <= 1) return [s]
    return chunks.map((c) => ({ ...s, title: c, text: c, notes: quoteNotes(c) }))
  })
}

/**
 * 把相邻的原文页并成整段（≤QUOTE_BODY_MAX）。2026-11-22 用户拍板：原文页印整段。
 *
 * 一条硬闸：并起来的串（去空白后）必须**逐字出现在课文里**才并——模型跳着挑的两句
 * 拼起来不是原文的一段，那种拼法等于编课文，宁可留两张单句页。
 * 接缝不补标点：原文相邻两句本来就带着自己的句号 / 逗号，补一个反而不是逐字。
 */
function mergeQuoteParagraphs(slides: StudentSlide[], raw: string): StudentSlide[] {
  const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '')
  const source = norm(raw)
  if (!source) return slides
  const out: StudentSlide[] = []
  for (const s of slides) {
    const prev = out[out.length - 1]
    if (s.kind === 'quote' && prev?.kind === 'quote') {
      const a = String(prev.text ?? prev.title ?? '')
      const b = String(s.text ?? s.title ?? '')
      const joined = norm(a) + norm(b)
      if (countVisibleChars(joined) <= QUOTE_BODY_MAX && source.includes(joined)) {
        const text = a + b
        out[out.length - 1] = { ...prev, title: text, text, notes: quoteNotes(text) }
        continue
      }
    }
    out.push(s)
  }
  return out
}

/**
 * 硬加固：禁词清掉、超长压短、缺问句补上、正文压进当前档的上限（见 bits.limits）。
 * 已经合规的页面进来是什么出去就是什么（内置数据靠这一点保证不被改写）。
 * 原文页是唯一例外：它的字就是课文，一个字都不许改（TASKS/19a）。
 */
function harden(slide: StudentSlide, bits: PlanBits): StudentSlide {
  if (slide.kind === 'quote') return hardenQuote(slide)
  const kind = SLIDE_KINDS.includes(slide.kind) ? slide.kind : 'close-read'
  const rawNotes = String(slide.notes ?? '').replace(/\s+/g, ' ').trim()
  const out: StudentSlide = {
    kind,
    title: cleanTitle(slide.title, kind, bits),
    notes: rawNotes.length >= 8 ? rawNotes : deriveNotes(kind, bits),
  }

  const line = dropDangling(tightenLine(slide.line ?? '', kind, bits))
  if (line) out.line = line

  const cap = kind === 'words' ? WORDS_ITEM_MAX : ITEM_MAX
  /* 封面只放课题、册次、班级与一句副题（TASKS/25）：模型经常在封面上多给一行条目，
     投影出来就是课题下面挂着一行小字，看着像目录不像封面。 */
  const items = (kind === 'cover' ? [] : (slide.items ?? []))
    .map((t) => dropDangling(shortenPhrase(t, cap)))
    .filter((t) => t.length > 0 && !isTeacherNoise(t))
    .slice(0, kind === 'words' ? WORDS_ITEMS_MAX : bits.limits.itemsMax)
  if (items.length) out.items = items

  const hint = scrubForbidden(slide.imageHint ?? '')
  // 先裁短再 dropDangling：避免把「桂花雨 课文插图（部编版）」截成只剩一只开括号
  if (hint) out.imageHint = dropDangling(clipChars(hint, HINT_MAX))

  // 插画不是文字，harden 不审它；但重建对象时不能把它丢了（再跑一遍 harden 也不该丢图）
  if (typeof slide.illustration === 'string' && slide.illustration.startsWith('data:image/')) {
    out.illustration = slide.illustration
  }

  /* 引文块（pull）：模型自己指的那句「这一页要用的原文」。这里只搬不判——
     逐字校验要拿整篇原文，那是 withPulls 的事（它手上才有 plan.meta.text）。 */
  const pull = String(slide.pull ?? '').replace(/\s+/g, ' ').trim()
  if (pull) out.pull = pull

  ensureQuestion(out, kind, bits)
  fitBudget(out, kind, bits)
  // 对比页的浮出提示（§A.2②）：合格才保留；不合格只剥掉这一个字段
  // （该页对比岔路降级为不可点），页面其余内容照常，不整份退回。
  // 必须在 fitBudget 之后：对数按最终的 items 条数算。
  if (kind === 'compare' && Array.isArray(slide.compareDiff) && slide.compareDiff.length > 0) {
    const diffs = slide.compareDiff.map((d) => String(d ?? '').trim())
    if (compareDiffProblems(diffs, (out.items ?? []).length).length === 0) out.compareDiff = diffs
  }
  return out
}

function cleanTitle(title: string, kind: StudentSlideKind, bits: PlanBits): string {
  const clean = dropDangling(scrubForbidden(title))
  if (!clean) return kind === 'cover' ? clipChars(bits.topic || '今天这节课', TITLE_MAX) : asTask(SLIDE_LABELS[kind], kind)
  return countVisibleChars(clean) > TITLE_MAX ? shortenPhrase(clean, TITLE_MAX) : clean
}

/** 页面上一个问句都没有时，把现成短问句塞进去（先占 line，再退到 items 末行） */
function ensureQuestion(slide: StudentSlide, kind: StudentSlideKind, bits: PlanBits): void {
  /* 封面例外（TASKS/25）：整堂课的门面只放课题、一行教材册次、一行班级与一张图；
     问句留在 notes 里让老师上台念——投影上先抛一个问题，学生会先看问题不看课。 */
  if (kind === 'cover') return
  if (hasQuestion(slide)) return
  const q = pickQuestion(kind, bits)
  // 字词页任何档位都恒 ≤4 词（任务 #3）：缺问句只把短问句并进 line，绝不 push 进词行。
  // 旧写法用 items.slice(-bits.limits.itemsMax)，rich/standard 的 itemsMax=5/6 会把字词页
  // 撑到 5–6 词，撞 validateSlides「字词页 >4 词」→ 整份 LLM 结果白退回内置。这里从源头堵住。
  if (kind === 'words') {
    slide.line = slide.line ? `${slide.line}${q}` : q
    return
  }
  if (!slide.line) {
    slide.line = q
    return
  }
  const items = slide.items ?? []
  items.push(q)
  slide.items = items.slice(-bits.limits.itemsMax)
}

/** 正文超当前档上限（limits.bodyChars，按档取值见 density.ts）时的降级顺序：削最长的条目 → 撤条目 → 换现成短问句 */
function fitBudget(slide: StudentSlide, kind: StudentSlideKind, bits: PlanBits): void {
  let guard = 0
  while (bodyCharCount(slide) > bits.limits.bodyChars && guard++ < 24) {
    const items = slide.items ?? []
    if (items.length > 0) {
      let worst = 0
      items.forEach((it, i) => {
        if (countVisibleChars(it) > countVisibleChars(items[worst])) worst = i
      })
      if (countVisibleChars(items[worst]) > 8) items[worst] = shortenPhrase(items[worst], 8)
      else items.splice(worst, 1)
      slide.items = items.length ? items : undefined
      continue
    }
    if (slide.line && countVisibleChars(slide.line) > LINE_MAX) {
      slide.line = pickQuestion(kind, bits)
      continue
    }
    // 只剩一句短行还是超线（理论上不会到这儿）：换成这一页型的标准短问句
    slide.line = pickQuestion(kind, bits)
    if (!hasQuestion(slide)) break
  }
  // 兜底走完仍超线（长课题、模型硬塞）：先整条撤掉条目，再丢弃仍超标的整行——
  // 宁可这一页只剩标题 + 最短问句，也绝不留一页超标、让用户无从自救（任务 #1）。
  if (bodyCharCount(slide) > bits.limits.bodyChars) {
    slide.items = undefined
    if (slide.line && countVisibleChars(slide.line) > bits.limits.bodyChars) {
      slide.line = undefined
    }
  }
  // 丢弃整行后若没了问句，补一条最短的现成问句，保证「每页一个问句」不塌
  ensureQuestion(slide, kind, bits)
}

/* ------------------------- 从任意教案里取材 ------------------------- */

interface PlanBits {
  topic: string
  grade: string
  subject: string
  /** 学科包：兜底问句、默认目标、有无字词页都按学科走（见 lib/subject.ts） */
  pack: SubjectPack
  /** 教案里写明的数字事实（「6 个面」「12 条棱」），数学 / 科学页的条目从这里取 */
  facts: string[]
  questions: string[]
  quotes: string[]
  words: string[]
  board: string[]
  goals: string[]
  hints: string[]
  hardPoint: string
  must: string
  optional: string
  scripts: string[]
  /** 当前生效的密度上限（由调用方按锁档 / 默认档注入，见 density.ts） */
  limits: DensityLimits
  /** 时长规模（09 §S）：lesson 档不按页型去重、不按页型重排，页序跟着环节走 */
  scale: Scale
}

/**
 * 会拿数字当材料的学科：数学与四门理科。
 * 物理的读数、化学的配比、生物的数量、地理的经纬度都是材料；
 * 语文 / 英语的页面上摆一串数字，学生不知道那是什么。
 */
const NUMERIC_SUBJECTS = new Set<SubjectPack['key']>([
  'math',
  'science',
  'physics',
  'chemistry',
  'biology',
  'geography',
])

function readPlan(plan: LessonPlan, limits: DensityLimits = DEFAULT_LIMITS): PlanBits {
  const safe = (plan ?? ({} as LessonPlan)) as LessonPlan
  const segments = safe.segments ?? []
  const pack = packOf(safe.meta?.subject)
  const texts = [
    safe.objectives?.knowledge ?? '',
    safe.objectives?.process ?? '',
    safe.objectives?.emotion ?? '',
    safe.keyPoint ?? '',
    safe.hardPoint ?? '',
    ...segments.map((s) => s.script ?? ''),
    ...segments.map((s) => s.goal ?? ''),
    ...(safe.speech ?? []).map((s) => s.text ?? ''),
  ].join('\n')

  return {
    // 课题统一裁短：后面无论拼进 cover/end 问句还是当标题，都不会把整行顶破当前档的正文上限
    topic: clipChars(String(safe.meta?.topic ?? '').replace(/[《》\s]/g, ''), TOPIC_MAX),
    grade: safe.meta?.grade ?? '',
    subject: safe.meta?.subject ?? '',
    pack,
    /* 数字事实只从数学 / 科学里挖：语文课「四个字落到课文」也会被量词规则命中，
       挖出来当条目就是「四个字落到课」这种半截话（第二十一轮第 3 条）。 */
    /* 数字事实（「6 个面」「12 条棱」「量出 3 个格」）：数学与理科都要，
       语文 / 英语的页面上不该出现一串数字当材料。 */
    facts: NUMERIC_SUBJECTS.has(pack.key) ? collectFacts(texts) : [],
    questions: segments
      .flatMap((s) => s.pauses ?? [])
      .map((p) => scrubForbidden(String(p.question ?? '')).trim())
      .filter((q) => q.length > 1 && countVisibleChars(q) <= LINE_MAX),
    quotes: collectQuotes(texts),
    words: collectWords(texts, safe),
    board: collectBoard(safe),
    goals: [
      safe.objectives?.knowledge ?? '',
      safe.objectives?.process ?? '',
      safe.objectives?.emotion ?? '',
      safe.keyPoint ?? '',
      safe.hardPoint ?? '',
    ],
    hints: (safe.prep?.courseware ?? [])
      .map((c) => String(c.searchHint ?? c.name ?? '').trim())
      .filter(Boolean),
    hardPoint: safe.hardPoint ?? '',
    must: safe.homework?.must ?? '',
    optional: safe.homework?.optional ?? '',
    scripts: segments.map((s) => String(s.script ?? '').trim()).filter(Boolean),
    limits,
    scale: scaleOf(safe.meta?.duration),
  }
}

/**
 * 引号里的短句：带教学动作的一律不当原文用；真句子（带逗号、够长）排前面。
 * 弯引号成对抽取；直引号在数据文件里常被当成弯引号使用，因此不允许它跨标点配对，
 * 免得把两段引文之间的叙述当成引文。
 */
function collectQuotes(text: string): string[] {
  const found = [
    ...[...text.matchAll(/“([^“”\n]{4,22})”/g)].map((m) => m[1]),
    ...[...text.matchAll(/"([^"\n，。；：、]{4,20})"/g)].map((m) => m[1]),
  ]
    .map((s) => scrubForbidden(s).replace(/[？?]$/, '').trim())
    .filter(
      (s) =>
        countVisibleChars(s) >= 4 &&
        countVisibleChars(s) <= 16 &&
        !NOT_QUOTE.test(s) &&
        !isTeacherNoise(s)
    )
    .sort((a, b) => (/[，。]/.test(b) ? 1 : 0) - (/[，。]/.test(a) ? 1 : 0))
  return [...new Set(found)].slice(0, 6)
}

/** 生字词：引号内、顿号隔开的短词，或检索词里出现的双字词 */
function collectWords(text: string, plan: LessonPlan): string[] {
  const groups = [...text.matchAll(/[“"]([^“”\n"]{1,20})[”"]/g)].flatMap((m) =>
    m[1].split(/[、，,\/\s]+/)
  )
  const cards = (plan?.prep?.physical ?? []).flatMap((p) =>
    String(p.name ?? '').split(/[、，,]/)
  )
  const words = [...groups, ...cards]
    .map((w) => w.trim().replace(/等生字|等字|词语/g, ''))
    .filter((w) => /^[\u3400-\u4DBF\u4E00-\u9FFF]{2,4}$/.test(w) && hitWords(w).length === 0)
  return [...new Set(words)].slice(0, 5)
}

/** 板书：先从书写顺序里摘「A → B → C」这条主线，摘不到就逐条压短 */
function collectBoard(plan: LessonPlan): string[] {
  const order = (plan?.blackboard?.order ?? []).map((o) => String(o ?? ''))
  for (const line of order) {
    const tail = line.split(/[：:]/).pop() ?? ''
    if (/→|—|>/.test(tail)) {
      const chain = tail
        .split(/[→—>、，,]+/)
        .map((c) => unquote(scrubForbidden(c)))
        .filter(
          (c) => countVisibleChars(c) >= 2 && countVisibleChars(c) <= 6 && !isTeacherNoise(c)
        )
      if (chain.length >= 2) return chain.slice(0, 3)
    }
  }
  return order
    .map((o) => unquote(shortenPhrase(o, ITEM_MAX)))
    /* 板书里的「课题居中写在最上方」「右边各用一句话说明」是老师写字的动作，不是黑板上的字 */
    .filter(
      (o) =>
        o &&
        !isTeacherNoise(o) &&
        !/左侧|右侧|左边|右边|上方|下方|居中|写|字号|粉笔|位置|各用|各写|各说|一句话|说明/.test(o)
    )
    .slice(0, 3)
}

/**
 * 教案里写明的数字事实：「6 个面」「12 条棱」「8 个顶点」「3 组」「10 以内」。
 * 数学 / 科学页的条目从这里取——它本来就是老师黑板上写的字，不是我们编的。
 */
const FACT_RE =
  /(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千万两])\s*(?:个|条|种|根|块|组|件|片|道|句|首|面|边|角)\s*[\u4e00-\u9fff]{1,4}/g

function collectFacts(text: string): string[] {
  const out: string[] = []
  /** 量词后面那几个字常常是句子的下一截（「8 个顶点并能理顺」），把连接字擦回去 */
  const CONNECT = /[并和与能可就是要会理的把让对从向在为以及这那都也还又再不没而于的了着地得]/
  const SHAPE = /^(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千万两]+)(?:个|条|种|根|块|组|件|片|道|句|首|面|边|角)[\u4e00-\u9fff]{1,3}$/
  for (const line of String(text ?? '').split(/[。；;\n]/)) {
    for (const m of line.matchAll(FACT_RE)) {
      let s = m[0].replace(/\s+/g, '').trim()
      while (s.length > 3 && CONNECT.test(s[s.length - 1])) s = s.slice(0, -1)
      const n = countVisibleChars(s)
      if (n < 2 || n > 8) continue
      /* 只收「数 + 量词 + 名词」这种真数字：长出一截的就是一句话被切下来的半句 */
      if (!SHAPE.test(s)) continue
      if (isTeacherNoise(s)) continue
      // 「一节课」「两分钟」这类是课时不是知识，不能上页面
      if (/^(?:[一1两2][节个]?课|[0-9一两二三四五六七八九十]+分钟|[0-9]+页)/.test(s)) continue
      // 「三条棱相交的」这种尾巴带虚词的不是一个数，是一句话被量词规则切下 来的半截
      if (/[的了着地得是在和与或就而把被让从向对为以及于叫个底]$/.test(s)) continue
      if (!out.includes(s)) out.push(s)
    }
  }
  return out.slice(0, 12)
}

/**
 * 「这节课做三件事」的三条（TASKS/17 §四.2.1）。
 *
 * 上一版直接拿学科包的三条通用动作（读通课文 / 说出想法 / 写一两句）：投到《观潮》、
 * 《桂花雨》、分数都成立，也都不说这一课要干什么。现在三条从本课素材里出：
 * 原文短句 → 字词 → 板书链条 → 数字事实 → 必做作业 → 难点，
 * 每条都是「动词 + 本课的东西」；一条装不下就整截跳过，绝不往回退到空话。
 */
function goalTasks(bits: PlanBits): string[] {
  const topic = bits.topic || '这一课'
  const out: string[] = []
  const add = (raw: string) => {
    const t = dropDangling(shortenPhrase(raw, ITEM_MAX))
    if (!t || countVisibleChars(t) < 4) return
    if (out.some((x) => sentenceKey(x) === sentenceKey(t))) return
    out.push(t)
  }
  const quote = bits.quotes[0] ?? ''
  const word = bits.words[0] ?? ''
  const chain = bits.board.filter((b) => b.trim().length > 0)
  const fact = bits.facts[0] ?? ''
  const must = clauseOf(bits.must, 6)
  const hard = clauseOf(bits.hardPoint, 8)

  // ① 读、圈：落回本课的原文或字词——这两样学生一低头就能看见
  if (quote) add(`读「${clipChars(quote, 6)}」，圈出关键词`)
  else if (word) add(`读准「${clipChars(word, 4)}」这几个词`)
  else if (fact) add(`读一读 ${clipChars(fact, 6)}`)
  // ② 用本课的结构说一遍：板书链条就是这一课的顺序
  if (chain.length >= 2) add(`用「${clipChars(chain[0], 4)}」到「${clipChars(chain[1], 4)}」说顺序`)
  else if (quote) add(`用「${clipChars(quote, 6)}」说一句话`)
  // ③ 落到今天的作业或难点上
  if (must) add(`把「${must}」做完`)
  else if (hard) add(`说清${hard}`)
  // 补齐：仍然要说本课的东西，不许退回「读懂课文」那种哪一课都能用的话
  if (out.length < 3 && quote) add(`挑「${clipChars(quote, 6)}」说一句为什么`)
  if (out.length < 3 && word) add(`用「${clipChars(word, 4)}」写一句`)
  if (out.length < 3 && fact) add(`数一数 ${clipChars(fact, 6)}`)
  if (out.length < 3) add(`在《${clipChars(topic, 6)}》里找两处证据`)
  if (out.length < 3) add(`说清《${clipChars(topic, 6)}》讲的那件事`)
  return out.slice(0, 3)
}

/**
 * 模板页标题必须是一句指令：裸名词前面补上这一页型要学生做的那个动作
 * （TASKS/17 §四.2.4「每页标题只许指令或结论」）。
 * 只加一个字（看/读/比/试/做/说），不造新内容；已经带动作的原样出去。
 */
const TASK_LEAD: Partial<Record<StudentSlideKind, string>> = {
  hook: '看',
  words: '读',
  'close-read': '读',
  compare: '比',
  board: '看',
  drill: '试',
  homework: '做',
  end: '说',
}

function asTask(title: string, kind: StudentSlideKind): string {
  const lead = TASK_LEAD[kind]
  const t = String(title ?? '').trim()
  if (!lead || !t || TITLE_VERB.test(t)) return t
  /* 一整句话不加动词前缀：老师的句子加一个「读」，就成了「读把母亲那句话单独打在屏幕上」。
     只认「开头就能判死」的几种句式；名词并列（「箩、杭、懂、兰」）照旧要补一个动作。 */
  if (/^(把|被|让|给|从|在|就|先|再|等|然后|同时|最后|如果|当)/.test(t)) return t
  if (/[。！？；]/.test(t)) return t
  return `${lead}${t}`
}

/* ------------------------- 无 Key 的泛化学生版 ------------------------- */

/** §D.1 classroom 的停顿字面量，与四篇内置数据完全一致，泛化模板只用这一个写法 */
const PAUSE = '（停三秒）'

/**
 * 兜底 notes 也天然满足 §D.1 那两条硬判据：一个问句 + 问句后紧跟「（停三秒）」。
 * 问句从教案里捞出来时可能没带问号（pauses 里的原文什么标点都有），这里统一收成一个问句再标停顿。
 */
function askPause(ask: string): string {
  const bare = String(ask ?? '').replace(/\s+/g, '').replace(/[。；，、]+$/, '')
  const one = /[？?]$/.test(bare) ? bare : `${bare}？`
  return `${one}${PAUSE}`
}

/** 把几截内容挤进一行标题：装不下的整截跳过，绝不切半句 */
function joinWithin(list: readonly string[], max: number, sep = '、'): string {
  let out = ''
  for (const raw of list) {
    const t = String(raw ?? '').replace(/^[①②③]\s*/, '').trim()
    if (!t) continue
    const next = out ? `${out}${sep}${t}` : t
    if (countVisibleChars(next) > max) continue
    out = next
  }
  return out
}

/** 「四个词」这种数词，字词页的标题要用 */
const CN_NUM = ['零', '一', '两', '三', '四', '五', '六']

/** 一句话里最像标题的那一截：装不下的整截跳过，绝不把词切一半 */
function clauseOf(text: string, max: number): string {
  const fit = titleFromText(text).find((c) => countVisibleChars(c) <= max)
  return fit ?? ''
}

/**
 * 结构页（封面 / 目标 / 板书 / 作业 / 收尾）也要有内容。
 * 「今天三件事」「看这儿」「最后一句」只是页型名，投给数学老师一看就知道是模板；
 * 所以标题一律从这一页自己的东西里取：三条任务、板书链条、必做那行、难点那句话。
 */
function genericPage(kind: StudentSlideKind, bits: PlanBits, variant = 0): StudentSlide {
  const topic = bits.topic || '这一课'
  const ask = pickQuestion(kind, bits)
  const q = (i: number) => bits.questions[i] ?? bits.questions[0] ?? ask
  const spoken = (tail: string) => `今天我们学《${topic}》。${tail}`
  const tasks = goalTasks(bits)
  const keyClause = titleFromText(bits.goals[3] ?? '')[0]
  const hardClause = titleFromText(bits.hardPoint)[0]
  const boardLine = joinWithin(bits.board, TITLE_MAX, ' → ')
  /* 板书页真正的标题：长到装不下就退到硬点（和「板书那一行」不是同一回事了） */
  const boardTitle = boardLine || keyClause || topic

  switch (kind) {
    case 'cover':
      /* 封面只放课题（TASKS/25）：图、教材册次、班级三样由 withCoverMeta / 插画补，
         问句留给老师上台念，不占这一页。 */
      return {
        kind,
        title: topic,
        notes: spoken(`先看屏幕上这几个字。${askPause(q(0))}先猜一猜，学完 这一页再回来说。`),
      }
    case 'hook':
      return {
        kind,
        title: asTask(
          bits.hints[0]
            ? dropDangling(clipChars(bits.hints[0], TITLE_MAX)) || boardLine || topic
            : boardLine || topic,
          kind
        ),
        line: q(variant),
        ...(bits.hints[0] ? { imageHint: bits.hints[0] } : {}),
        notes: spoken(`（投图）${askPause('你在哪儿见过这样的场面？')}说给旁边的人听。`),
      }
    case 'goals':
      return {
        kind,
        title: GOALS_TITLE,
        items: tasks.map((t, i) => `${'①②③'[i]} ${t}`),
        /* 行尾必须是一句真问句：每页一个问句是硬判据，写成「一件做完，再动下一件」
           会让 ensureQuestion 往三条任务后面再塞两句，目标页变成五行字。 */
        line: q(0),
        notes: spoken(`这节课做三件事：${tasks.join('；')}。一件做完，再动下一件。${askPause(q(0))}`),
      }
    case 'words': {
      /* 字词页只给语文 / 英语：数学、科学没有字词关（页序里那一格已换成精读） */
      const words = bits.words.length >= 3
        ? bits.words.slice(0, 4)
        : [...new Set([topic, ...bits.board])].filter(Boolean).slice(0, 4)
      return {
        kind,
        title: asTask(`${CN_NUM[words.length] ?? words.length}个词`, kind),
        items: words,
        line: ask,
        notes: `跟我读一遍：${words.join('、')}。${askPause(ask)}读不准的那个，先记住它长什么样。`,
      }
    }
    case 'close-read': {
      const quote = bits.quotes[variant] ?? bits.quotes[0]
      const one = q(variant)
      const two = q(variant + 1)
      return {
        kind,
        title: asTask(quote ? shortenPhrase(quote, TITLE_MAX) : keyClause || topic, kind),
        ...(quote ? { line: `“${quote}”` } : { line: one }),
        ...(two && two !== one && two !== quote ? { items: [two] } : {}),
        notes: spoken(`这一页慢一点看。${askPause(quote ? one : two || one)}看不明白就先读一遍，再回来说。`),
      }
    }
    case 'compare': {
      const pair = bits.hardPoint
        .split(/[，,；;。]/)
        .map((c) => unquote(shortenPhrase(c, ITEM_MAX)))
        .filter((c) => countVisibleChars(c) >= 3 && !isTeacherNoise(c))
        .slice(0, 2)
      const items = pair.length === 2 ? pair : bits.facts.slice(0, 2)
      return {
        kind,
        title: asTask(joinWithin(items, TITLE_MAX, ' / ') || hardClause || topic, kind),
        ...(items.length ? { items } : {}),
        line: ask,
        notes: `两边分开看，先看左边，再看右边。${askPause(ask)}先把不一样的那一点找出来，不用急着说对错。`,
      }
    }
    case 'board': {
      const items = bits.board
        .map((w) => bits.facts.find((f) => f.includes(w)))
        .filter((f): f is string => Boolean(f))
      /* 语文没有数字事实，板书链条本身就是那三行字——直接照抄，不硬编 */
      const chain = bits.board
        .map((w) => unquote(shortenPhrase(w, ITEM_MAX)).replace(/\s+/g, ''))
        .filter(Boolean)
      const body = items.length >= 2 ? items : bits.facts.length ? bits.facts.slice(0, 3) : chain.slice(0, 3)
      return {
        kind,
        title: asTask(boardTitle, kind),
        ...(body.length ? { items: body } : {}),
        line: ask,
        notes: `这几行是一路走下来的顺序。${askPause(ask)}前面写的都是为最后这一行铺路，眼睛跟着走一遍。`,
      }
    }
    case 'drill':
      return {
        kind,
        title: asTask(hardClause || keyClause || topic, kind),
        // 页面上没有空，就不写「填」：写的是学生当下要做的两件事（任务 #3）
        // 两件都必须是学生一个人能立刻做的动作（TASKS/19a §2.4 第三条：不出现同桌 / 全班）
        items: ['① 自己先试一遍', '② 做完从头再查一遍'],
        ...(bits.questions[variant] ? { line: bits.questions[variant] } : {}),
        notes: `先自己试，试到哪一步算哪一步。${askPause(ask)}卡住就回上一页再看一遍，别急着举手问。`,
      }
    case 'homework': {
      const mustLine = clauseOf(bits.must, TITLE_MAX)
      const optLine = clauseOf(bits.optional, TITLE_MAX)
      /* 标题就是必做那一件；条目前缀「必做｜ / 选做｜」吃 3 个字，内容只许 9 个字——
         装不下就整截跳过，绝不把一句话截到一半（第二十一轮第 2 条）。 */
      const mustItem = clauseOf(bits.must, 9)
      const optItem = clauseOf(bits.optional, 9)
      const items = [
        mustItem ? `必做｜${mustItem}` : '',
        optItem && optItem !== mustItem ? `选做｜${optItem}` : '',
      ].filter(Boolean)
      return {
        kind,
        title: asTask(mustLine || optLine || topic, kind),
        ...(items.length ? { items } : {}),
        line: ask,
        notes: `必做那条三分钟能做完：${bits.must || '课本上这一节'}。选做不用长，${bits.optional || '自己再试一次'}。${askPause(ask)}下节课我们先看这一件。`,
      }
    }
    /* 原文页不从模板里造：没有原文就不该走到这里。真被点到就用这一课已有的引句，
       一句都没拿到就退回课题——绝不编一句假原文。 */
    case 'quote': {
      const one = bits.quotes[variant] ?? bits.quotes[0]
      return one
        ? quoteSlideOf(one, topic)
        : { kind, title: topic, notes: quoteNotes('') }
    }
    case 'end': {
      /* 收束页的标题不能和前面撞车（「相对的面完全相同」在板书写一次就够，
         也不能退回课题——封面已经叫这个名字了）：撞了就按学科说这一课带走什么 */
      const taken = new Set([boardTitle, topic])
      const closing =
        [hardClause, keyClause].find((t) => t && !taken.has(t)) || bits.pack.closing(topic)
      return {
        kind,
        title: asTask(closing, kind),
        line: ask,
        notes: spoken(`下课之前把这一页记住，明天来的时候告诉我你的答案。${askPause(ask)}`),
      }
    }
  }
}

/**
 * 这一科的页序：数学 / 科学没有「字词关」，那一格换成多一页精读，页数不变。
 * 页数一改会连锁踩到档位区间（clip 10–14），所以不是删一页，是换一页。
 */
function pageOrderOf(bits: PlanBits): StudentSlideKind[] {
  if (bits.pack.hasWords) return SLIDE_PAGE_ORDER
  return SLIDE_PAGE_ORDER.map((k) => (k === 'words' ? 'close-read' : k))
}

/** 老师手输课题、又没有 Key：从任意教案拼出一份合规学生版（默认按 standard 档，对 lean 手写数据幂等） */
export function genericSlides(plan: LessonPlan, limits: DensityLimits = DEFAULT_LIMITS): StudentSlide[] {
  const bits = readPlan(plan, limits)
  const order = pageOrderOf(bits)
  return dedupePages(
    order.map((kind, i) => harden(genericPage(kind, bits, order.slice(0, i).filter((k) => k === kind).length), bits)),
    bits
  )
}

/* ------------------------- 40 分钟整节课：按环节铺页面 ------------------------- */

/**
 * 第二十轮重写。上一版每段三页的标题直接写环节名（「导入 · 闻香入境」「初读 · 整体感知」），
 * 学生看到「初读 · 整体感知」什么也得不到；drill 页靠「这一空，你会填什么？」凑问句，
 * 页面上却一个空都没有，同一句在第 6 / 9 / 12 页各出现一次。
 *
 * 现在三条硬规矩（都由 validateSlides 兜底）：
 *   ① 标题只写学生此刻要看的东西本身，环节名一个字都不上学生页；
 *   ② 一整份里一句话只用一次——所以先建「句子账本」，谁先占谁用；
 *   ③ 页面上没有空，就不说「填 / 这一空」：练的那一页写学生要做的动作。
 */

/**
 * 账本只认「句子」：可见字 ≥4，与 pageSentences / validateSlides 同一条门槛。
 * 三字以内是词不是句——「爱桂花」「念桂花」这种板书短词在两个环节各出现一次是正常的，
 * 拿它当撞句换掉，黑板那一行就变成了「爱桂花 / 你闻到过这个味儿吗？ / 念桂花」。
 */
function isSentence(text: unknown): boolean {
  return countVisibleChars(String(text ?? '')) >= 4
}

/** 一句话的账本：整份学生版里同一句只许上一次台 */
interface SentenceBook {
  has: (text: string | undefined) => boolean
  /** 占下这一句；已经被用过就返回 false */
  take: (text: string | undefined) => boolean
}

function sentenceBook(): SentenceBook {
  const used = new Set<string>()
  return {
    has: (text) => {
      const key = sentenceKey(text)
      return key.length > 0 && used.has(key)
    },
    take: (text) => {
      const key = sentenceKey(text)
      if (!key) return false
      if (used.has(key)) return false
      used.add(key)
      return true
    },
  }
}

/** 按顺序取第一条还没被占的候选；取到就占下 */
function takeFirst(book: SentenceBook, candidates: readonly string[], min = 4): string | undefined {
  for (const c of candidates) {
    const s = String(c ?? '').trim()
    if (countVisibleChars(s) < min) continue
    if (book.has(s)) continue
    if (book.take(s)) return s
  }
  return undefined
}

/** 把一整页上过的字记进账本（首尾页先生成，正文页得让着它们） */
function absorb(book: SentenceBook, slide: StudentSlide): void {
  for (const t of [slide.title, slide.line, ...(slide.items ?? [])]) book.take(t)
}

/**
 * 同一份里一句话只许上一次台（第二十轮第 3 / 4 条）。
 * 写完之后再过一道：撞句的页按顺序换一句还没用过的问话（取自教案里真实存在的问句），
 * 问话池也空了，就退回「页型名 + 页号」这种可辨认的页签，绝不再造一句新话往课件里塞。
 */
function dedupePages(slides: StudentSlide[], bits: PlanBits): StudentSlide[] {
  if (slides.length === 0) return slides
  const book = sentenceBook()
  const pool: string[] = []
  const push = (q?: string) => {
    // 教案里给的原话也过一道：模型会在中文之间夹半角空格，上屏就是一个洞
    const s = squeezeHan(String(q ?? '').trim())
    if (countVisibleChars(s) < 4) return
    if (pool.some((p) => sentenceKey(p) === sentenceKey(s))) return
    pool.push(s)
  }
  bits.questions.forEach(push)
  SLIDE_PAGE_ORDER.forEach((k) => push(pickQuestion(k, bits)))

  /** 最后一级：页签（页名 + 页号）。只在正文与条目都用尽时才落到这里。
   * 以前是「动作词 + 页名 + 页号」直接粘在一起，「读」+「读这一句」+「5」=「读读这一句5」，
   * 编号也紧贴着汉字。现在是页名先补上动作（「一句话」→「说一句话」），
   * 重复时再用括号加页码——页名不带动作的话，门禁的「只写动作不带对象」一条会当场判错。 */
  const pageTag = (kind: StudentSlideKind, at: number): string => {
    const base = asTask(SLIDE_LABELS[kind], kind)
    for (const out of [base, `${base}（第 ${at + 1} 页）`]) {
      if (!book.has(out)) {
        book.take(out)
        return out
      }
    }
    return base
  }
  /** 正文/条目撞句：先在本页型、本学科的问句池里找，最后才算全课问句 */
  const freshAsk = (kind: StudentSlideKind, at: number): string => {
    for (const q of bits.pack.pool(kind, bits.topic)) if (!book.has(q) && book.take(q)) return squeezeHan(q)
    for (const q of pool) if (!book.has(q) && book.take(q)) return q
    return pageTag(kind, at)
  }

  /* 不是句子的短词既不去重、也不记账：它本来就不会被 validateSlides 判成撞句 */
  const keep = (text: string | undefined): boolean => !isSentence(text) || book.take(text)
  return slides.map((s, i) => {
    /* 原文页一个字都不改：不换句、不补条目，只把这两句记进账本 */
    if (s.kind === 'quote') {
      book.take(s.title)
      book.take(s.text)
      return s
    }
    const out: StudentSlide = { ...s }
    /* 标题撞句不能拿问句顶上（标题不许是问句，也不许和正文指向两件事），
       所以标题只退到页签，正文与条目才退到问句。 */
    if (!keep(out.title)) out.title = pageTag(out.kind, i)
    if (out.line && !keep(out.line)) out.line = freshAsk(out.kind, i)
    if (out.items?.length) {
      out.items = out.items.map((it) => (keep(it) ? it : freshAsk(out.kind, i)))
    }
    // 最后一手：去重之后仍可能剩一页「既没问句、也没动作」（原文页没排到问句）——
    // 补一句本轮还没上过台的问句到条目里，宁可多一行字，不留一页无话可说。
    // 只在整页一个字都没有时才补：页上已经有原文/词/数据，就不许再塞一句通用问句，
    // 否则会出现「正文是原文、条目问的却是另一件事」这种两套话同页的怪相。
    if (!hasAskable(out) && countVisibleChars([out.title, out.line, ...(out.items ?? [])].join('')) < 4) {
      const q = freshAsk(out.kind, i)
      const ask = /[？?]$/.test(q) ? q : `${q}？`
      out.items = [...(out.items ?? []), ask].slice(0, 2)
    }
    return out
  })
}

/** 课堂口令的开头：这类句子是老师对学生说的动作，不是学生要看的东西 */
const INSTRUCTION_LEAD =
  /^(请|停|看|听|读|说|写|圈|画|填|标|数|做|问|答|想|闭|打开|拿出|翻|举|跟|带|给|让|把|用|从|向|一起|再|先|然后|接着|下面|现在|今天|我们|你们|大家|同学们|好|对|出示|投影|巡视|上课)/

/** 教案里打转的词：带上它们就不是「东西本身」了 */
const META_TALK = /这一段|这句话|这一句|这个词|这几个|刚才|接下来|请看|我们看|告诉我/

/** 一截只能当碎片用的句子（「箩筐的箩」「太高兴了」这种） */
function isFragment(s: string): boolean {
  /* 「的」收尾是半句；但「的点」「的话」不是——
     「三条棱相交的点」正是学生要看的那个东西，不能因为末尾一个「的点」被判成碎片。 */
  return countVisibleChars(s) < 3 || /^[的了着地得]/.test(s) || /的$/.test(s) || /[了着]$/.test(s)
}

/** 一句原文里能直接当标题的那一截（≥4 字、≤14 字、不是口令） */
function quoteTitles(quote: string): string[] {
  return String(quote ?? '')
    .split(/[，,：:；;、！!？?]/)
    .map((s) => s.trim())
    .filter((s) => {
      const n = countVisibleChars(s)
      return (
        n >= 4 &&
        n <= TITLE_MAX &&
        !isFragment(s) &&
        !isTeacherNoise(s) &&
        !INSTRUCTION_LEAD.test(s) &&
        /* 引文切出来的那一截也不许是半句：「还多一个」「也比不上家乡院子里的桂花。」 */
        !CLAUSE_LEAD.test(s) &&
        !LEFTOVER_LEAD.test(s) &&
        !HANG_TAIL.test(s) &&
        !ORG_TALK.test(s) &&
        !PAGE_LABEL_TITLE.test(s)
      )
    })
    .sort((a, b) => countVisibleChars(b) - countVisibleChars(a))
}

/* ---------- 一页一件事：把这一段拆成「陈述」与「问句」两种节拍 ---------- */

/**
 * 第二十一轮第 3 条：标题 / 正文 / 条目三句必须指向同一个点。
 * 做法不是拼接着写，而是先把讲稿拆成节拍——一句陈述（定义、现象、结论）配后面那一问，
 * 两者共用一个实词就是同一件事，配成同一页；配不上的问句单独成页，标题从问句里取。
 * 这样「标题说面、正文问棱」在结构上就不可能发生。
 */
interface Beat {
  kind: 'ask' | 'def'
  text: string
  /** 在讲稿里的字符位置；pauses 里的问句排在讲稿之后（它们是课后补的追问） */
  at: number
}

/** 不算「同一个话题」的虚字：共用一个「的」不算在说同一件事 */
const TOPIC_STOP = new Set(
  '的了着地得是在和与或就而把被让从向对为以及于个这那你我他她它它们谁什么几多少不一没很都也还又才只请我们大家您吗呢吧啊呀哦嗯给向往把好再先'.split(
    ''
  )
)

/** 一句话里能当话题的实词字（去虚字、去标点） */
function topicChars(text: string): Set<string> {
  const out = new Set<string>()
  for (const ch of String(text ?? '')) {
    if (/[\u4e00-\u9fff]/.test(ch) && !TOPIC_STOP.has(ch)) out.add(ch)
  }
  return out
}

/** 两句共用了几个实词字：0 就是两件事 */
function topicShare(a: string, b: string): number {
  const A = topicChars(a)
  const B = topicChars(b)
  let n = 0
  for (const ch of A) if (B.has(ch)) n++
  return n
}

/** 「一样」「不同」「多少」这类是比法，不是话题：只共用一个这样的字不算同一件事 */
const WEAK_CHARS = new Set('样同异差多少好大小太更最对真假'.split(''))

/** 去掉弱共字之后还剩几个实词字 */
function strongShare(a: string, b: string): number {
  const A = topicChars(a)
  const B = topicChars(b)
  let n = 0
  for (const ch of A) if (!WEAK_CHARS.has(ch) && B.has(ch)) n++
  return n
}

/**
 * 这一段的节拍：陈述与问句各按在讲稿里的先后排队。
 * 过滤沿用原来的两条：老师口令、半截话、带教案动作的引文都不上台。
 */
function segmentBeats(seg: Segment): Beat[] {
  const beats: Beat[] = []
  const seen = new Set<string>()
  const push = (kind: 'ask' | 'def', raw: string, at: number): void => {
    let s = scrubForbidden(String(raw ?? '').replace(/\s+/g, '')).trim()
    if (kind === 'ask') {
      const cut = s.search(/[？?]/)
      if (cut < 0) return
      s = s.slice(0, cut + 1)
      // 半开的引号（「问一句：“……」」）只留引号里面那一句；只在冒号后面才剥
      const open = Math.max(s.lastIndexOf('“'), s.lastIndexOf('"'))
      if (open > 0 && /[：:]/.test(s[open - 1])) s = s.slice(open + 1)
    }
    s = s.replace(/^[：:，,、—－\-\s"“]+/, '').replace(/[。；;，,"”]+$/, '').trim()
    /* 引号不成对的（「万水千山只等闲”，哪两个字要重？」）就是切掉了半边，
       把剩下的引号一起擦掉，不让学生页上出现孤零零一个”。 */
    const oc = (s.match(/“/g) ?? []).length
    const cc = (s.match(/”/g) ?? []).length
    if (oc !== cc) s = s.replace(/[“”]/g, '')
    if (((s.match(/"/g) ?? []).length) % 2 === 1) s = s.replace(/"/g, '')
    /** 「3 只小猴，4 个桃子」：一口气报了两个数，分开就都不是这一页要说的事。
     *  但破折号删了就没了的事（「看大屏幕——3 只小猴」）不再整句丢掉，前一段照常算陈述。 */
    const n = countVisibleChars(s)
    /* 问句要当正文上一屏，超过 LINE_MAX 就没法读；陈述句只是标题的来处，
       标题最多 14 字，所以长一点的陈述照样收——一长句往往能拆出两页。 */
    if (n < 4 || n > (kind === 'ask' ? LINE_MAX : LINE_MAX + 15)) return
    if (isTeacherNoise(s)) return
    /* 口令开头不能当标题，但当正文完全没问题：「现在一起数：…几个面？」是学生要 答的那一问，
       只有陈述句（或要拿去当标题的那一截）才拦。 */
    if (kind === 'def' && INSTRUCTION_LEAD.test(s)) return
    if (kind === 'def' && /[把将的了是着和与]$/.test(s)) return
    if (/读准|范读|标出|圈出|画出|写出|默写|背诵|抄写|组词|造句|填空|回答/.test(s)) return
    const key = sentenceKey(s)
    if (!key || seen.has(key)) return
    seen.add(key)
    beats.push({ kind, text: s, at })
  }
  // pauses 里的问句先算「段末」：它们本来就没有在讲稿里排位置，配前面的定 义句正好
  ;(seg.pauses ?? []).forEach((p, i) => push('ask', String(p.question ?? ''), 1_000_000 + i))
  for (const m of String(seg.script ?? '').matchAll(/[^。！？!?\n]+[。！？!?]?/g)) {
    const raw = m[0]
    const at = m.index ?? 0
    /* 「看大屏幕——3 只小猴，4 个桃子」：破折号后面那半句才是学生要看的东西。
       整句带着破折号上不了屏，但把它拆成两截，「3 只小猴，4 个桃子」就站得住了。 */
    const parts = raw.split(/——+/)
    parts.forEach((part, k) => {
      const piece = String(part ?? '').trim()
      if (!piece) return
      push(/[？?]/.test(piece) ? 'ask' : 'def', piece, at + k * 0.001)
    })
  }
  return beats
}

/** 陈述句当标题：整句照搬（含一个逗号也算完整的一句话），不切半句；
 *  整句太长就只取前一个分句——那一截仍然是个完整的名词短语。 */
function defTitle(text: string): string | undefined {
  /* 「记住：开口朝大数，尖尖朝小数」：开头的「记住」是老师提醒，不是标题的一部分 */
  const s = tidyTitle(text).replace(/^(?:记住|注意|想一想|看)[：:，,]?/, '')
  const n = countVisibleChars(s)
  if (n < 3) return undefined
  const ok = (t: string): boolean => {
    if (/——|—|[？?！!]/.test(t)) return false
    if (isFragment(t) || isTeacherNoise(t)) return false
    if (ORG_TALK.test(t)) return false
    if (DANGLING_TAIL.test(t) || HANG_TAIL.test(t)) return false
    if (LEFTOVER_LEAD.test(t)) return false
    if (META_TALK.test(t)) return false
    if (/[：:]/.test(t)) return false
    if (/你|我|咱/.test(t)) return false
    const open = (t.match(/“/g) ?? []).length
    const close = (t.match(/”/g) ?? []).length
    if (open !== close) return false
    return (t.match(/[\u4e00-\u9fff]/g) ?? []).length >= 3
  }
  if (n <= TITLE_MAX && ok(s)) return s
  return titleFromText(s)[0]
}

/** 问的是「这东西叫什么」：答案就在陈述句里，交给 titleFromAsk 自己取名，不去配定义 */
const NAME_ASK = /叫什么|叫做什么|叫什么名字|什么叫/

/** 问句里的数字全在陈述句里：两句说的是同一批数（「6、12、8 各是什么？」） */
function digitMatch(a: string, b: string): boolean {
  const da: string[] = a.match(/[0-9]+/g) ?? []
  if (!da.length) return false
  const db: string[] = b.match(/[0-9]+/g) ?? []
  return da.every((n) => db.includes(n))
}

/** 定义句给出的那个名字：「平平的这一块，叫面」→ 面 */
function defName(text: string): string {
  const m = String(text ?? '').match(/(?:叫做|叫|称为|就是|是)([^，,。；;？?\s]{1,6})$/)
  return m ? m[1] : ''
}

/** 问句问的那个东西：「几个面？」→ 面；「12 条棱能分成几组？」→ 棱 */
function askObject(text: string): string {
  const s = String(text ?? '')
  const a = s.match(/(?:几|多少|哪几)(?:个|条|块|种|根|组)([\u4e00-\u9fff]{1,4})/)
  if (a) return a[1]
  const b = s.match(/[0-9]+\s*(?:条|个|块|种|根)([\u4e00-\u9fff]{1,4})/)
  return b ? b[1] : ''
}

/**
 * 一句话反着问出来的问题：「A，由 B 决定」→「A 由什么决定？」。
 * 只在这一段真问句都用尽、还差一页时用：问的是这句话里被收起来的那一截，
 * 标题、正文、答案仍指向同一件事，不是另起一个话题。
 */
function askFromDef(text: string): string | undefined {
  const s = String(text ?? '').replace(/[。；;，,]+$/, '').trim()
  if (countVisibleChars(s) < 4) return undefined
  if (/^(?:可以|能|要|会|就|都|也|这|那)/.test(s)) return undefined
  let m = s.match(/^(.{2,16}?)[，,]?\s*(?:由|靠|凭)([^，,。]{2,10}?)(?:决定|来定)$/)
  if (m) return `${m[1]}由什么决定？`
  /* 「12 条棱能分成 3 组」→「12 条棱能分成几组？」：数字反着问成几 */
  m = s.match(/^(.{2,14}?)(?:能|可以|要)?(?:分成|分为|有|剩下?)([0-9一二三四五六七八九十]+)([个条组种块面段只根扇句])$/)
  if (m) return `${m[1]}几${m[3]}？`
  m = s.match(/^([\u4e00-\u9fff、，,]{2,12}?)(?:，|,)?(?:就是|是)([\u4e00-\u9fff]{2,8})$/)
  if (m) return `${m[1]}是什么？`
  /* 「走了两年」→「走了几年？」「翻过最后一座雪山」→「翻过几座雪山？」：
     陈述里点了数的，就把那个数收起来问——问的还是同一件事。 */
  m = s.match(/^(.{2,12}?)([一二三四五六七八九十百千万0-9]+)([个条种块面组根段句座年岁层遍次天只位步])/)
  if (m) return `${m[1]}几${m[3]}？`
  return undefined
}

/**
 * 给这一问配一句它能落脚的陈述：先找共用实词的那句（越近越好，带「叫 / 就是」的优先），
 * 一个共用的都没有，才退到紧挨着它的上一句——上一句是这一问的来处，至少不会是别的话题。
 */
function pickDef(beats: Beat[], ask: Beat, used: Set<number>): { text: string; i: number } | undefined {
  if (NAME_ASK.test(ask.text)) return undefined
  const want = askObject(ask.text)
  /* 这一问点了名（「再看面」里的「面」是本段定义过的名字），就只配说这个名字的那句；
     否则「可以分成三组…」会靠一个「样」字抢走本该属于「叫面」那一句的位置。 */
  const names = new Set<string>()
  beats.forEach((b) => {
    if (b.kind !== 'def') return
    const n = defName(b.text)
    if (n) names.add(n)
  })
  const asked = [...names].filter((n) => ask.text.includes(n))
  let nearestIdx = -1
  beats.forEach((b, i) => {
    if (b.kind !== 'def' || b.at >= ask.at) return
    if (nearestIdx < 0 || b.at > beats[nearestIdx].at) nearestIdx = i
  })
  let best: { text: string; i: number; score: number } | undefined
  beats.forEach((b, i) => {
    if (b.kind !== 'def' || used.has(i) || b.at >= ask.at) return
    if (asked.length && !asked.includes(defName(b.text))) return
    const share = topicShare(b.text, ask.text)
    const strong = strongShare(b.text, ask.text)
    const num = digitMatch(ask.text, b.text) ? 1 : 0
    /* 只共用一个「样」不算同一件事；只有紧挨着这一问的那句，才允许靠弱共字配上 */
    if (!strong && !num && i !== nearestIdx) return
    /* 「几个面？」只配「叫面」那句：名字对上，才算是同一件事 */
    const hit = want && defName(b.text) && defName(b.text) === want ? 1 : 0
    const named = /叫|就是|称为|叫做|是/.test(b.text) ? 1 : 0
    const score = hit * 3000 + named * 1000 + num * 500 + strong * 200 + share * 50 - (ask.at - b.at) / 1e6
    if (!best || score > best.score) best = { text: b.text, i, score }
  })
  if (best) return { text: best.text, i: best.i }
  /* 一个共用的实词都找不到，就不配了：宁可这一页不出，也不让标题说面、正文问棱。
     标题退回 titleFromAsk 从问句自己身上取。 */
  return undefined
}

/* 这一段里引号包着的原文（4–20 字），按出现顺序 */
function segmentQuotes(seg: Segment): string[] {
  const text = [seg.script, seg.teacher, seg.student].join(' ')
  const out: string[] = []
  for (const m of String(text ?? '').matchAll(/[“"]([^“”"\n]{4,24})[”"]/g)) {
    const s = scrubForbidden(m[1]).replace(/[”"]+$/, '').trim()
    const n = countVisibleChars(s)
    if (n < 4 || n > LINE_MAX) continue
    if (isTeacherNoise(s) || /[？?]/.test(s)) continue
    if (/——|—/.test(s)) continue
    /* 老师口令不是课文原文：「请大家自己读两遍，把」上了台就是一句半截话 */
    if (INSTRUCTION_LEAD.test(s) || /[把将的了是着和与]$/.test(s)) continue
    /* 引文里带「范读」「标出」「圈出」的，是教案上的动作，不是课文 */
    if (/读准|范读|标出|圈出|画出|写出|默写|背诵|抄写|组词|造句|填空|回答/.test(s)) continue
    /* 「逶迤（wēi yí）」是注音，不是原文：砍掉括号里的注音还有四个汉字才算一句 */
    if (!/[\u4e00-\u9fff]{4,}/.test(s.replace(/[（(][^）)]*[）)]/g, ''))) continue
    if (out.some((q) => sentenceKey(q) === sentenceKey(s))) continue
    out.push(s)
  }
  return out
}

/** 这一段能问出口的问句：先 pauses 里写好的，再从讲稿里摘 */
function segmentQuestions(seg: Segment): string[] {
  const out: string[] = []
  const push = (raw: string) => {
    let s = scrubForbidden(String(raw ?? '').replace(/\s+/g, '')).trim()
    const cut = s.search(/[？?]/)
    if (cut < 0) return
    s = s.slice(0, cut + 1)
    // 半开的引号（「问一句：“……」」）只留引号里面那一句。
    // 只在冒号后面才剥：句子中间的「注意这个“喊”字，为什么要喊？」不是引用，剥了就剩残句。
    const open = Math.max(s.lastIndexOf('“'), s.lastIndexOf('"'))
    if (open > 0 && /[：:]/.test(s[open - 1])) s = s.slice(open + 1)
    s = s.replace(/^[：:，,、]+/, '').replace(/[。；;]+$/, '').trim()
    const n = countVisibleChars(s)
    if (n < 4 || n > LINE_MAX) return
    if (isTeacherNoise(s)) return
    if (out.some((q) => sentenceKey(q) === sentenceKey(s))) return
    out.push(s)
  }
  for (const p of seg.pauses ?? []) push(String(p.question ?? ''))
  for (const field of [seg.script, seg.teacher, seg.student]) {
    for (const m of String(field ?? '').matchAll(/[^。！；;\n]*[？?]/g)) push(m[0])
  }
  return out
}

const ACTION_HINT =
  /读|圈|写|画|标|填|数|比|做|演|背|找|听|看|说|试|闻|闭|讨论|交流|摸|摆|搭|指|量|观察|拼|剪|折|贴|排|唱|算|练/

/* 动作必须从动词起头：「梨比猴子少1个」是上一句的答案尾巴，不是学生要干的 事 */
const ACT_LEAD =
  /^(在|将|把|用|拿|按|边|齐|读|朗读|齐读|自由|默读|圈|划|画|写|抄|填|标|数|量|比|摆|搭|拼|剪|折|做|演|背|找|听|看|观察|说|讲|试|摸|闻|闭|换|讨论|交流|打开|翻|举|跟|指出|记录|整理|完成|上台|书空)/
/** 老师手上的动作不是学生要干的事 */
const TEACHER_GESTURE = /出示|引导|追问|板书|讲解|提问|巡视|评价|范读|课件|投影/

/**
 * 学生在这一段要做的动作（≤12 字，只整截取，不截半句）。
 * student 字段是主账；teacher 里「请学生摸一摸、看一看」那一截也是学生动作——
 * 一个环节常常有两三个动作，每个动作一页，才够这一环节的事（每环节 3–4 页）。
 */
function segmentActions(seg: Segment): string[] {
  const out: string[] = []
  const push = (raw: string): void => {
    const s = scrubForbidden(raw)
      .replace(/^(?:再|先|然后|接着|一边|跟|一起|自己|小组|各自|两个人|两人|全班|同桌)+/, '')
      .replace(/[。；;，,、：:\s]+$/, '')
      .trim()
    const n = countVisibleChars(s)
    if (n < 3 || n > ITEM_MAX) return
    if (!ACTION_HINT.test(s)) return
    if (!ACT_LEAD.test(s)) return
    if (TEACHER_GESTURE.test(s) || isTeacherNoise(s)) return
    /* 引号只许成对：「说出“桃子够，还多一个”」是学生要做的事，不要因为带了原文就没 */
    const open = (s.match(/“/g) ?? []).length
    const close = (s.match(/”/g) ?? []).length
    if (/[？?！!]/.test(s) || open !== close) return
    if (out.some((a) => sentenceKey(a) === sentenceKey(s))) return
    out.push(s)
  }
  for (const raw of String(seg.student ?? '').split(/[。；;\n，,：:]/)) push(raw)
  /* teacher 里「请学生摸一摸、看一看」：引号前的老师话不进，只留动作那一截 */
  for (const m of String(seg.teacher ?? '').matchAll(
    /请(?:学生|同学们|大家|全班|同桌|两个|一位)?([^。；;”"？?：:]{2,24})/g
  )) {
    for (const part of String(m[1] ?? '').split(/[，,、]/)) push(part)
  }
  /* 三字的短动作（摸一摸 / 看一看）不往前面那条上拼：拼出来是「观察并说出、摸一摸、
     看一看」，一页里三个动作，学生不知道先做哪个。宁可各自一页。 */
  return out
}

/** 这一段自己的讲稿短句（≤20 字）；不新造字，只挑。
 * 破折号也当断句：学生页上不许出现「——」这种半截话（第二十轮第 5 条）。*/
function segmentChunks(seg: Segment): string[] {
  const out: string[] = []
  for (const raw of String(seg.script ?? '').split(/[。；;！？!?\n]|——|—/)) {
    const s = scrubForbidden(raw)
      .replace(/^(同学们|大家|孩子们|好)[，,、\s]*/, '')
      .replace(/^[—－\-\s]+|[—－\-\s]+$/g, '')
      .trim()
    const n = countVisibleChars(s)
    if (n < 4 || n > LINE_MAX) continue
    if (isTeacherNoise(s)) continue
    /* 口令、半截话不进学生页：「请大家自由朗读课文，把不认识的字圈出来」不是课文 */
    if (INSTRUCTION_LEAD.test(s) || /[把将的了是着和与]$/.test(s)) continue
    out.push(s)
  }
  return out
}

/** 这一段的停顿点：问句 → 它插在哪句话后面（afterText）。
 *  「为什么最后要写笑？」与「三军过后尽开颜」一个字都不重，靠字面永远配不上，
 *  但原稿里早就写明了它们是前后脚。 */
interface SegCtx {
  seg: Segment
  index: number
  hint: string
  /** 这一段拆出来的节拍（陈述 / 问句，按讲稿先后） */
  beats: Beat[]
  questions: string[]
  quotes: string[]
  chunks: string[]
  actions: string[]
  /** 停顿点的问句 → 它后面那句原文（去重键） */
  anchors: Map<string, string>
  /** 这一段讲稿的整句（按句号切，保序），用来找问句前面那一句 */
  sentences: string[]
  qi: number
}

function segCtx(seg: Segment, index: number, bits: PlanBits): SegCtx {
  const beats = segmentBeats(seg)
  const anchors = new Map<string, string>()
  for (const p of seg.pauses ?? []) {
    const q = sentenceKey(String(p.question ?? ''))
    const a = String(p.afterText ?? '').trim()
    if (q && countVisibleChars(a) >= 4) anchors.set(q, a)
  }
  return {
    seg,
    index,
    hint: bits.hints[index] ? dropDangling(clipChars(scrubForbidden(bits.hints[index]), HINT_MAX)) : '',
    beats,
    questions: beats.filter((b) => b.kind === 'ask').map((b) => b.text),
    quotes: segmentQuotes(seg),
    chunks: segmentChunks(seg),
    actions: segmentActions(seg),
    anchors,
    sentences: String(seg.script ?? '')
      .split(/[。！？!?\n]/)
      .map((s) => s.trim())
      .filter((s) => countVisibleChars(s) >= 4),
    qi: 0,
  }
}

/** 这一段的下一句问话；全被别的页占过就返回 undefined——不再拿模板句凑数 */
function nextQuestion(ctx: SegCtx, book: SentenceBook): string | undefined {
  while (ctx.qi < ctx.questions.length) {
    const cand = ctx.questions[ctx.qi++]
    if (book.has(cand)) continue
    if (book.take(cand)) return cand
  }
  return undefined
}

/** notes 里的那一个问句：先用本页自己的，再往后取，实在没有才用页型现成的 */
function askFor(
  ctx: SegCtx,
  book: SentenceBook,
  own: string | undefined,
  kind: StudentSlideKind,
  bits: PlanBits
): string {
  return own ?? nextQuestion(ctx, book) ?? pickQuestion(kind, bits)
}

/* ---------- 标题：学生眼睛落的那一件事（第二十一轮第 2 条） ---------- */

/** 课堂组织的话不是标题：「小组合作」「同桌互读」「全班齐读」——学生看的不是这个 */
const ORG_TALK = /^(小组|同桌|全班|开火车|举手|同学们|大家|老师|每组|每一位)/

/** 页型标签不是标题（「发现规律」也是标签：它没说出是哪一条规律） */
const PAGE_LABEL_TITLE =
  /^(读进去|想一想|说一说|做一做|练一练|看这儿|比一比|先看这张图|最后一句|记住这句话|最后一问|今天三件事|课后两件事|字词关|发现规律|总结规律|归纳总结|探究新知|巩固练习|课堂小结|导入新课|拓展延伸)$/

/** 从动词开始、又不是动词 + 宾语的，是老师的手势，不是学生眼睛落的东西 */
const VERB_LEAD =
  /^(跟|指|请|让|把|给|用|从|向|对|再|先|然后|接着|下面|现在|今天|一起|大家|我们|你们|同学们|好|边|尝试|观察|数一数|量一量|搭一搭|摆一摆|摸一摸|看一看|读一读|说一说|想一想|比一比|圈一圈|画一画|写一写|找一找)/
/** 连词/副词开头的半句：「可又不太一样」「就这么多」——上一句的尾巴，不是一件事 */
const CLAUSE_LEAD =
  /^(可|也|就|还|又|但|却|而|并|是|不|没|别|这|那|所以|因此|因为|如果|于是|假如|其实|原来|只是|不过|总之|这样|那样|这么|那么)/

/** 教案里的教学动作：带上它，这一句就是老师的目标，不是学生要看的东西 */
const GOAL_TALK =
  /建立|概念|体会|理解|掌握|感受|培养|引导|初步|进一步|学会|能够|借助|利用|通过|抓住|引出|检验|当堂|指认|辨识|感知|探究|归纳|概括|迁移|落实|达成/

/** 问句里的话，标题里不能带 */
const ASK_WORD = /能|会|是|有|要|该|几|什么|怎么|怎样|哪|多少|为什么|吗|呢|够|可以|算/
/** 标题里真不能带的疑问字：问句是正文的事，标题只写学生要看的东西。
 *  比 ASK_WORD 窄——「长方体有 6 个面」这种带「有 / 是」的陈述当标题是正常的。 */
const TITLE_ASK = /什么|怎么|怎样|哪|多少|几|吗|呢|为什么|如何|谁/
/** 从问句里切标题时用的疑问词：只认真正的疑问处，不能像 ASK_WORD 那样把
 *  「能 / 会 / 是 / 该」也算进去——「七律该怎么读？」的标题是「七律」，切在「该」上就什么也不剩。 */
const ASK_CUT = /什么|怎么|怎样|为什么|如何|哪|多少|几|谁|吗|呢/

/** 标题不能以一个没说完的虚词收尾（「借的到底是」「三条棱相交的点叫」「谁来做一个」）。
 *  这些尾巴都是把一句话在虚词处切断留下的口子，不是名词短语的结尾。 */
const DANGLING_TAIL = /[的了着地得是在和与或就而把被让从向对为以及于叫个底]$/

/**
 * 半句的另一种尾巴：动词、介词后面的话被切掉了。
 * 「开口朝」「5和3之间填」「教室里还」——学生读到这儿会等下面那半句，而下面没有。
 * 「还多一个」这类话头同理：它是上文的后半截，不是这一页要看的那个东西。
 */
const HANG_TAIL = /[还也就才又而但与及或再把被对给朝向往到填做用成留起去来]$/
const LEFTOVER_LEAD = /^(还|也|就|才|又|再|然后|接着|最后|其余|剩下|其他|别的|另外|此外|同时|以及|至于|于是|所以|因为|不过|可是)/

/* 题问字开头的是问句，不是标题：「为什么把绵延的五岭写成」这种半问句不能当大标题 */
const ASK_LEAD = /^(?:为什么|怎么|怎样|哪里|哪儿|哪些|哪个|哪|什么|谁|多少|几)[\u4e00-\u9fff]*/

/** 问句里的那个东西：「顶点拿什么做？」→「顶点」；尾巴上的动词擦掉（否则剩「顶点拿」） */
const TRIM_VERB = /(?:拿|用|做|放|数|量|比|看|说|想|写|画|搭|摆|摸|读|念)$/

/** 去掉首尾的标点：从问句里切出来的那一段，尾巴常带着逗号 */
function tidyTitle(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .replace(/^[—－\-、，,。；;：:]+|[—－\-、，,。；;：:]+$/g, '')
    .trim()
}

/**
 * 这一句能不能当标题：学生此刻眼睛要落的那件东西，一个完整的名词短语或一句话。
 * 半句（「的」「了」「是」结尾）、口令（「跟」「指」「请」开头）、页型名、问句、半开的引号——一律不算。
 */
function usableTitle(raw: string): boolean {
  const s = tidyTitle(raw)
  const n = countVisibleChars(s)
  if (n < 3 || n > TITLE_MAX) return false
  /* 标题必须是汉字：拼音、数字、符号当标题学生什么也看不到，台上只剩一块空字 */
  if ((s.match(/[\u4e00-\u9fff]/g) ?? []).length < 2) return false
  if (isFragment(s) || isTeacherNoise(s)) return false
  if (PAGE_LABEL_TITLE.test(s)) return false
  if (ORG_TALK.test(s)) return false
  if (ASK_LEAD.test(s)) return false
  if (INSTRUCTION_LEAD.test(s) || VERB_LEAD.test(s)) return false
  if (CLAUSE_LEAD.test(s) || GOAL_TALK.test(s)) return false
  if (/[？?！!]/.test(s) || /——/.test(s)) return false
  if (/[，,：:；;（）()]/.test(s)) return false
  if (!listLike(s)) return false
  if (DANGLING_TAIL.test(s) || HANG_TAIL.test(s)) return false
  if (LEFTOVER_LEAD.test(s)) return false
  const open = (s.match(/“/g) ?? []).length
  const close = (s.match(/”/g) ?? []).length
  if (open !== close) return false
  if (META_TALK.test(s) || /你|我|咱/.test(s)) return false
  /* 引号一出现就说明这一截是从引文里切下来的半句（「发现“比的不是花香」） */
  if (/["“”]/.test(s)) return false
  return true
}

/**
 * 顿号串能不能当标题：「长、宽、高」「面、棱、顶点」是板书上一个整体的名字，
 * 学生一眼就知道这页说的是三样东西。「用直尺量棱、记录数据」不是——
 * 那一截是一件事加上另一件事。判据落在「每一截都得是短名词」上。
 */
function listLike(s: string): boolean {
  if (!s.includes('、')) return true
  const parts = s.split('、')
  if (parts.length < 2 || parts.length > 4) return false
  return parts.every((p) => /^[\u4e00-\u9fff0-9]{1,4}$/.test(p))
}

/** 讲稿里可当标题的几截：按逗号顿号拆开，长的优先 */
function titleFromText(text: string): string[] {
  return String(text ?? '')
    .split(/[，,。；;：:、！!？?\n（）()“”"｜—]+/)
    .map((s) => tidyTitle(s))
    .filter(usableTitle)
    .sort((a, b) => countVisibleChars(b) - countVisibleChars(a))
}

/**
 * 问句里问的那件东西：「12 条棱能分成几组？」→「12 条棱」，
 * 「三条棱相交的点叫什么？」→「三条棱相交的点」。标题是问句的一部分，所以两处指的是同一件事。
 */
function titleFromAsk(ask: string): string[] {
  /* 人称不是标题：「你闻到过桂花香吗？」学生看的是桂花香，不是「你」 */
  const raw = tidyTitle(ask).replace(/^(?:那么|那|好|现在|接下来)?(?:你|我|咱|您|你们|我们|大家|同学们)/, '')
  const out: string[] = []
  const def = raw.match(/^([^，,。；;]{2,14})[，,]?\s*(?:叫|叫做|就是|称为)/)
  if (def) out.push(def[1])
  out.push(raw.split(/[，,]/)[0])
  /* 只切在真正的疑问词上（ASK_CUT），切完把尾巴上残留的「叫 / 是 / 有」擦掉 */
  const cut = raw.search(ASK_CUT)
  if (cut >= 2) out.push(raw.slice(0, cut).replace(/(?:叫|叫做|就是|称为|是|有|要|该|个|这|那)$/, ''))
  /* 「12 条棱能分成几组？」：疑问词前面那一截沾着「能 / 可以 / 分成」，
     学生要看的那个东西在它们前面——再切一刀，只剩「12 条棱」。 */
  const pred = raw.search(/(?:能|可以|会|要|分成|分为|叫做|叫|称为)/)
  if (pred >= 2) out.push(raw.slice(0, pred).replace(/(?:的|这个|那个)$/, ''))
  /* 「闻过什么 / 有什么味道」：问句里「什么」后面那个名词就是学生眼睛落的东西。
     「哪几件事」不能直接切出「件事」——量词开头的那一截不是名词。 */
  const obj = raw.match(/(?:什么|哪种|哪个|哪些|哪几)([\u4e00-\u9fff]{2,6})/)
  if (obj && !/^[个条件组种块面根段只位扇次遍句些]/.test(obj[1])) out.push(obj[1].replace(/[呢吗的吧啊呀]$/, ''))
  /* 「需要几根小棒？」「几种长度？」：量词后面那个东西才是学生要看的。
     切出来的那截不能再以量词开头（「哪几件事？」切出「件事」，那不是个名词）。 */
  const num = raw.match(/(?:几|多少)(?:个|条|组|种|块|面|根|段|只|位|扇|次|遍|句)([\u4e00-\u9fff]{2,6})/)
  if (num && !/^[个条件组种块面根段只位扇次遍句些]/.test(num[1])) out.push(num[1].replace(/[呢吗的吧啊呀]$/, ''))
  /* 「为什么正好是 3 组？」：数本身就是一个能拿来说的点（3 组怎么分的） */
  const exact = raw.match(/(?:正好|刚好|一共|只有)([0-9一二三四五六七八九十]+[个条组种块面根只遍句])/)
  if (exact) out.push(exact[1])
  const sense = raw.match(/^(?:闻到过|闻过|见过|看过|听过|尝过|摸过|读过|去过|玩过)([\u4e00-\u9fff]{2,8})$/)
  if (sense) out.push(sense[1].replace(/[呢吗的吧啊呀]$/, ''))
  /* 「左右面呢？」「那 4 和 5 呢？」：问的是刚才那个东西，把「呢」前面那一截拿来 */
  const then = raw.match(/^(.{2,14}?)呢[？?]?$/)
  if (then) out.push(then[1].replace(/^(?:那|那么|要是|如果|再看|接着)+/, ''))
  const fin = [...new Set(out.map((t) => tidyTitle(t).replace(TRIM_VERB, '')))].filter(
    (s) => (usableTitle(s) || nounTitle(s)) && !TITLE_ASK.test(s)
  )
  return fin
}

/** 两个字的实词也能当标题（「味道」「棱长」）：只在已经从问句里认出是名词时才放行 */
function nounTitle(s: string): boolean {
  if (!/^[\u4e00-\u9fff]{2}$/.test(s)) return false
  return ![...s].some((ch) => TOPIC_STOP.has(ch))
}

/** 这个问句在讲稿里的位置往后一格的上一句：问句的来处就是标题的来处 */
function sentenceBefore(ctx: SegCtx, ask: string): string | undefined {
  /* 停顿点自己记着它插在哪句话后面（afterText）：不必再从字面去猜 */
  const anchor = ctx.anchors.get(sentenceKey(ask))
  if (anchor) {
    const hit = ctx.sentences.find(
      (s) => sentenceKey(s).includes(sentenceKey(anchor).slice(0, 6)) || sentenceKey(anchor).includes(sentenceKey(s).slice(0, 6))
    )
    return hit ?? anchor
  }
  const key = sentenceKey(ask).replace(/[的了吗呢]/g, '')
  const probe = key.slice(0, 8)
  if (!probe) return undefined
  for (let i = 0; i < ctx.sentences.length; i++) {
    if (sentenceKey(ctx.sentences[i]).includes(probe)) {
      return i > 0 ? ctx.sentences[i - 1] : ctx.sentences[i]
    }
  }
  return undefined
}

/** 这一问的答案通常就在下一句：停顿点记着它插在哪句话后面（afterText），
 *  讲稿里那句的下一句，就是学生答完、老师接着说下去的那一句。
 *  「为什么正好是 3 组？」→「这三组，就是我们说的长、宽、高」。 */
function sentenceAfter(ctx: SegCtx, ask: string): string | undefined {
  const anchor = ctx.anchors.get(sentenceKey(ask))
  const pick = (i: number): string | undefined => (i >= 0 && i + 1 < ctx.sentences.length ? ctx.sentences[i + 1] : undefined)
  if (anchor) {
    const i = ctx.sentences.findIndex(
      (s) => sentenceKey(s).includes(sentenceKey(anchor).slice(0, 6)) || sentenceKey(anchor).includes(sentenceKey(s).slice(0, 6))
    )
    const hit = pick(i)
    if (hit) return hit
  }
  const probe = sentenceKey(ask).slice(0, 8)
  if (!probe) return undefined
  return pick(ctx.sentences.findIndex((s) => sentenceKey(s).includes(probe)))
}

/** 两句话是不是在说同一件事：至少共用一个两字实词块（「三条棱」与「棱」算） */
function sharesWord(a: string, b: string): boolean {
  const A = String(a ?? '').replace(/[^\u4e00-\u9fff]/g, '')
  const B = String(b ?? '').replace(/[^\u4e00-\u9fff]/g, '')
  if (A.length < 2 || B.length < 2) return false
  for (let i = 0; i + 2 <= A.length; i++) if (B.includes(A.slice(i, i + 2))) return true
  return false
}

/** 只用来比「标题与问句是不是同一句话」：把语气词、标点、疑问尾巴全部抹平 */
function bareAsk(text: string): string {
  return sentenceKey(String(text ?? '')).replace(/[呢吗的吧啊呀么？?。，,、！!]/g, '')
}

/** 这一页的标题：先问句本身，再问句上面那一句，实在没有才退到环节目标。
 *  但退到目标也不许换话题——目标里那一截必须和这一问共用一个词，
 *  否则就会出现「标题说面、正文问棱」那种三句互不相干（第二十一轮第 3 条）。 */
function titleForAsk(ask: string, ctx: SegCtx, book: SentenceBook): string | undefined {
  const cands = titleFromAsk(ask)
  const before = sentenceBefore(ctx, ask)
  if (before) cands.push(...titleFromText(before))
  const own = takeFirst(book, cands, 3)
  if (own) return own
  /* 退到环节目标：只许拿「学生看得到的东西」那一截，教案动词（建立 / 理解 / 引出）不行 */
  const goalTitles = titleFromText(ctx.seg.goal ?? '').filter(
    (t) => !GOAL_TALK.test(t) && sharesWord(t, ask)
  )
  return takeFirst(book, goalTitles, 3)
}

/** 这一页的条目：只列问句自己点到的那个数（「6、12、8 各是什么？」→ 6 个面 / 12 条棱 / 8 个顶点）。
 *  不再按字面去配事实：「几个面？」没有数字，就不给条目——否则「6 个面」直接把答案漏在台 面上。 */
function factsForAsk(ask: string, bits: PlanBits): string[] {
  const digits: string[] = ask.match(/[0-9]+/g) ?? []
  if (!digits.length) return []
  return bits.facts
    .filter((f) => {
      const fd: string[] = f.match(/[0-9]+/g) ?? []
      /* 数字对上不算同一件事：「6、12、8 各是什么？」不能配「12 根小棒」，
         那条是拿同一个 12 凑出来的，跟这一问说的不是一回事 */
      if (!digits.some((n) => fd.includes(n))) return false
      return topicShare(f, ask) > 0
    })
    .slice(0, 3)
}

/** 学生动作句前面的「再、先、跟、边」不是动作本身，擦掉 */
function cleanAction(raw: string): string {
  return scrubForbidden(raw)
    // 「边摸边指」是完整动作，不能把开头的「边」当虚词擦掉（会剩「摸边指」）
    .replace(/^(?:再|先|然后|接着|一边|跟|一起|自己|小组)+/, '')
    .replace(/[。；;，,\s]+$/, '')
    .trim()
}

/** 动作页的标题允许动词开头（学生要做的事），但不能是半句、不能是把话头切断的那种 */
function actionTitle(s: string): boolean {
  const n = countVisibleChars(s)
  const open = (s.match(/“/g) ?? []).length
  const close = (s.match(/”/g) ?? []).length
  return (
    n >= 3 &&
    n <= TITLE_MAX &&
    !/[？?！!]/.test(s) &&
    // 引号只许成对：单边的「发现“比的不是花香」是从半句里切下来的
    open === close &&
    /* 带人称的不是一律不要：「说说哪个字最让你觉得乐」是学生真要做的事；
       老师在对谁说话才不行——句首的请 / 让 / 叫，或「同学们」「大家」开头。 */
    !/^(?:请|让|叫|给)|^(?:同学们|大家|全班|同桌)/.test(s) &&
    !/的$|[了着]$/.test(s) &&
    !isTeacherNoise(s) &&
    !ORG_TALK.test(s) &&
    !LEFTOVER_LEAD.test(s) &&
    !HANG_TAIL.test(s) &&
    !PAGE_LABEL_TITLE.test(s)
  )
}

/**
 * 一句陈述里能单独上屏的几截（第一截是整句或它的中心词，后面是并列的分句）。
 * 「七律每句七个字，读的时候是二二三的停顿」不是一件事，是两件：一句话拆开讲，
 * 就是两页。这是「每环节 3–4 页」真正能撑住的地方——不新造内容，只把已有的说开。
 */
function defPoints(text: string): string[] {
  const out: string[] = []
  const push = (raw?: string): void => {
    const s = tidyTitle(raw)
    const n = countVisibleChars(s)
    /* 两个字的实词也能当标题：「逶迤」「磅礴」就是学生这一页要看的词。
       但两个字必须经 nounTitle 认过——「两个」这种不算。 */
    if (n < 2 || n > TITLE_MAX) return
    if (!(usableTitle(s) || nounTitle(s))) return
    if (TITLE_ASK.test(s)) return
    if (out.some((o) => sentenceKey(o) === sentenceKey(s))) return
    out.push(s)
  }
  push(defTitle(text))
  for (const clause of String(text ?? '').split(/[，,；;]/)) {
    const s = tidyTitle(clause)
    push(s)
    /* 「这就是借物抒情」→「借物抒情」：前面那截是指代词，后面才是这一页要看的名字 */
    const named = s.match(/^(?:这|那)(?:就|正|便)?(?:是|叫|叫做|称为)(.{2,10})$/)
    if (named) push(named[1])
    /* 「每组四条一样长」→「四条一样长」：「每组」是对着全班分组说的，
       不是这一页要讲的东西本身。 */
    const noGroup = s.replace(/^(?:每组|每个|每家|每只|每样|每件|每人|每一)/, '')
    if (noGroup !== s) push(noGroup)
    /* 「读的时候是二二三的停顿」→「二二三的停顿」：前半截是老师的说法，
       后面那个东西才是这一页的标题。只在「…的时候是」这种句式上剥。 */
    const cut = s.replace(/^[^，,]{0,6}?(?:的时候|时)(?:是|要|就|都)/, '')
    if (cut !== s) push(cut)
    /* 「这三组，就是我们说的长、宽、高」→「长、宽、高」：前半截是拿手指着上文，
       后面那一串名字才是这一页要看的。 */
    const said = s.match(/^(?:就|也|正|便)?(?:是|叫|叫做|称为)(?:我们|大家)?(?:说的|叫的)?(.{2,14})$/)
    if (said) push(said[1])
  }
  return out
}

/**
 * 一个环节的候选页（纯函数，不碰全课账本）：
 *   ① 原文（语文）→ ② 陈述 + 问 → ③ 单独问句 → ④ 反问卷 → ⑤ 学生动作。
 * 顺序就是上课的顺序；每一页要么有一句能问出口的话，要么有一个学生要做的动作。
 *
 * 第二十三轮：学生版不是在课件上截短，是同一件事重新表达。一个环节講稿里有几句
 * 能站住的陈述、有几个学生真做的动作，就铺几页（3–4 页），不再固定只出两页。
 */
function planSegment(ctx: SegCtx, bits: PlanBits): StudentSlide[] {
  const out: StudentSlide[] = []
  /** 本段已经排进页里的句子（按去重键记）——跨段的去重交给 takePage */
  const used = new Set<string>()
  /** 已经配出去的陈述下标（一句陈述只出发一页） */
  const claimed = new Set<number>()
  /** 先按「这一页是干什么的」分堆，最后再按上课顺序拼回来 */
  const bins: Record<'quote' | 'def' | 'ask' | 'act', StudentSlide[]> = {
    quote: [],
    def: [],
    ask: [],
    act: [],
  }

  const free = (t?: string): boolean => {
    const k = sentenceKey(String(t ?? ''))
    return !!k && !used.has(k)
  }
  const put = (slide: StudentSlide, bin: 'quote' | 'def' | 'ask' | 'act' = 'def'): boolean => {
    const texts = [slide.title, slide.line, ...(slide.items ?? [])]
      .map((t) => String(t ?? ''))
      .filter((t) => t.trim())
    if (new Set(texts.map(sentenceKey)).size !== texts.length) return false
    if (!texts.every((t) => !used.has(sentenceKey(t)))) return false
    texts.forEach((t) => used.add(sentenceKey(t)))
    out.push(slide)
    bins[bin].push(slide)
    return true
  }

  const asks = ctx.beats.filter((b) => b.kind === 'ask')
  const defs = ctx.beats.filter((b) => b.kind === 'def')
  const freshAsk = (): string | undefined => asks.find((b) => free(b.text))?.text
  /** 这一问后面跟着哪句话（停顿点自己记着）；没记就按字面找 */
  const anchorOf = (ask: string): string | undefined => ctx.anchors.get(sentenceKey(ask))
  /** 给一句陈述找一问：先找停顿点记在那句后面的，再找共用实词的 */
  const askNear = (def: string): string | undefined => {
    const own = asks.find(
      (b) =>
        free(b.text) &&
        (() => {
          const a = anchorOf(b.text)
          if (a && (sharesWord(a, def) || sentenceKey(def).includes(sentenceKey(a).slice(0, 6)))) return true
          return digitMatch(b.text, def) || strongShare(b.text, def) >= 2
        })()
    )
    return own?.text
  }
  /** 动作页没有正文，备注里也得有一问能问出口（不是靠模板句凑数） */
  const noteAsk = (own?: string): string => own ?? freshAsk() ?? asks[0]?.text ?? pickQuestion('drill', bits)

  // ① 语文先上原文：这一段的那句话比任何改编都结实
  if (bits.pack.key === 'chinese') {
    for (const quote of ctx.quotes.slice(0, 2)) {
      const title = [...quoteTitles(quote), ...titleFromText(quote)].find((t) => t && free(t))
      if (!title) continue
      const ask = asks.find((b) => free(b.text) && strongShare(b.text, quote) > 0)?.text ?? freshAsk()
      if (!ask) continue
      put(
        {
          kind: 'close-read',
          title,
          line: `“${quote}”`,
          items: [ask],
          notes: `把这一句读出声，慢一点。${askPause(ask)}读的时候盯住最要紧的那个词，等会儿要问为什么偏偏是它。`,
        },
        'quote'
      )
    }
  }

  // ② 陈述配问：标题是这句陈述里那个东西，正文是问到它头上的那一问（两句指着同一个东西）
  const madeFrom = new Map<number, number>()
  for (const [i, def] of ctx.beats.entries()) {
    if (def.kind !== 'def') continue
    for (const title of defPoints(def.text)) {
      /* 一句陈述最多铺两页：说开不等于拆碎，第三截留到下一条 */
      if ((madeFrom.get(i) ?? 0) >= 2) break
      if (!free(title)) continue
      const ask = askNear(def.text) ?? askFromDef(def.text) ?? askFromDef(title)
      if (!ask || !free(ask)) continue
      /* 「左右面｜左右面呢？」：标题和正文是同一句话，学生看两遍什么也没多出来 */
      if (bareAsk(title) === bareAsk(ask)) continue
      const items = factsForAsk(ask, bits).filter(free).slice(0, 2)
      if (
        put(
          {
            kind: out.length === 0 ? 'close-read' : 'hook',
            title,
            line: ask,
            ...(items.length ? { items } : {}),
            notes: `先看这句话，再回答下面这一问。${askPause(ask)}答不上来就回到这句话里找一个词。`,
          },
          'def'
        )
      ) {
        madeFrom.set(i, (madeFrom.get(i) ?? 0) + 1)
        claimed.add(i)
      }
    }
  }

  // ③ 没有陈述可配的问句：标题从问句自己身上取（名词那一截），取不到就取它后面那句
  for (const ask of asks) {
    if (!free(ask.text)) continue
    const before = sentenceBefore(ctx, ask.text)
    const after = sentenceAfter(ctx, ask.text)
    const cands = [
      ...titleFromAsk(ask.text),
      ...(before ? defPoints(before) : []),
      ...(after ? defPoints(after) : []),
    ]
    const title = cands.find((t) => t && free(t) && bareAsk(t) !== bareAsk(ask.text))
    if (!title) continue
    const items = factsForAsk(ask.text, bits).filter(free).slice(0, 2)
    put(
      {
        kind: 'hook',
        title,
        line: ask.text,
        ...(items.length ? { items } : {}),
        notes: `这一页就看屏幕上的字。${askPause(ask.text)}想好了先跟同桌说，再点两位全班说。`,
      },
      'ask'
    )
  }
  
  // ④ 还没配出去的陈述：反着问一句（问的是这句话里被收起来的那一截）
  for (const [i, def] of ctx.beats.entries()) {
    if (def.kind !== 'def' || claimed.has(i)) continue
    for (const title of defPoints(def.text)) {
      if (!free(title)) continue
      const ask = askFromDef(def.text) ?? askFromDef(title)
      if (!ask || !free(ask)) continue
      if (bareAsk(title) === bareAsk(ask)) continue
      if (
        put(
          {
            kind: 'close-read',
            title,
            line: ask,
            notes: `这句话里有一样东西被收起来了。${askPause(ask)}先自己想，再翻开看对不对。`,
          },
          'def'
        )
      ) {
        claimed.add(i)
      }
      break
    }
  }

  // ⑤ 学生动作：一个动作一页，但这一页必须带材料（TASKS/25）
  for (const act of [...new Set(ctx.actions.map(cleanAction))].filter(actionTitle)) {
    if (!free(act)) continue
    /* 动作边上的材料，按结实程度挑：同话题的陈述 → 本段原文 → 都没有就不出这一页。
       「闭眼闻一闻」单独一页，学生不知道闻哪一段；配上原文那一句才成立。
       以前这里是「配不上就不配」，结果整页只剩一句动作——正是用户指着骂的那种页。 */
    const under = ctx.beats.find(
      (b) => b.kind === 'def' && free(defTitle(b.text) ?? '') && strongShare(b.text, act) > 0
    )
    const underLine = under ? defTitle(under.text) : undefined
    const quote = ctx.quotes.find((q) => free(q) && strongShare(q, act) > 0)
    const material = underLine && underLine !== act ? underLine : quote ? `“${quote}”` : undefined
    if (!material) continue
    /* 标题优先换成材料里那个具体的东西，动作降到 items：标题带对象、正文带原文，
       学生两样都看得见。换不成（那个标题已经被占）就退回动作本身。 */
    const named = [...(under ? defPoints(under.text) : []), ...(quote ? quoteTitles(quote) : [])].find(
      (t) => t && t !== act && free(t) && !BARE_ACTION_TITLE.test(t)
    )
    const ask = freshAsk()
    const page = (title: string): StudentSlide => ({
      kind: 'drill',
      title,
      line: title !== act && quote ? `“${quote}”` : material,
      ...(title !== act ? { items: [act] } : {}),
      notes: `先自己动手，做一遍再抬头。${askPause(noteAsk(ask))}做完和同桌换着看，谁先做完谁等一等。`,
    })
    if (named && put(page(named), 'act')) continue
    put(page(act), 'act')
  }

  /* 上课的顺序：原文 → 说开去 → 学生动手 → 再问一层。
     页数紧的时候（m40 一个环节只留 3 页）先保住前四样，
     第二处细节排到后面，被截掉也不至于整段只剩老师讲、学生没动作。 */
  const seq: StudentSlide[] = []
  const shift = (bin: StudentSlide[], n = 1): void => {
    for (let k = 0; k < n; k++) {
      const s = bin.shift()
      if (s) seq.push(s)
    }
  }
  shift(bins.quote)
  shift(bins.def)
  shift(bins.act)
  shift(bins.ask)
  while (bins.def.length || bins.ask.length || bins.act.length || bins.quote.length) {
    shift(bins.def)
    shift(bins.quote)
    shift(bins.act)
    shift(bins.ask)
  }
  return seq
}

/** 把一页记到全课账本上：标题 / 正文 / 条目都还没被别的页占过，才收下。
 *  收下时返回真正上屏的那一页（可能摘掉了几条撞车的 items），收不下返回 undefined。 */
function takePage(book: SentenceBook, slide: StudentSlide): StudentSlide | undefined {
  /* 标题或正文撞了，这一页就废了；但只是某一条 items 撞了（板书页也会列「12 条棱」这类
     东西），把那一条摘掉就行——不能因为一条目录把整页扔掉。 */
  if (book.has(slide.title) || (slide.line && book.has(slide.line))) return undefined
  const items = (slide.items ?? []).filter((t) => !book.has(t))
  const page: StudentSlide =
    items.length === (slide.items ?? []).length ? slide : { ...slide, items }
  ;[page.title, page.line, ...(page.items ?? [])]
    .map((t) => String(t ?? ''))
    .filter((t) => t.trim())
    .forEach((t) => book.take(t))
  return page
}

/** 一个环节真正上屏的几页：从候选里按教学顺序取，取到 want 页为止 */
function segmentPages(
  drafts: StudentSlide[],
  book: SentenceBook,
  want: number
): StudentSlide[] {
  const pages: StudentSlide[] = []
  for (const d of drafts) {
    if (pages.length >= want) break
    const page = takePage(book, d)
    if (page) pages.push(page)
  }
  return pages
}


/**
 * lesson 档学生版：按环节铺页面，页数取这一叠自己的区间（limits.pagesMin / pagesMax）。
 *
 * 第二十三轮：学生版不是课件的截短版，是同一件事重新表达。一个环节的讲稿里有几句
 * 能站住的陈述、有几个学生真做的动作，就铺几页（3–4 页）——先把每段铺到区间摊下来
 * 的那个页数，还不够下限再从「素材还剩最多」的那一段补一页，超上限从页数最多的那段收。
 * 每页都得能单独投出来讲两分钟：要么一问，要么一个动作。
 */
export function lessonSlides(plan: LessonPlan, limits: DensityLimits = DEFAULT_LIMITS): StudentSlide[] {
  const bits = readPlan(plan, limits)
  const segs = plan?.segments ?? []

  const head: StudentSlide[] = [
    /* 封面是一堂课的「印影」（TASKS/25）：只有课题三个字、一张图、一行教材册次、一行班级。
       以前这里放一句提问（「题目里你认得哪几个字？」），投影一出来学生先看问题、
       不看课；问题留在口播稿里，上台再说。 */
    harden(
      {
        kind: 'cover',
        title: bits.topic || '今天这节课',
        notes: `今天这一节我们从头到尾学完《${bits.topic || '这一课'}》。上一课留下的问题，今天找答案。${askPause(
          pickQuestion('cover', bits)
        )}先别翻书，想一想，等会儿回来说。`,
      },
      bits
    ),
    harden(genericPage('goals', bits), bits),
  ]
  /* 字词关只给语文 / 英语：数学、科学课上没有字词（第二十一轮第 1b 条） */
  if (bits.pack.hasWords && bits.words.length >= 3) head.push(harden(genericPage('words', bits), bits))

  const tail: StudentSlide[] = [
    harden(genericPage('board', bits), bits),
    harden(genericPage('homework', bits), bits),
    harden(genericPage('end', bits), bits),
  ]

  const book = sentenceBook()
  ;[...head, ...tail].forEach((s) => absorb(book, s))

  const ctxs = segs.map((seg, i) => segCtx(seg, i, bits))
  /** 每段的候选页：纯函数一次算清，全课账本只在真正上屏时记（takePage） */
  const drafts = ctxs.map((ctx) => planSegment(ctx, bits))
  const groups: StudentSlide[][] = ctxs.map(() => [])
  const assemble = (): StudentSlide[] =>
    settleClosing(collapseRepeats([...head, ...groups.flat(), ...tail]), bits)

  /* 每环节铺几页：下限摊到每段、卡在 3–4 页；上限也摊一下，免得整叠顶破区间 */
  const fixed = head.length + tail.length
  const segCount = Math.max(1, segs.length)
  const want = Math.max(
    3,
    Math.min(
      4,
      Math.ceil((limits.pagesMin - fixed) / segCount),
      Math.max(3, Math.floor((limits.pagesMax - fixed) / segCount))
    )
  )

  const fill = (i: number, target: number): void => {
    for (const d of drafts[i]) {
      if (groups[i].length >= target) break
      const page = takePage(book, d)
      if (page) groups[i].push(page)
    }
  }
  groups.forEach((_, i) => fill(i, want))

  /** 按「哪一段还剩的素材多」排序，给补页用 */
  const byMaterial = (): { i: number; left: number }[] =>
    drafts
      .map((d, i) => ({ i, left: d.length - groups[i].length }))
      .filter((x) => x.left > 0)
      .sort((a, b) => b.left - a.left || a.i - b.i)

  /* 还不够下限：素材剩得多的那几段先加一页（每段最多 4 页） */
  for (let round = 0; round < 4 && assemble().length < limits.pagesMin; round++) {
    let added = false
    for (const { i } of byMaterial()) {
      if (assemble().length >= limits.pagesMin) break
      if (groups[i].length >= 4) continue
      const before = groups[i].length
      fill(i, before + 1)
      if (groups[i].length > before) added = true
    }
    if (!added) break
  }

  /* 超上限：从页数最多的那一段收（后段的先收），每段留下至少 3 页 */
  while (assemble().length > limits.pagesMax) {
    const pick = groups
      .map((g, i) => ({ i, n: g.length }))
      .filter((x) => x.n > 3)
      .sort((a, b) => b.n - a.n || b.i - a.i)[0]
    if (!pick) break
    groups[pick.i].pop()
  }
  /* 还超（环节特别多）：从最后一段整段收页 */
  while (assemble().length > limits.pagesMax && groups.length > 0) {
    const last = groups[groups.length - 1]
    if (last.length > 1) {
      last.pop()
      continue
    }
    if (groups.length === 1) break
    groups.pop()
  }

  let pages = assemble()
  /* collapseRepeats 会砍掉「同一件事换了说法」的后一页；砍到下限以下就再从
     还剩素材的段里补一页——补的还是这一段自己的话，不另编 */
  for (let guard = 0; guard < 8 && pages.length < limits.pagesMin; guard++) {
    const order = byMaterial()
    if (!order.length) break
    const { i } = order[0]
    const before = groups[i].length
    fill(i, before + 1)
    if (groups[i].length === before) break
    pages = assemble()
    if (pages.length > limits.pagesMax) {
      groups[i].pop()
      pages = assemble()
      break
    }
  }

  return pages
}

/**
 * 两道环节的讲稿写重了时，台上会出现两页问同一个问题（「哪两个字最该重读？」与
 * 「万水千山只等闲，哪两个字要重？」）。它们字面不同，学生听了两遍却是一件事——
 * 上一页问过的，下一页必须往前走一步。这里两页问句的实词重合到 60% 以上，就只留前面那页。
 */
function collapseRepeats(pages: StudentSlide[]): StudentSlide[] {
  const kept: StudentSlide[] = []
  const cores: Set<string>[] = []
  const skipKinds = new Set<StudentSlideKind>(['cover', 'goals', 'words', 'board', 'homework', 'end'])
  for (const p of pages) {
    const ask = String(p.line ?? '')
    const core = /[？?]/.test(ask) && !skipKinds.has(p.kind) ? topicChars(ask) : new Set<string>()
    if (core.size >= 4) {
      const dup = cores.some((prev) => {
        const shared = [...core].filter((c) => prev.has(c)).length
        return shared >= 4 && shared >= 0.55 * Math.min(core.size, prev.size)
      })
      if (dup) continue
    }
    if (core.size) cores.push(core)
    kept.push(p)
  }
  return kept
}

/**
 * 板书页与收束页的标题是全课「最后一句」，最容易和前面某一页的标题或条目撞车
 * （「12 条棱」在板书里是条目，在收束页又当标题）。撞了不拿页型名顶上，
 * 而是按学科说这一课带走什么——那是一句真话，学生也看得懂。
 */
function settleClosing(pages: StudentSlide[], bits: PlanBits): StudentSlide[] {
  const seen = new Set<string>()
  const key = (t: unknown) => sentenceKey(String(t ?? ''))
  return pages.map((p) => {
    const own = key(p.title)
    const clash = seen.has(own)
    ;[p.title, p.line, ...(p.items ?? [])].forEach((t) => seen.add(key(t)))
    if (!clash || (p.kind !== 'end' && p.kind !== 'board')) return p
    const alt = bits.pack.closing(bits.topic)
    seen.add(key(alt))
    return { ...p, title: alt }
  })
}

/** notes 缺失时的口语兜底（保证「每页备注能直接念」不至于开天窗） */
function deriveNotes(kind: StudentSlideKind, bits: PlanBits): string {
  const ask = bits.questions[0] ?? pickQuestion(kind, bits)
  const script = bits.scripts[0] ? shortenPhrase(bits.scripts[0], 60) : ''
  return `${script ? script + ' ' : ''}这一页就看着屏幕上的字，${ask} 想不清的话，回到课文里找那句话。`
}

/* ------------------------- 内置示例数据 ------------------------- */

interface BuiltinEntry {
  exampleId: string
  pattern: RegExp
  /** 返回 null 表示这份示例的学生版数据还没补上（任务 #9），走泛化兜底 */
  load: () => StudentSlide[] | null
}

/**
 * 按 plan.meta.topic 关键词匹配，不去动 examples.ts 和其余 data 文件。
 * 四份内置示例的学生版数据（#9 已补齐）各自住在自己的 data 文件里，这里只负责按课题取用。
 */
const BUILTIN_MATCHERS: BuiltinEntry[] = [
  { exampleId: 'guihua', pattern: /桂花/, load: () => GUIHUA_STUDENT_SLIDES },
  { exampleId: 'bidaxiao', pattern: /比大小|多几种|少几种/, load: () => BIDAXIAO_STUDENT_SLIDES },
  { exampleId: 'changfangti', pattern: /长方体|正方体|立方体/, load: () => CHANGFANGTI_STUDENT_SLIDES },
  { exampleId: 'changzheng', pattern: /长征|七律/, load: () => CHANGZHENG_STUDENT_SLIDES },
  { exampleId: 'hetang', pattern: /荷塘月色|荷塘/, load: () => HETANG_STUDENT_SLIDES },
  { exampleId: 'chun', pattern: /^《?春》?$|朱自清.*春/, load: () => CHUN_STUDENT_SLIDES },
  { exampleId: 'beiying', pattern: /背影/, load: () => BEIYING_STUDENT_SLIDES },
  { exampleId: 'fenshu', pattern: /分数/, load: () => FENSHU_STUDENT_SLIDES },
  { exampleId: 'yuanmianji', pattern: /圆的面积|圆面积/, load: () => YUANMIANJI_STUDENT_SLIDES },
  { exampleId: 'caochuan', pattern: /草船借箭|草船/, load: () => CAOCHUAN_STUDENT_SLIDES },
]

/**
 * 无 API Key 时的数据来源：命中内置示例用示例，命不中走泛化。
 * 四份内置 STUDENT_SLIDES 是手工写好的 lean 稿件（每页正文 ≤30 字、10 页、非字词页 items ≤3、
 * 字词页恰 4 词）——把默认档抬到 standard 只会放宽上限、不触发截断，对这手稿是幂等的，
 * 所以内置四篇保持 lean 原样（取舍：离线断网演示不追信息量，联网生成才按锁档/自判补密）。
 *
 * 整节课档（20 / 30 / 40 分钟）一律走 lessonSlides() 现生成：第二十一轮把上一轮那篇
 * 手写的 27 页母版（data/guihuaLesson.ts）删了。一课能手写，一百课手写不了——
 * 要修的是生成路径本身。
 */
export function getBuiltinStudentSlides(plan: LessonPlan, limits: DensityLimits = DEFAULT_LIMITS): StudentSlide[] {
  return dropBarePages(rawStudentSlides(plan, limits))
}

/**
 * 兜底稿的最后一道闸（TASKS/25）：只有动作、没有材料的页一页都不出。
 *
 * 正常情况这里应该一页都删不掉（⑤ 段落已经把动作配上了材料）；留着是防以后
 * 文案一改又漏出「自由朗读」「读一遍」这种空指令页——那类页老师上课只能自己编。
 * 删到不足 8 页就不删了：宁可留一句空话，也不交半本书。
 */
function dropBarePages(pages: StudentSlide[]): StudentSlide[] {
  const bare = (s: StudentSlide): boolean => {
    const kind = s?.kind
    if (!s || kind === 'cover' || kind === 'quote' || kind === 'end') return false
    const body = [s.line ?? '', ...(s.items ?? [])].join(' ').trim()
    return countVisibleChars(body) < 4
  }
  const kept = pages.filter((s) => !bare(s))
  return kept.length >= 8 ? kept : pages
}

function rawStudentSlides(plan: LessonPlan, limits: DensityLimits): StudentSlide[] {
  const bits = readPlan(plan, limits)
  if (bits.scale === 'lesson') {
    /* 2026-11-22 真机抓出：整节课的兜底原来走 lessonSlides（教案推出来的泛化页，
       每页只有一句问话），模型一被退回就换上一叠薄页——用户指着说「内容太少」。
       有手写内置稿的课（桂花雨 / 比大小 / 长方体…）整节课也先用它，再用课文原句与
       教案素材补到页数下限；没有内置稿的课才走教案推导。 */
    const hit = BUILTIN_MATCHERS.find((e) => e.pattern.test(String(plan?.meta?.topic ?? '')))
    const data = hit?.load() ?? null
    const base =
      data && data.length > 0
        ? fitPageCount(trimBuiltinTier(data.map((s) => harden(s, bits)), Number(plan?.meta?.duration ?? 0)), bits)
        : lessonSlides(plan, limits)
    return withCoverMeta(
      withMotif(withQuotes(padPages(base, plan, limits), plan, limits), plan?.meta?.subject),
      plan
    )
  }

  const topic = String(plan?.meta?.topic ?? '')
  const hit = BUILTIN_MATCHERS.find((e) => e.pattern.test(topic))
  const data = hit?.load() ?? null
  if (data && data.length > 0) {
    // 内置数据是手工写好的，harden 在这里只是护栏：合规时原样出来
    return withCoverMeta(
      withMotif(withQuotes(fitPageCount(data.map((s) => harden(s, bits)), bits), plan, limits), plan?.meta?.subject),
      plan
    )
  }
  return withCoverMeta(withMotif(withQuotes(genericSlides(plan, limits), plan, limits), plan?.meta?.subject), plan)
}

/**
 * 封面的线稿按学科定（TASKS/24 §三）：只动 kind='cover' 那一页，其余页原引用返回。
 * 没图的封面不再是「一律雨丝」——英语课的封面是四线三格，数学课是方格与坐标。
 */
export function withMotif(slides: StudentSlide[], subject: unknown): StudentSlide[] {
  const key = motifOf(subject)
  return slides.map((s) => (s.kind === 'cover' && s.motif !== key ? { ...s, motif: key } : s))
}

/**
 * 封面上的两行标注（TASKS/25）：教材（小学语文 · 五年级）与署名（五年级　　班）。
 *
 * 为什么要这一层：模型不一定会给，老存档里也没有；但封面没有这两行就不像一份能交上去的课件。
 * 所以只补空位、不覆盖：模型/老师已经写了的原样留着。
 * 班级号我们没有任何来源，默认一个空位（「五年级　　班」），老师点开就能填。
 */
export function withCoverMeta(slides: StudentSlide[], plan: LessonPlan): StudentSlide[] {
  const m = (plan?.meta ?? {}) as unknown as Record<string, unknown>
  const txt = (v: unknown): string => String(v ?? '').trim()
  const grade = txt(m.grade)
  const stage = txt(m.stage)
  const subject = txt(m.subject)
  const text = [stage + subject || subject, grade ? grade + volumeOf(plan) : ''].filter(Boolean).join(' · ')
  return slides.map((s) => {
    if (s.kind !== 'cover') return s
    const meta = s.meta?.trim() || text
    const byline = s.byline?.trim() || (grade ? `${grade}　　班` : '')
    if (meta === s.meta && byline === s.byline) return s
    return {
      ...s,
      ...(meta ? { meta } : {}),
      ...(byline ? { byline } : {}),
    }
  })
}

/**
 * 上册还是下册（TASKS/25）。
 *
 * 我们手里没有「这一课在哪一册」这个字段（输入只有课题与教材版本），但封面上必须有。
 * 两个来源，按可信度排：
 *   ① 教材版本 / 课时里已经写了「上/下册」→ 照抄；
 *   ② 都没有 → 按学期推：九月到一月是上册，二月到八月是下册。
 * 推错了不要紧：封面上这一行老师点开就能改（PptPreview 的「教材」输入框）。
 */
export function volumeOf(plan: LessonPlan, now = new Date()): string {
  const m = (plan?.meta ?? {}) as unknown as Record<string, unknown>
  const said = `${String(m.textbook ?? '')} ${String(m.period ?? '')} ${String(m.grade ?? '')}`
  const hit = said.match(/([上下])\s*册/)
  if (hit) return `${hit[1]}册`
  const month = now.getMonth() + 1
  return month >= 9 || month <= 1 ? '上册' : '下册'
}

/* ------------------------- 原文页插页（TASKS/19a） ------------------------- */

/** 原文页不能占的位置：封面、板书的收口三页（它们本来就该在两头） */
const QUOTE_NO_ANCHOR = new Set<StudentSlideKind>(['cover', 'quote', 'board', 'homework', 'end'])
/** 页数超了时先撤谁：先撤课件页，原文页与骨架页一页都不撤 */
const QUOTE_TRIM_ORDER: StudentSlideKind[] = ['hook', 'compare', 'drill', 'words', 'close-read']

/** 从这一叠里撤掉一页可撤的课件页（按 QUOTE_TRIM_ORDER 的优先级，同页型撤最后那页） */
function trimOneContentPage(pages: StudentSlide[]): boolean {
  for (const kind of QUOTE_TRIM_ORDER) {
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i].kind === kind) {
        pages.splice(i, 1)
        return true
      }
    }
  }
  return false
}

/** 比原文用：只去空白，标点与用字一律不动（原文页的硬约束是「一字不改」） */
function flatText(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, '')
}

/**
 * 模型自己给的原文页必须先过一遭原文校验（2026-11-21 第六次真机）。
 *
 * 那次没给原文，模型靠记忆交了「又想起故乡童年时代的摇花乐」+ 母亲那句的后半句，
 * 两张都被当成原文页，还被并成了「又想起…摇花乐，还是比不得…」——原课文里根本没有这句。
 * 老师的信任就建在「原文页一字不错」上，一句都不许凭空长出来：
 *   - 有原文（老师贴了 / 内置引句）：只留逐字在原文里的那几页；
 *   - 没有原文：一页都不留（TASKS/19a：老师没给原文 → 一页不出，其余页型一字不改）。
 * 被撤掉的页由下面的 withQuotes 从原文里重新铺，不靠模型背。
 */
function dropUnverifiedQuotes(slides: StudentSlide[], plan: LessonPlan): StudentSlide[] {
  if (!slides.some((s) => s.kind === 'quote')) return slides
  const source = flatText(plan?.meta?.text)
  return slides.filter((s) => {
    if (s.kind !== 'quote') return true
    if (!source) return false
    const one = flatText(s.text ?? s.title)
    return one.length > 0 && source.includes(one)
  })
}

/** 一句原文的收尾：句末标点数得上的才算说完，其余（逗号 / 没有标点）都是半句 */
const QUOTE_ENDED = /[。！？；…”』」]$/

/**
 * 相邻两张原文页是同一句的两半时，并回一页（2026-11-21 真机）。
 *
 * 模型自己会交这种页：第一页「这里的桂花再香，」——句末是逗号；
 * 第二页「也比不上家乡院子里的桂花」。两页各自都没毛病，并排上投影就是
 * 一张写到一半的原文页，学生以为原文就断在这里。
 *
 * 只并相邻两张、只并「第一张没收句」的，且并完不超 QUOTE_BODY_MAX：
 * 不碰正文页、不跨页搬字、不改一个字（就是把两张的文字接起来）。
 *
 * 2026-11-21 第四次真机补的两处：
 *   1. **一人只并一次**。以前并完的长句末尾还是没有句号，下一张接着被吞进去——
 *      《桂花雨》四张半句被并成「摇哇摇，桂花纷纷落下来好香的雨啊外地的桂花再香…」
 *      一整段，60 字上限也没拦住。并过的那一页封口，不许再当下一轮的前页。
 *   2. **接缝处的标点补回逗号**。模型把原文按行断的时候，行尾那个逗号常常丢了，
 *      直接接起来就是「落下来好香的雨啊」。接缝两边一个标点都没有，说明逗号被
 *      换行吞了，补一个「，」是把它还回来（不动原文一个字）。
 *   3. **一页已经包含另一页时不许再接**。第五次真机《桂花雨》第 7 页变成了
 *      「外地的桂花再香，还是比不得…金桂，还是比不得…金桂」——模型先给了整句，
 *      紧接着又给了这句的后半句；两张都没收句，接起来就是同一句话说两遍。
 *      现在先判包含：后一页被前一页包含就只留前一页，前一页被后一页包含就用后一页。
 */
const JOIN_TAIL = /[，、：；。！？…”』」]$/
const JOIN_HEAD = /^[，、：；。！？…]/
/** 判包含时最短的句子：短于 6 个字的 key（「桂花」）一包一大片，不许拿来当依据 */
const CONTAIN_MIN = 6

/** 两张原文页接起来：接缝处已有标点就原样接，没有就补回被换行吞掉的那个逗号 */
function joinQuote(a: string, b: string): string {
  return JOIN_TAIL.test(a) || JOIN_HEAD.test(b) ? a + b : `${a}，${b}`
}

function mergeHalfQuotes(slides: StudentSlide[]): StudentSlide[] {
  if (slides.length < 2) return slides
  const out: StudentSlide[] = []
  /** 已经并过一轮的下标：它们不再当下一轮的前页（否则会一路吞下去） */
  const sealed = new Set<number>()
  let merged = false
  for (const s of slides) {
    const at = out.length - 1
    const prev = out[at]
    const a = String(prev?.text ?? prev?.title ?? '').trim()
    const b = String(s?.text ?? s?.title ?? '').trim()
    const ka = sentenceKey(a)
    const kb = sentenceKey(b)
    const bothQuote = prev?.kind === 'quote' && s?.kind === 'quote' && Boolean(a) && Boolean(b)

    /* 后一页已经在前一页里：这一页是重复的，整页不要（不是接、不是并） */
    if (bothQuote && kb.length >= CONTAIN_MIN && ka.includes(kb)) {
      merged = true
      continue
    }
    /* 前一页只是半句、后一页才是整句：用后一页换掉前一页 */
    if (bothQuote && ka.length >= CONTAIN_MIN && kb.includes(ka)) {
      out[at] = { ...s, title: b, text: b }
      merged = true
      continue
    }
    if (bothQuote && !sealed.has(at) && !QUOTE_ENDED.test(a) && countVisibleChars(joinQuote(a, b)) <= QUOTE_BODY_MAX) {
      const one = joinQuote(a, b)
      out[at] = { ...prev, title: one, text: one }
      sealed.add(at)
      merged = true
      continue
    }
    out.push(s)
  }
  return merged ? out : slides
}

/**
 * 原文页全局去重（2026-11-21 真机《狼牙山五壮士》）：第 6 页是整句
 * 「班长马宝玉斩钉截铁地说了一声：“走！”带头向棋盘陀走去。」，第 15 页是前半句、
 * 第 18 页是后半句——三页不相邻，mergeHalfQuotes 只管相邻两张，于是同一句上了三次台。
 *
 * 这里做一次全局包含判定：被另一张原文页完整包含（≥ CONTAIN_MIN 字）的那页不出；
 * 两句相等时只留前面那张。互不包含的半句原样保留（它们并起来才是原句，交给相邻合并）。
 * 删到低于页数下限就一页不删——页数比去重更硬。
 */
function dropCoveredQuotes(slides: StudentSlide[], limits: DensityLimits): StudentSlide[] {
  const quotes = slides.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'quote')
  if (quotes.length < 2) return slides
  const keyOf = (s: StudentSlide) => sentenceKey(String(s.text ?? s.title ?? ''))
  const keys = quotes.map((x) => keyOf(x.s))
  const drop = new Set<number>()
  for (let a = 0; a < quotes.length; a++) {
    for (let b = 0; b < quotes.length; b++) {
      if (a === b) continue
      const ka = keys[a]
      const kb = keys[b]
      if (ka.length < CONTAIN_MIN || kb.length < CONTAIN_MIN) continue
      const same = ka === kb && b > a
      const covered = ka.includes(kb) && !kb.includes(ka)
      if (same || covered) drop.add(quotes[b].i)
    }
  }
  if (drop.size === 0) return slides
  const out = slides.filter((_, i) => !drop.has(i))
  return out.length >= limits.pagesMin ? out : slides
}

/* ------------------- 凝练（2026-11-23 用户拍板「修，必须修」） ------------------- *
 * 模型交稿 + 撑页数补页之后还剩三种水页（真机《狼牙山五壮士》25 页实测）：
 * 重复原文页（第 22 页是第 10 页的前半句）、空活动页（第 5 页只有一句短问，
 * 标题「三个字都是第四声」在下一页 notes 里原样躺着）、碎片页与同类薄页
 * （第 23 页作业只有一条「必做｜」前缀，第 18 / 20 页是同一道练习的两半）。
 * 页数不再是硬线——密度才是硬线：宁可 21 页结实，不要 25 页掺水。
 * 四条规矩全是「整页搬 / 整页删」，屏上的字一个不改；纯函数、幂等。
 * -------------------------------------------------------------------------- */

/** 能参与合并 / 吸收的页型：封面 / 目标 / 原文 / 板书 / 收尾永不动 */
const CONDENSE_KINDS = new Set<StudentSlideKind>(['hook', 'words', 'close-read', 'compare', 'drill', 'homework'])

/** 一页的全部文字（含老师 notes）：判「这一页是否已被另一页盖住」用 */
function slideHaystack(s: StudentSlide): string {
  return sentenceKey([s.title, s.text, s.line, ...(s.items ?? []), s.notes].join(''))
}

/** 这一页薄：≤2 条条目且正文（line + items，不含标题）≤40 字 */
function isLightPage(s: StudentSlide): boolean {
  const items = s.items ?? []
  return items.length <= 2 && countVisibleChars([s.line ?? '', ...items].join('')) <= 40
}

/**
 * 把一叠学生版里的水页凝掉：重复原文页删、被邻页盖住的空活动页删、
 * 同类碎片页删、同类两张薄页并成一张。只在模型交稿那条路上用
 * （buildStudentSlides 撑页之后）；内置稿有自己的 collapseRepeats / dedupePages，
 * 门禁口径不动。
 */
export function condenseSlides(slides: StudentSlide[]): StudentSlide[] {
  if (!Array.isArray(slides) || slides.length < 2) return slides
  let out = slides.slice()
  let changed = false

  /* ① 原文页全局包含去重：被另一张原文页完整包含（≥CONTAIN_MIN 字）的那页不出。
     与 dropCoveredQuotes 同一把尺，只是不带「删到低于页数下限就不删」的护栏——
     这一轮用户拍板密度优先于页数。 */
  {
    const quotes = out.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'quote')
    const keys = quotes.map((x) => sentenceKey(String(x.s.text ?? x.s.title ?? '')))
    const drop = new Set<number>()
    for (let a = 0; a < quotes.length; a++) {
      if (drop.has(quotes[a].i)) continue
      for (let b = 0; b < quotes.length; b++) {
        if (a === b || drop.has(quotes[b].i)) continue
        const ka = keys[a]
        const kb = keys[b]
        if (ka.length < CONTAIN_MIN || kb.length < CONTAIN_MIN) continue
        const same = ka === kb && b > a
        const covered = ka.includes(kb) && !kb.includes(ka)
        if (same || covered) drop.add(quotes[b].i)
      }
    }
    if (drop.size) {
      out = out.filter((_, i) => !drop.has(i))
      changed = true
    }
  }

  /* ② 空活动页：一条条目都没有、也没有原文，标题或短问已被邻页（±1）的
     notes / 可见文字盖住 → 整页删。删的是重复，不是内容：那一句在邻页原样活着。 */
  {
    const drop = new Set<number>()
    for (let i = 0; i < out.length; i++) {
      const s = out[i]
      if (!isActivityKind(s.kind)) continue
      if ((s.items ?? []).length > 0 || String(s.text ?? '').trim()) continue
      const near = [out[i - 1], out[i + 1]].filter(Boolean).map(slideHaystack)
      const probes = [sentenceKey(s.title), sentenceKey(s.line ?? '')].filter((k) => k.length >= 4)
      if (probes.some((k) => near.some((h) => h.includes(k)))) drop.add(i)
    }
    if (drop.size) {
      out = out.filter((_, i) => !drop.has(i))
      changed = true
    }
  }

  /* ③ 同类碎片页：这一页的每一条条目（剥掉「必做｜」这类前缀）都能在另一张
     更结实的同类页里找到 → 整页删。只吸收 ≤2 条的碎片，不动成页的材料。 */
  {
    const drop = new Set<number>()
    for (let a = 0; a < out.length; a++) {
      const s = out[a]
      if (!CONDENSE_KINDS.has(s.kind) || drop.has(a)) continue
      if ((s.items ?? []).length === 0 || (s.items ?? []).length > 2) continue
      const items = (s.items ?? []).map(bulletBody).filter((t) => sentenceKey(t).length >= 4)
      if (!items.length) continue
      const mine = countVisibleChars([s.line ?? '', ...(s.items ?? [])].join(''))
      for (let b = 0; b < out.length; b++) {
        if (a === b || drop.has(b)) continue
        const t = out[b]
        if (t.kind !== s.kind) continue
        if (countVisibleChars([t.line ?? '', ...(t.items ?? [])].join('')) <= mine) continue
        const hay = slideHaystack(t)
        if (items.every((it) => hay.includes(sentenceKey(it)))) {
          drop.add(a)
          break
        }
      }
    }
    if (drop.size) {
      out = out.filter((_, i) => !drop.has(i))
      changed = true
    }
  }

  /* ④ 同类两张薄页 → 并成一张：条目并进前页（按句去重），后页的 line 与 notes
     并进前页 notes（老师的话不丢）。至少一张薄、合并后 ≤6 条且 ≤120 字才并；
     带插画的页不动（它已经「满」了）；字词页不并（读准 / 写对是两件事，
     且条目超 cap 会被 paginate 重新拆页，并了白并）。 */
  {
    const drop = new Set<number>()
    for (let a = 0; a < out.length; a++) {
      const s = out[a]
      if (!CONDENSE_KINDS.has(s.kind) || s.kind === 'words' || drop.has(a) || s.illustration) continue
      for (let b = a + 1; b < Math.min(out.length, a + 4); b++) {
        const t = out[b]
        if (drop.has(b) || t.kind !== s.kind || t.illustration) continue
        if (!isLightPage(s) && !isLightPage(t)) continue
        const merged = [...(s.items ?? [])]
        const seen = new Set(merged.map(sentenceKey))
        for (const it of t.items ?? []) {
          const k = sentenceKey(it)
          if (k && !seen.has(k)) {
            merged.push(it)
            seen.add(k)
          }
        }
        if (merged.length > 6) continue
        if (countVisibleChars([s.line ?? '', ...merged].join('')) > 120) continue
        const notes = [s.notes, t.line, t.notes].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ')
        out[a] = { ...s, items: merged, notes }
        drop.add(b)
        changed = true
        break
      }
    }
    if (drop.size) out = out.filter((_, i) => !drop.has(i))
  }

  return changed ? out : slides
}

/**
 * 把课文原句铺成原文页（TASKS/19a）。
 *
 * 三条硬规矩：
 *   1. 原文页插在页面流里、不堆在开头也不堆在结尾（按可插位置均分）；
 *   2. 同一句只上一次台：别页已经有的句子不再做原文页；
 *   3. 页数不破档位上限；原文页自身永不撤。
 * 老师没给原文（meta.text 为空）→ 一页不出，其余页型一字不改。
 *
 * 一个算术事实：40 分钟的课本身 22–28 页，而《观潮》只有 3 句原文——
 * 3 / 22 < 25%，在 25% 这条线上是做不到的。代码只做「能做到就做到」：
 * 只有 pagesMin 本身能把原文页抬到 25% 时（片段 10–14 页）才回删课件页；
 * 整节课的长课不为了凑比例删页，宁可少——比重复原文更接近真实课堂。
 */
export function withQuotes(
  slides: StudentSlide[],
  plan: LessonPlan,
  limits: DensityLimits = DEFAULT_LIMITS
): StudentSlide[] {
  const merged = mergeQuoteParagraphs(
    dropCoveredQuotes(
      mergeHalfQuotes(dropUnverifiedQuotes(expandQuotePages(moveCoverAsk(slides)), plan)),
      limits
    ),
    String(plan?.meta?.text ?? '')
  )
  const list = merged
  const quotes = splitQuotes(String(plan?.meta?.text ?? ''))
  if (quotes.length === 0 || list.length === 0) return list

  const taken: string[] = []
  for (const s of list) for (const t of pageSentences(s)) {
    const k = sentenceKey(t)
    if (k) taken.push(k)
  }
  /* 屏上已经有一句盖着它，就不再单独出一页原文页（2026-11-21 真机）：
     模型自己给的原文页是「外地的桂花再香，还是比不得家乡旧宅院子里的金桂」，
     meta.text 里又按行断成了「…旧宅院」，两页并排就是一句半原文 + 一句整原文。
     只判一个方向（屏上那句包含这一句），不反着判：
     反着判会把「摇呀摇，桂花纷纷落下来。」这种短句当成「已上过」而抹掉。 */
  const covered = (q: string): boolean => {
    const k = sentenceKey(q)
    if (k.length < 6) return taken.includes(k)
    return taken.some((t) => t === k || t.includes(k))
  }
  const quota = Math.min(QUOTE_PAGE_MAX, Math.max(1, Math.ceil(limits.pagesMax * 0.3)))
  /* 长句不再整句丢弃：逐字拆成多块原文页，每块各自判「屏上是否已盖着它」 */
  const picked = quotes
    .flatMap((q) => chunkQuote(q))
    .filter((q) => !covered(q))
    .slice(0, quota)
  if (picked.length === 0) return list

  const topic = String(plan?.meta?.topic ?? '')
  const anchors = list.map((_, i) => i).filter((i) => !QUOTE_NO_ANCHOR.has(list[i].kind))
  const slots = anchors.length > 0 ? anchors : [0]
  const count = Math.min(picked.length, slots.length)
  const buckets = new Map<number, string[]>()
  for (let k = 0; k < count; k++) {
    const pos = Math.floor(((k + 0.5) * slots.length) / count)
    const at = slots[Math.min(slots.length - 1, Math.max(0, pos))]
    buckets.set(at, [...(buckets.get(at) ?? []), picked[k]])
    // 后挑的句子不能让先挑的那句把它盖住（否则两页一全一半，学生以为两句）
    const key = sentenceKey(picked[k])
    if (key) taken.push(key)
  }

  const out: StudentSlide[] = []
  list.forEach((s, i) => {
    out.push(s)
    for (const one of buckets.get(i) ?? []) out.push(quoteSlideOf(one, topic))
  })

  while (out.length > limits.pagesMax && trimOneContentPage(out)) {
    /* 原文页一页不撤：先撤课件页，撤不动就停 */
  }

  const quoteCount = out.filter((s) => s.kind === 'quote').length
  /* 只有「回到页数下限也还能守住 25%」时才回删：片段档 3/12 = 25% 成立，整节课不成立 */
  if (quoteCount / limits.pagesMin >= QUOTE_MIN_SHARE) {
    while (out.length > limits.pagesMin && quoteCount / out.length < QUOTE_MIN_SHARE) {
      if (!trimOneContentPage(out)) break
    }
  }
  return mergeQuoteParagraphs(out, String(plan?.meta?.text ?? ''))
}

/**
 * 让模型单独指一遍句子（2026-11-22）。
 *
 * 主 prompt 里给了 pull 字段说明，真机两次（25 页 / 31 页）一个字都没填——
 * 一页 JSON 里一个「可选」字段，模型必然省略：它一次要同时管页序、密度、语气、
 * 材料、标题，顾不过来。所以拆出来单独问一次：这一叠页已经定了，只回答
 * 「每页配哪一句」。上下文短、任务单一，它才认真做。
 *
 * 只问「没图、且配得上引文块」的页；只让它出页号与句号（{i,q}），
 * 不让它复述任何文字——抄错字的机会从源头上没了。
 * 整趟失败就当没问过：一页不配，照常交付。
 */
export async function fillPulls(
  slides: StudentSlide[],
  plan: LessonPlan,
  cfg: LLMConfig,
  signal?: AbortSignal
): Promise<StudentSlide[]> {  const quotes = splitQuotes(String(plan?.meta?.text ?? ''))
  if (quotes.length === 0 || slides.length === 0) return slides
  if (signal?.aborted) return slides

  const need = slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.pull && !hasArt(s) && pullRank(s.kind) === 0)
  if (need.length === 0) return slides

  const pageLines = need.map(({ s, i }) => {
    const items = (s.items ?? []).map((t) => String(t).slice(0, 18)).join('；')
    /* notes 是老师上台要讲的那几句，最能说明这一页在讲什么——只给标题和词条，
       模型会保守到只挑两三页；给了讲稿提示它才敢下手。截 40 字，别把整段灌进去。 */
    const note = String(s.notes ?? '').replace(/\s+/g, '').slice(0, 40)
    return `${i + 1}. [${s.kind}] ${String(s.title ?? '').slice(0, 24)}${items ? ` | ${items.slice(0, 48)}` : ''}${note ? ` | 讲稿：${note}` : ''}`
  })
  const system = `你是课件编辑。下面是一节学生版课堂幻灯片的每一页（页号 / 页型 / 页面上的字 / 老师的讲稿提示），以及这节课的课文原句。
给每一页挑一句原句，摆在这一页的右半块当引文。

只输出一个 JSON 对象，不要围栏、不要解释：{"pick":[{"i":3,"q":2},{"i":7,"q":5}]}
- i 是页号，q 是句子编号；确实不相关的页不要出现在数组里。

规矩（违反任何一条，这一趟作废）：
1. 只挑跟这一页**讲的同一件事**的那句。「都在这一课里」不算相关——这一页讲雹子，就挑写雹子那句。
2. 一句只能用一次。同一句别给两页。
3. 大部分页都能挑到：一节课二十来页，通常有一半以上配得上某一句原句。真正一句都不贴的才留空。
4. 空着比配错好看——但「配不上」和「懒得想」不是一回事：先想这一页在讲课文哪一段，再去那一段里找句子。
5. 不要挑写景铺陈的长句去配概念页，也不要挑概念句去配写场面的页。`

  const user = `【这一课的课本原句】
${quotes.map((q, k) => `${k + 1}. ${q}`).join('\n')}

【学生版每一页】
${pageLines.join('\n')}

按 {"pick":[...]} 输出。`

  let raw: unknown
  try {
    raw = await postChatJson(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      cfg,
      signal,
      0.2
    )
  } catch {
    return slides
  }
  if (signal?.aborted) return slides

  const list = Array.isArray((raw as { pick?: unknown })?.pick) ? ((raw as { pick: unknown[] }).pick as unknown[]) : []
  if (list.length === 0) return slides

  const out = slides.map((s) => ({ ...s }))
  /* 屏上已有的句子（原文页整页就是它、别页已经引过）不再重复摆一块 */
  const used = new Set<string>()
  for (const s of out) for (const t of pageSentences(s)) used.add(sentenceKey(t))

  for (const it of list) {
    const i = Number((it as { i?: unknown })?.i)
    const q = Number((it as { q?: unknown })?.q)
    if (!Number.isInteger(i) || !Number.isInteger(q)) continue
    const page = out[i - 1]
    const quote = quotes[q - 1]
    if (!page || !quote || page.pull || hasArt(page) || pullRank(page.kind) < 0) continue
    const key = sentenceKey(quote)
    if ([...key].length < 8 || [...key].length > 56 || used.has(key)) continue
    page.pull = quote
    used.add(key)
  }
  return out
}

/**
 * 引文块（2026-11-22 用户拍板）：活动页没配上图，右半块别留一块空色。
 *
 * 规矩和原文页是同一条：**只认 plan.meta.text 里逐字存在的句子**——
 * splitQuotes 切出来什么样就摆什么样，不生成、不改写、不润色。
 * 编出来的「课文原句」比一块空色坏得多，所以一句都配不上时这页就照原来的
 * 纯文字排版走，不去画装饰图凑数。
 *
 * 为什么放在配图之后：pull 只在「这一页真没图」时才该出现。有图的页右半块
 * 已经是画了，再塞一句引文就是字压图（TASKS/12 硬规矩）。
 *
 * 一页最多一句、一句只用一次：屏上已经有了的句子（原文页整页就是它、
 * 别页 line 里已经引过）不再重复摆一块——同一句在两条页上各占半张，
 * 学生以为是两句不同的原文。
 */
export function withPulls(slides: StudentSlide[], plan: LessonPlan): StudentSlide[] {  const quotes = splitQuotes(String(plan?.meta?.text ?? ''))
  if (quotes.length === 0 || slides.length === 0) return slides

  const out = slides.map((s) => ({ ...s }))

  /* 屏上已有的句子：原文页整页就是它、别页 line 里已经引过。
     同一句再做一块引文，学生以为是两句不同的原文。 */
  const used = new Set<string>()
  for (const s of out) for (const t of pageSentences(s)) used.add(sentenceKey(t))

  /* 把模型自己指的那句逐字验一遍。
     模型给的 pull 相关性最好（它知道这一页在讲哪一段），但必须逐字出自原文——
     抄错一个字、多一个逗号、少一个「的」，整条丢掉。这和原文页同一条底线：
     编出来的「课文原句」比一块空色坏得多。

     剥引号只能剥**一层**：早先写成剥掉首尾所有引号，遇到本身就带引号的句子
     （「可是母亲说：“这里的桂花再香……”」）会把句子自己的收尾引号也吃掉，
     于是永远比不上。现在两种形态都试：原样、剥一层。 */
  const verbatim = (raw: unknown): string => {
    const a = String(raw ?? '').trim()
    if (!a) return ''
    const b = (() => {
      const pairs: [string, string][] = [
        ['“', '”'],
        ['「', '」'],
        ['『', '』'],
        ['"', '"'],
      ]
      for (const [l, r] of pairs) {
        if (a.startsWith(l) && a.endsWith(r) && a.length > l.length + r.length) {
          return a.slice(l.length, a.length - r.length).trim()
        }
      }
      return a
    })()
    const want = new Set([a, b].map((s) => s.replace(/\s+/g, '')))
    return quotes.find((q) => want.has(q.replace(/\s+/g, ''))) ?? ''
  }

  for (const s of out) {
    if (!s.pull) continue
    const one = verbatim(s.pull)
    const key = sentenceKey(one)
    const n = [...key].length
    /* 页型不对（封面 / 原文页）、这页已经有画、句子太短太长效不下、屏上已有同一句 —— 都不收 */
    if (
      one &&
      !hasArt(s) &&
      pullRank(s.kind) >= 0 &&
      n >= 8 &&
      n <= 56 &&
      !used.has(key)
    ) {
      s.pull = one
      used.add(key)
    } else {
      delete s.pull
    }
  }

  /* 模型没给 pull 的页：**本地不补**（2026-11-22，真机两轮试出来的）。
     试过字面重合（单字 / 连续两字），两种都会瞎配：
       「看表格」配上「这是英雄的中国人民坚强不屈的声音」（撞一个「表」字）；
       「生字词每个抄写两遍」配上「五位壮士屹立在狼牙山顶峰」（那一页 items 就是
       生字表，恰好有「屹」「立」「眺」，两字重合就撞上了）。
     瞎配一句比空着糟得多：学生以为课件坏了。所以这一层只做校验，不做匹配——
     相关性只有写这一页的人（模型）知道，它没指句子，这页就空着。 */
  return out
}

/** 有真图（data:image）就不再塞引文块：右半块已经是画了 */
function hasArt(s: StudentSlide): boolean {
  return typeof s.illustration === 'string' && s.illustration.startsWith('data:image/')
}

/**
 * 引文块的落点：只有这几种页配得上。
 * 字词页（words）不在里面——那一页整版就是词表，图位在多数模板里本来就被跳过
 * （ART_SKIP），硬塞一句原句反而和词表打架；板书 / 作业 / 收尾页自带内容，也不必补。
 * 封面整页是画、原文页整页就是句子，更不用说了。
 */
function pullRank(kind: StudentSlideKind | undefined): number {
  if (kind === 'hook' || kind === 'close-read' || kind === 'drill' || kind === 'compare') return 0
  if (kind === 'goals') return 1
  return -1
}

/**
 * 页数不够下限时自动补页（2026-11-21 用户验收 s2）。
 *
 * 以前模型交 12 页、下限 16 页，整份退回内置那一叠——好页也跟着没了。
 * 现在先补：① 还没上屏的课文原句铺成原文页；② 教案里还剩素材的页（只收能带来
 * 新句子的）。一条也补不出来就如实少，绝不编造页填空。
 *
 * 补的页一律插在尾部三页（板书 / 作业 / 收尾）之前。
 */
export function padPages(
  slides: StudentSlide[],
  plan: LessonPlan,
  limits: DensityLimits = DEFAULT_LIMITS
): StudentSlide[] {
  if (!Array.isArray(slides) || slides.length === 0 || slides.length >= limits.pagesMin) return slides
  const out = slides.slice()
  const used = new Set<string>()
  for (const s of out) {
    for (const t of pageSentences(s)) {
      const k = sentenceKey(t)
      if (k) used.add(k)
    }
  }
  const fresh = (text: string): boolean => {
    const k = sentenceKey(text)
    if (k.length === 0 || used.has(k)) return false
    /* 已被屏上更长一句盖住的半句也不算新（2026-11-23 真机：补进来的第 22 页
       是第 10 页原文的前半句，同一句上了两次台）。与 withQuotes 的 covered 同向：
       只判「屏上那句包含这一句」，不反着判。 */
    if (k.length >= CONTAIN_MIN) {
      for (const t of used) if (t.includes(k)) return false
    }
    return true
  }
  /** 尾部三页永远在最后 */
  const insertAt = (): number => {
    const at = out.findIndex((s) => s.kind === 'board' || s.kind === 'homework' || s.kind === 'end')
    return at >= 0 ? at : out.length
  }
  const put = (page: StudentSlide): void => {
    for (const t of pageSentences(page)) {
      const k = sentenceKey(t)
      if (k) used.add(k)
    }
    out.splice(insertAt(), 0, page)
  }

  /* ① 原文页：还没上屏的课文原句最值钱 */
  const topic = String(plan?.meta?.topic ?? '')
  for (const q of splitQuotes(String(plan?.meta?.text ?? ''))) {
    if (out.length >= limits.pagesMin) break
    for (const c of chunkQuote(q)) {
      if (out.length >= limits.pagesMin) break
      if (!fresh(c)) continue
      put(quoteSlideOf(c, topic))
    }
  }

  /* ② 教案里还剩素材的页：跳过首尾固定页，只收能带来新句子的 */
  if (out.length < limits.pagesMin) {
    const skip = new Set<StudentSlideKind>(['cover', 'goals', 'words', 'board', 'homework', 'end'])
    /* 补页的料优先用这一课的手写内置稿（与 rawStudentSlides 同一份材料）：
       教案推导出来的泛化页常常只有标题 + 一句短问，内置稿每页都挂着实料。
       模型只交几页、课题又是内置课时，拿内置稿补比拿推导页补结实；
       没有内置稿的课才退回教案推导。 */
    const hit = BUILTIN_MATCHERS.find((e) => e.pattern.test(topic))
    const donor = hit?.load() ?? null
    const candidates =
      donor && donor.length > 0 ? donor.map((s) => harden(s, readPlan(plan, limits))) : lessonSlides(plan, limits)
    for (const d of candidates) {
      if (out.length >= limits.pagesMin) break
      if (skip.has(d.kind)) continue
      /* 2026-11-22：补页不许把薄页补进来（与 materialProblems 共用 isThinBody 这一把尺）；
         补不出就如实少。整页每一句都必须是新的：只要有一句和已在屏的页重复，
         validateSlides 就会判「一句只能用一次」——「带了新句子」不等于「这一页能上」。 */
      if (isThinBody(d)) continue
      const keys = pageSentences(d).map(sentenceKey).filter(Boolean)
      if (keys.length === 0 || !keys.every((k) => !used.has(k))) continue
      put(d)
    }
  }
  return out
}

/* --------- 从老师改定的课件出发（TASKS/17 §二 / TASKS/22） --------- */

/**
 * 课件里能交给学生的素材（TASKS/22 §2.2）。只认四类：课文原句、生字词、
 * 纯陈述、学生动作。「我准备这么拆」「先给什么」「然后再问」「谁来说」这些句子
 * 既不是原句、不是字词，又带着我 / 谁 / 问号，一个字段都进不来——它们留在老师那一叠。
 */
export interface DeckMaterial {
  cover: string
  words: string[]
  /** 每一页能交给学生的句子，带源下标，用来保住「谁在前」 */
  lines: { at: number; text: string; from: DeckKind }[]
  /** 课件标题本身就是学生动作的那几页（老师写课件时就写成了「读第三段，圈出……」） */
  tasks: { at: number; text: string }[]
  board: { at: number; title: string; items: string[] } | null
  homework: { at: number; title: string; items: string[] } | null
}

/** 主语不是学生本人的句子，一句都不上学生版（问句另有 hasAskable 判定，不走这条） */
const TEACHER_ADDRESS = /我|咱|谁|学生|老师|孩子|全班|小组|同桌|投|屏幕|巡视/

/** 接着上一句往下说的半句：它不是一件事，上屏就是「也……」 */
const HALF_LEAD = /^(也|就|还|但|而|所以|因为|如果|落到|等于|比如|例如|其中|另外|同时|接着)/

/** 课件里的版面元信息（课时 / 时长 / 学段）不是学生要看的东西 */
const DECK_META = /课时|年级|分钟|小学|初中|高中|第[一二三四五六七八九十\d]+单元/

/** 学生当场做得到的动作（与 hasAskable 同一套字：缺了它，那一页既不能问也不能做） */
const STUDENT_ACTION =
  /读|圈|写|画|标|填|数|比|做|演|背|找|听|看|说|试|闻|闭|换|讨论|交流|打开|翻|举|跟|摸|摆|搭|指|量|拼|剪|折|贴|排|唱|算|练|观察/

/**
 * 课件素材里的半句话：省略号居中、或结尾悬着一个破折号。
 * 这种句子从教师课件里捞出来当学生页大字，投影上就是「第二组 — ……好，第几组？」。
 */
const FRAGMENT_LINE = /……|—{1,2}\s*$/

/** 这一条 bullet 真正上屏的那一截：`课文里的｜……` 这种页面前缀先剥掉 */
function bulletBody(raw: unknown): string {
  const clean = dropDangling(scrubForbidden(String(raw ?? ''))).replace(/\s+/g, '')
  const bar = Math.max(clean.indexOf('｜'), clean.indexOf('|'))
  return (bar >= 0 ? clean.slice(bar + 1) : clean).trim()
}

/** 压到 max 字：先取「有动作、读得懂」的第一截（阅读顺序），再退到最长的那一截；都不行就空 */
function fitClause(text: string, max: number): string {
  const clean = String(text ?? '').trim()
  if (!clean) return ''
  if (countVisibleChars(clean) <= max) return clean
  const ok = (p: string): boolean => {
    const n = countVisibleChars(p)
    if (n < 3 || n > max) return false
    if (isTeacherNoise(p) || TEACHER_ADDRESS.test(p) || HALF_LEAD.test(p) || DECK_META.test(p)) return false
    /* 切出来的那一截也不能是半句原话：引号必须成对 */
    if ((p.match(/“/g) ?? []).length !== (p.match(/”/g) ?? []).length) return false
    if (findTeacherWords(p).length || tasteProblems(p).length) return false
    return true
  }
  const parts = clean
    .split(/[，,；;。！？：]+/)
    .map((p) => dropDangling(p.trim()))
    .filter(ok)
  const action = parts.find((p) => TITLE_VERB.test(p) && countVisibleChars(p) >= 6)
  if (action) return action
  return parts.sort((a, b) => countVisibleChars(b) - countVisibleChars(a))[0] ?? ''
}

/** 一页课件里的陈述句 / 学生动作能不能上学生版 */
function studentLine(raw: string): string {
  const clean = dropDangling(scrubForbidden(String(raw ?? '')))
    .replace(/\s+/g, '')
    .replace(/^(必做|选做|必|选)[｜|]?/, '')
    .trim()
  if (!clean || /…|——/.test(clean)) return ''
  if (countVisibleChars(clean) < 4) return ''
  if (/[？?]/.test(clean)) return ''
  if (TEACHER_ADDRESS.test(clean) || HALF_LEAD.test(clean) || DECK_META.test(clean)) return ''
  /* 引号不配对 = 从原句里截下来的半句（「也比不上家乡院子里的桂花”」），不收 */
  if ((clean.match(/“/g) ?? []).length !== (clean.match(/”/g) ?? []).length) return ''
  if (isTeacherNoise(clean)) return ''
  if (STAGE_TITLE.test(clean) || TITLE_GUESS.test(clean)) return ''
  if (findTeacherWords(clean).length) return ''
  if (tasteProblems(clean).length) return ''
  return fitClause(clean, ITEM_MAX)
}

/** 课件标题本身能不能当学生页大字：必须是学生做得到的动作，不点名、不留半句 */
function studentTitle(raw: string): string {
  const clean = dropDangling(scrubForbidden(String(raw ?? '')))
    .replace(/\s+/g, '')
    .replace(/^(必做|选做|必|选)[｜|]?/, '')
    .trim()
  if (!clean || /…|——|[？?]/.test(clean)) return ''
  if (countVisibleChars(clean) < 4) return ''
  if (TEACHER_ADDRESS.test(clean)) return ''
  if (STAGE_TITLE.test(clean) || TITLE_GUESS.test(clean)) return ''
  if (isTeacherNoise(clean) || findTeacherWords(clean).length) return ''
  if (tasteProblems(clean).length) return ''
  const title = fitClause(clean, TITLE_MAX)
  if (!title || !TITLE_VERB.test(title)) return ''
  return title
}

/** 板书页：黑板上真要写字的那几行（「a → b → c」这种链条），页脚的说明句不收 */
function boardLinesOf(bodies: string[]): string[] {
  const out: string[] = []
  for (const body of bodies) {
    const tail = body.split(/[：:]/).pop() ?? ''
    const chain = tail.split(/[→—>]+/).map((s) => s.split(/[，,。；;]/)[0].trim())
    if (chain.length < 2) continue
    for (const piece of chain) {
      const t = unquote(piece).replace(/\s+/g, '')
      const n = countVisibleChars(t)
      if (n < 2 || n > WORDS_ITEM_MAX) continue
      if (/写|居中|上方|下方|括号|标|行|字/.test(t)) continue
      if (out.includes(t)) continue
      out.push(t)
    }
  }
  return out.slice(0, 5)
}

/** 作业页：必做 / 选做各留一条，存下前缀就存，存不下就只留动作 */
function homeworkLinesOf(bullets: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of bullets) {
    const text = String(raw ?? '').trim()
    const compulsory = /^(必做|必)/.test(text)
    const optional = /^(选做|选)/.test(text)
    const body = dropDangling(scrubForbidden(text.replace(/^(必做|选做|必|选)\s*[｜|]\s*/, '')))
    const line = fitClause(body, ITEM_MAX)
    if (!line) continue
    out.push(`${compulsory ? '必做｜' : optional ? '选做｜' : ''}${line}`)
  }
  return out.slice(0, 2)
}

/** 从一叠课件里捞出学生能用的素材；教师页与教师话术在这一步就被挡掉 */
export function deckMaterial(deck: readonly DeckPage[] | null | undefined): DeckMaterial {
  const mat: DeckMaterial = { cover: '', words: [], lines: [], tasks: [], board: null, homework: null }
  const seen = new Set<string>()
  const putWord = (w: string): void => {
    const t = unquote(String(w ?? '')).replace(/\s+/g, '')
    const n = countVisibleChars(t)
    if (n < 2 || n > WORDS_ITEM_MAX) return
    if (!/^[\u4e00-\u9fa5]+$/.test(t)) return
    if (mat.words.includes(t)) return
    mat.words.push(t)
  }
  ;(deck ?? []).forEach((page, at) => {
    if (!page || !String(page.title ?? '').trim() || isTeacherPage(page)) return
    const title = dropDangling(scrubForbidden(page.title)).replace(/\s+/g, '')
    if (page.kind === 'cover') mat.cover = title
    const bodies =
      page.kind === 'cover'
        ? [] /* 封面只取课题：下面的「小学五年级·语文·第一课时」「04:00」是版面信息 */
        : [...(page.bullets ?? []).map(bulletBody), bulletBody(page.question ?? '')].filter(Boolean)
    if (page.kind === 'board') {
      mat.board = { at, title, items: boardLinesOf(bodies) }
      return
    }
    if (page.kind === 'homework') {
      mat.homework = { at, title, items: homeworkLinesOf(page.bullets ?? []) }
      return
    }
    const task = studentTitle(title)
    if (task) mat.tasks.push({ at, text: task })
    for (const body of bodies) {
      /* 引号里的两到六个字是生字词，不是句子 */
      for (const m of body.matchAll(/[“"]([^”"]{2,6})[”"]/g))
        for (const w of String(m[1]).split(/[、，,\s]+/)) putWord(w)
      const line = studentLine(body)
      if (!line) continue
      const key = sentenceKey(line)
      if (!key || seen.has(key)) continue
      seen.add(key)
      mat.lines.push({ at, text: line, from: page.kind })
    }
  })
  return mat
}

/** 学生版备注：一句该做什么，不带问句、不带教师词（22 门禁会扫 notes） */
function deckNotes(kind: StudentSlideKind, topic: string, title: string): string {
  switch (kind) {
    case 'cover':
      return `今天这一节学《${topic}》。先看屏幕上这几个字，读一遍题目，把不认识的字圈出来，圈完举手。`
    case 'goals':
      return '这一节做三件事。一件做完再做下一件，做完的在旁边画个勾，三件都打完再往下走。'
    case 'words':
      return '屏幕上这些词，一个一个读过去。读错的那个先做个记号，等一会儿再读一遍。'
    case 'board':
      return '黑板这几行是一路走下来的顺序。眼睛跟着走一遍，再把它们连起来说一句。'
    case 'homework':
      return '今天回去两件事。必做的那一件先做完，选做的写两三句就够。'
    case 'end':
      return '下课之前把这一页记住。明天来时，用一句话说清这一节留下了什么。'
    case 'drill':
      return '先自己试，试到哪一步算哪一步。卡住就回上一页再看一遍，别急着举手。'
    default:
      return `这一页慢一点读。${title}。读完抬头，等一等，再说你的答案。`
  }
}

/**
 * 素材 → 学生版。一条硬规矩：这里不按课件页数出货。
 * 素材够几页就排几页，排不满下限就整份交回本课内置那一叠（绝不拿课件页凑数）。
 */
function rebuildFromDeck(mat: DeckMaterial, bits: PlanBits, limits: DensityLimits): StudentSlide[] {
  const topic = bits.topic || '这一课'
  const used = new Set<string>()
  /** 一句话只能上一次台：标题用掉的不许再当条目 */
  const free = (text: string): boolean => {
    const key = sentenceKey(text)
    if (!key) return true
    if (used.has(key)) return false
    used.add(key)
    return true
  }
  const pages: StudentSlide[] = []
  const units: { at: number; slide: StudentSlide }[] = []

  /* 1 封面：课题 + 一句学生当场能做的动作（不给问号） */
  const coverTitle = clipChars(dropDangling(scrubForbidden(mat.cover)) || `《${topic}》`, TITLE_MAX)
  pages.push({
    kind: 'cover',
    title: coverTitle,
    line: '先看题目，把不认识的字圈出来',
    notes: deckNotes('cover', topic, coverTitle),
  })

  /* 2 三件事：只收目标页里的纯陈述 */
  const goals = mat.lines
    .filter((l) => l.from === 'objectives')
    .map((l) => l.text)
    .filter(free)
  if (goals.length >= 2) {
    const items = goals.slice(0, 3)
    pages.push({
      kind: 'goals',
      title: GOALS_TITLE,
      items: items.map((t, i) => `${'①②③'[i]} ${t}`),
      notes: `这一节做三件事：${items.join('；')}。一件做完再做下一件，做完的在旁边画个勾。`,
    })
  }

  /* 3 字词：只收 2–6 个汉字的短词，任何档位恒 ≤4 行 */
  if (mat.words.length >= 3) {
    const words = mat.words.slice(0, WORDS_ITEMS_MAX)
    pages.push({
      kind: 'words',
      title: '这几个词，先读准',
      line: '挨个读一遍，读错的做个记号',
      items: words,
      notes: `屏幕上这 ${words.length} 个词，一个一个读过去。读错的那个先做个记号，等一会儿再读一遍。`,
    })
  }

  /* 4 正文：有学生指令标题的页整页成一页；其余每一句各占一页（一页只讲一件事）。
     课件页里排不出学生页的（标题不是动作、正文全是教师话）自然消失——
     所以学生版页数一定不等于课件页数。 */
  const titleAt = new Map<number, string>()
  for (const t of mat.tasks) titleAt.set(t.at, t.text)
  const rows: { at: number; slide: StudentSlide }[] = []
  const ats = [...new Set(mat.lines.filter((l) => l.from !== 'objectives').map((l) => l.at))].sort(
    (a, b) => a - b
  )
  let closeReads = 0
  const kindOf = (from: DeckKind): StudentSlideKind => {
    if (from === 'activity' || from === 'assessment') return 'drill'
    /* 精读页有硬上限（三档都是 2–3 页）：超出的那几页退成练一练，不硬塞 */
    if (closeReads >= limits.closeReadMax) return 'drill'
    closeReads += 1
    return 'close-read'
  }
  const put = (at: number, kind: StudentSlideKind, title: string, items: string[]): void => {
    rows.push({
      at,
      slide: {
        kind,
        title,
        ...(items.length ? { items } : {}),
        /* 不补「先自己试一遍」这类口令：五页 drill 会撞成同一句，一句只能上一次台 */
        notes: deckNotes(kind, topic, title),
      },
    })
  }
  for (const at of ats) {
    const lines = mat.lines.filter((l) => l.at === at && l.from !== 'objectives')
    const pageTitle = titleAt.get(at) ?? ''
    if (pageTitle && free(pageTitle)) {
      /* 老师这一页的标题已经是学生动作：标题当大字，同页的话当条目。
         标题必须原样上屏（TASKS/22：老师改的标题一字不改地成为学生页大字），
         所以这里不能再修剪措辞。 */
      const kind = kindOf(lines[0]?.from ?? 'segmentPoint')
      const items = lines.map((l) => l.text).filter(free).slice(0, 2)
      put(at, kind, pageTitle, items)
      continue
    }
    for (const line of lines) {
      /* 标题必须是学生当场做得到的动作：靠补一个「读」才成句的半句、
         或者「问两个字为什么…」这种老师才做的动作，都不上台 */
      if (!STUDENT_ACTION.test(line.text)) continue
      /* 碎片不取（2026-11-21 真机《狼牙山五壮士》第 13 页「第二组 — ……好，第几组？」）：
         课件里混进来的半句话（省略号、悬空破折号），投影上学生看不懂。
         宁缺毋滥：少一页由页数闸门接住，不把碎片当标题。 */
      if (FRAGMENT_LINE.test(line.text)) continue
      const guess = studentTitle(asTask(line.text, 'close-read'))
      if (!guess || !free(guess)) continue
      put(at, kindOf(line.from), guess, [])
    }
  }
  /* 页数超过上限就合并相邻两页（后一页的句子当条目），不删内容 */
  const budget = Math.max(3, limits.pagesMax - 6)
  const body: StudentSlide[] = []
  for (const row of rows) {
    const prev = body[body.length - 1]
    if (body.length >= budget && prev && (prev.items ?? []).length < limits.itemsMax) {
      body[body.length - 1] = { ...prev, items: [...(prev.items ?? []), row.slide.title].slice(0, limits.itemsMax) }
      continue
    }
    body.push(row.slide)
  }
  pages.push(...body)

  /* 5 板书与作业：跟着课件里的先后（学生版这两页的顺序必须随课件调序翻转） */
  if (mat.board) {
    const title = studentTitle(asTask(mat.board.title, 'board')) || '看这一课，落在这几行字上'
    units.push({
      at: mat.board.at,
      slide: {
        kind: 'board',
        title,
        ...(mat.board.items.length ? { items: mat.board.items } : {}),
        notes: deckNotes('board', topic, title),
      },
    })
  }
  if (mat.homework) {
    const title = studentTitle(mat.homework.title) || '课后做两件事'
    units.push({
      at: mat.homework.at,
      slide: {
        kind: 'homework',
        title,
        ...(mat.homework.items.length ? { items: mat.homework.items } : {}),
        notes: deckNotes('homework', topic, title),
      },
    })
  }

  pages.push(...units.sort((a, b) => a.at - b.at).map((u) => u.slide))

  /* 6 收束：一页一句，不带问号。与课件小结页撞句时不硬塞（free 会拒），
     宁可不要这一页，也不让同一句上两页。 */
  const end = '说一句这一课记住了什么'
  if (free(end)) {
    pages.push({ kind: 'end', title: end, notes: deckNotes('end', topic, end) })
  }
  return pages
}

/**
 * 页数不够下限时，把「两条以上」的页拆成两页——一页只讲一件事，
 * 拆出来的那一页仍是老师课件里的话，不注水、不拿模板句填。
 */
function splitToFill(pages: StudentSlide[], limits: DensityLimits, topic: string): StudentSlide[] {
  const out = pages.slice()
  let guard = 0
  while (out.length < limits.pagesMin && guard++ < 40) {
    let at = -1
    out.forEach((s, i) => {
      const n = (s.items ?? []).length
      if (n < 2) return
      if (s.kind === 'cover' || s.kind === 'goals' || s.kind === 'words') return
      if (at < 0 || n > (out[at].items ?? []).length) at = i
    })
    if (at < 0) break
    const src = out[at]
    const items = src.items ?? []
    const tail = items[items.length - 1]
    const head = items.slice(0, -1)
    const kind: StudentSlideKind = src.kind === 'board' || src.kind === 'homework' ? 'drill' : src.kind
    out.splice(
      at,
      1,
      { ...src, items: head.length ? head : undefined },
      {
        kind,
        title: studentTitle(asTask(tail, kind)) || SLIDE_LABELS[kind],
        notes: deckNotes(kind, topic, tail),
      }
    )
  }
  return out
}

/**
 * 交内置那一叠之前的一遭：上屏的问句收回去（问句是老师嘴上说的，不是学生要看的字）。
 * 只收「收了之后这页仍然有动作」的那种页；一页就靠那句问句站着的，不收，留给 validateSlides 报。
 */
function quietSlides(slides: StudentSlide[]): StudentSlide[] {
  return slides.map((s) => {
    if (s.kind === 'quote') return s
    const line = String(s.line ?? '')
    if (!/[？?]/.test(line)) return s
    const next: StudentSlide = { ...s, line: undefined }
    return hasAskable(next) ? next : s
  })
}

/**
 * 上一次「从课件推学生版」为什么没成（slidesFromDeck 静默退回内置那一叠时的原因）。
 * 跟 illustrate 的 illustCalls() 同一个套路：正常返清空，推不出来时把 validateSlides 的
 * 逐条问题留在这里，离线门禁与现场排错都能说一句人话，不再只看到「退回内置了」。
 */
let lastDeckProblems: string[] = []
export function slidesFromDeckProblems(): readonly string[] {
  return lastDeckProblems
}

/**
 * 老师改定的课件 → 学生版（TASKS/17 §二.3 / TASKS/22 的确定性一半）。
 *
 * 两份产物不是一份：课件是给老师的备课稿，学生版是投到墙上的那一叠。
 * 所以这里不是「一页课件 → 一页学生版」，而是把课件拆成素材，再按学生页型重排：
 * 教师页（设计意图 / 备课清单）与教师话术一句都不进；捞不够页数就整份交内置，不凑数。
 *
 * 两条硬事由这里兜住：老师删掉的页，对应内容一个字都不许出现（素材里根本没有那一页）；
 * 老师改的标题，只要写成学生动作，原样成为学生页大字。
 */
export function slidesFromDeck(
  deck: readonly DeckPage[] | null | undefined,
  plan: LessonPlan,
  limits: DensityLimits = DEFAULT_LIMITS
): StudentSlide[] {
  const mat = deckMaterial(deck)
  const bits = readPlan(plan, limits)
  const topic = bits.topic || '这一课'
  const rebuilt = splitToFill(rebuildFromDeck(mat, bits, limits), limits, topic)
  /* 原文页也算素材：课文原句插进来之后再判够不够页数。
     这里不走 dedupePages：它撞句时会把问句池里的问题填进条目，
     而这一叠是从课件捞出来的，宁可变短也不许擅自插问句。 */
  const deduped = withQuotes(rebuilt, plan, limits)
  if (deduped.length < limits.pagesMin) {
    lastDeckProblems = [
      `这叠课件只捞得出 ${deduped.length} 页学生能用的素材（下限 ${limits.pagesMin} 页），交本课内置那一叠。`,
    ]
    return quietSlides(getBuiltinStudentSlides(plan, limits))
  }
  // 夹完页数仍有某页不合规：宁可交本课内置那一叠，也不交一份过不了导出闸门的成品
  const check = validateSlides(deduped, limits)
  lastDeckProblems = check.ok ? [] : check.problems
  return check.ok ? deduped : quietSlides(getBuiltinStudentSlides(plan, limits))
}

/* ------------------------- 模型输出归一 ------------------------- */

const KIND_ALIASES: [RegExp, StudentSlideKind][] = [
  [/原文|原句|引文|^quote/, 'quote'],
  [/封面|课题|开头|^cover|^title/, 'cover'],
  [/导入|情境|看图|热身|^hook|^intro/, 'hook'],
  [/三件事|目标|任务|^goals?/, 'goals'],
  [/字词|生字|词语|词汇|^words?/, 'words'],
  [/精读|品读|研读课文|重点段|细读|close|^read/, 'close-read'],
  [/对比|比较|迁移|异同|两边|compare/, 'compare'],
  [/板书|结构图|主线|board/, 'board'],
  [/练一练|练习|填空|检测|问答|drill|quiz|exercise/, 'drill'],
  [/作业|课后|回家|^homework/, 'homework'],
  [/收尾|结束|一句话|小结|end|closing/, 'end'],
]

function mapKind(raw: unknown, index: number, total: number): StudentSlideKind {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase()
  if ((SLIDE_KINDS as readonly string[]).includes(text)) return text as StudentSlideKind
  for (const [re, kind] of KIND_ALIASES) if (re.test(text)) return kind
  // 非法或没给：按它在第几页，就近映射到页序上的那一格
  if (total <= SLIDE_PAGE_ORDER.length) return SLIDE_PAGE_ORDER[index] ?? 'close-read'
  const ratio = index / Math.max(1, total - 1)
  return SLIDE_PAGE_ORDER[Math.min(SLIDE_PAGE_ORDER.length - 1, Math.round(ratio * (SLIDE_PAGE_ORDER.length - 1)))]
}

function pickSlidesArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['slides', 'pages', 'list', 'items']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[]
    }
  }
  return []
}

function stringArray(raw: unknown): string[] {
  if (typeof raw === 'string') return raw.split(/[\n；;]+/).map((s) => s.trim()).filter(Boolean)
  if (!Array.isArray(raw)) return []
  return raw.map((s) => String(s ?? '').trim()).filter(Boolean)
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

/** 页序排一遍：close-read 归到 words 之后、compare 之前，end 永远在最后。
   原文页（quote）没有自己的格子：它紧跟在前面那一页的位置上，不往前跳也不往后拖。 */
function orderByPageOrder(slides: StudentSlide[]): StudentSlide[] {
  let prev = 0
  const slots = slides.map((s) => {
    if (s.kind === 'quote') return prev
    prev = SLIDE_PAGE_ORDER.indexOf(s.kind)
    return prev
  })
  return slides
    .map((s, i) => ({ s, i, k: slots[i] }))
    .sort((a, b) => {
      if (a.s.kind === 'end' && b.s.kind !== 'end') return 1
      if (b.s.kind === 'end' && a.s.kind !== 'end') return -1
      if (a.k !== b.k) return a.k - b.k
      return a.i - b.i
    })
    .map((x) => x.s)
}

/**
 * 内置稿三档页数（2026-11-22）：20 分钟 12 页 / 30 分钟 14 页 / 40 分钟 16 页，严格递增。
 *
 * 16 页实料在 40 分钟全上；30 分钟收起最后两页补练；20 分钟再收两页补比。
 * 收的永远是同类后补的页（hook / compare / drill 的第二见及以后），从后往前收；
 * 每种页型的首见页与尾部三页（板书 / 作业 / 收尾）一页不动——短档的骨架还在，
 * 砍掉的恰是拓展料。不这么收，三档都是 16 页，「选时长又没用了」那个老毛病就回来了。
 */
export const BUILTIN_TIER_PAGES: Record<'m20' | 'm30' | 'm40', number> = { m20: 12, m30: 14, m40: 16 }
function trimBuiltinTier(slides: StudentSlide[], duration: number): StudentSlide[] {
  const tier = tierOf(duration)
  if (tier === 'clip') return slides
  const target = BUILTIN_TIER_PAGES[tier]
  if (slides.length <= target) return slides
  const seen: Record<string, number> = {}
  const extra: number[] = []
  slides.forEach((s, i) => {
    const n = (seen[s.kind] = (seen[s.kind] ?? 0) + 1)
    if (n > 1 && (s.kind === 'hook' || s.kind === 'compare' || s.kind === 'drill')) extra.push(i)
  })
  const drop = new Set(extra.slice(-(slides.length - target)))
  return slides.filter((_, i) => !drop.has(i))
}

/** 砍掉重复页型（精读留到本档 closeReadMax、其余留 1），缺的页型按页序补泛化页 */
function fitPageCount(slides: StudentSlide[], bits: PlanBits): StudentSlide[] {
  /*
   * lesson 档不进这套去重：一篇 40 分钟的课天然会有多页「读进去」「练一练」，
   * 每种页型只留一页会把 30 页砍回 10 页，正好是“选了 40 分钟也不变”那个老毛病。
   * 这里只按上限截断，页序保留模型给的环节顺序；不足下限由 validateSlides 判不合格，
   * 整份退回内置的 lessonSlides()（那个保证落在本档区间里）。
   * 尾部三页（板书 / 作业 / 收尾）属于必留，不到最后不丢。
   */
  if (bits.scale === 'lesson') {
    const tailKinds: StudentSlideKind[] = ['board', 'homework', 'end']
    const tail = slides.filter((s) => tailKinds.includes(s.kind)).slice(-3)
    const body = slides.filter((s) => !tail.includes(s))
    const room = Math.max(0, bits.limits.pagesMax - tail.length)
    return dedupePages([...body.slice(0, room), ...tail], bits)
  }

  const out: StudentSlide[] = []
  const seen: Record<string, number> = {}
  for (const s of slides) {
    const n = (seen[s.kind] = (seen[s.kind] ?? 0) + 1)
    const allow = s.kind === 'close-read' ? bits.limits.closeReadMax : s.kind === 'quote' ? QUOTE_PAGE_MAX : 1
    if (n > allow) continue
    out.push(s)
  }
  const trimmed = out.slice(0, bits.limits.pagesMax)

  for (const kind of pageOrderOf(bits)) {
    if (!trimmed.some((s) => s.kind === kind)) {
      trimmed.push(harden(genericPage(kind, bits), bits))
    }
  }
  return dedupePages(orderByPageOrder(trimmed), bits)
}

/** 仿 llm.ts 的 normalize()：非数组/缺字段/kind 非法都能活下来，且不合规就精简到合规 */
/**
 * items 是「材料」，不是「问题」。
 * 模型经常把「读《草原》这一句，哪个词在写声音」塞进 items，于是同一页上正文是原文、
 * 条目问的却是另一件事——学生看到两套话。问句只许写在 line 或 notes 里。
 *
 * 以前这里留了个逃生口：全条都是问句就原样留下，怕把一页清成白板。
 * 真机《桂花雨》第 9 页正是这样漏过去的——line 已经是一句问话，items 里又挂着
 * 「课文写了哪几个地点？」。白板比两套话好收拾：清空之后材料闸会判这一页没材料，
 * 走逐页修补换一张有材料的页，而不是把一句不着边的问话留在投影上。
 */
const ITEM_ASK = /[？?]\s*$/

function cleanItems(items: string[]): string[] {
  return items.filter((t) => !ITEM_ASK.test(String(t ?? '').trim()))
}

export function normalizeSlides(raw: unknown, plan: LessonPlan, limits: DensityLimits = DEFAULT_LIMITS): StudentSlide[] {
  const bits = readPlan(plan, limits)
  const list = pickSlidesArray(raw)
  if (list.length === 0) return []

  const out: StudentSlide[] = []
  let prevTitle = ''
  for (let i = 0; i < list.length && out.length < bits.limits.pagesMax; i++) {
    const data = (list[i] ?? {}) as Record<string, unknown>
    const kind = mapKind(data.kind ?? data.type, i, list.length)
    /* 原文页（TASKS/19a）：模型给的 text 逐字收下，harden 一个字都不碰 */
    if (kind === 'quote') {
      const text = firstString(data.text, data.line, data.title, data.sentence)
      if (text) out.push(quoteSlideOf(text, bits.topic, firstString(data.note) || undefined))
      continue
    }
    const title = firstString(data.title)
    // title 空：接上一页的 title，再没有就封面用课题、其余用页型名
    const useTitle =
      title || prevTitle || (kind === 'cover' ? bits.topic : SLIDE_LABELS[kind])
    prevTitle = title || prevTitle

    const slide: StudentSlide = {
      kind,
      title: useTitle,
      line: firstString(data.line, data.question, data.text, data.sentence),
      items: cleanItems(stringArray(data.items ?? data.points ?? data.words ?? data.bullets ?? data.lines)),
      imageHint: firstString(data.imageHint, data.figureHint, data.searchHint, data.image),
      notes: firstString(data.notes, data.note, data.script, data.speaker),
    }
    /* 封面专有两行（TASKS/25）：模型给了就收，没给由 withCoverMeta 兜 */
    if (kind === 'cover') {
      const meta = firstString(data.meta, data.textbook, data.caption)
      const byline = firstString(data.byline, data.className, data.teacher)
      if (meta) slide.meta = meta
      if (byline) slide.byline = byline
    }
    // 对比页才认这个字段；合法性（条数/字数/语气）由 harden 里的 compareDiffProblems 把关，
    // 不合格就剥掉这一个字段，不整份退回内置（§A 数据契约）。
    if (kind === 'compare' && Array.isArray(data.compareDiff)) {
      slide.compareDiff = stringArray(data.compareDiff)
    }
    out.push(harden(slide, bits))
  }
  return withCoverMeta(withQuotes(fitPageCount(out, bits), plan, limits), plan)
}

/* ------------------------- 总入口 ------------------------- */

export interface SlideProgress {
  /** direct / typeset 是两遍 DeepSeek（TASKS/12），各自只发一次 */
  stage: 'llm' | 'builtin' | 'direct' | 'illust' | 'typeset'
  page?: number
  total?: number
}

export interface BuildSlidesHooks {
  /** llm 阶段只发一次（一次请求换整叠页面）；builtin / illust 阶段带页数 */
  onProgress?: (p: SlideProgress) => void
  /**
   * 页面先在屏幕上亮出来（TASKS/15 §4.2 首屏两段交付）：还没配图，可能还会被导演改版。
   * 只交给「已经定下来要用的那一叠」——不合格、要回退的不在此列。
   */
  onDraft?: (slides: StudentSlide[]) => void
  /** 回退原因，中文一句人话，界面可以直接当提示文案显示 */
  onFallback?: (reason: string) => void
  /** 插画跑完给一句中文：正常时为空，只有额度不足停下时才有（§八④） */
  onIllustrated?: (note: string, used: number) => void
  /** 这一页的纸色：插画四边归一到它（没传就只量不归） */
  paper?: (kind: string) => string
  /**
   * 等「纸」定下来（TASKS/12 硬规矩 8：插画边带要归到真正的纸）。
   * 只在插画前等，不在拼页前等——文字那遍与配纸并行发出去，屏幕先有字（s4 提速）。
   */
  awaitPaper?: () => Promise<void>
  signal?: AbortSignal
}

function requestFailureReason(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return '生成被取消了，先用内置的学生版顶上。'
  const msg = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
  // 接口抛的中文句子直接用人话，带英文（堆栈、原始报错）就换成一句说明
  if (msg && msg.length <= 60 && !/[A-Za-z]{4,}/.test(msg)) {
    return `${msg.replace(/。+$/, '')}，已经改用内置的学生版。`
  }
  return '接口没有回话，已经改用内置的学生版；等网络或 API Key 妥当后再重新生成一次。'
}

function invalidReason(slides: StudentSlide[], check: SlideValidation): string {
  if (slides.length === 0) return '模型没有交出可用的学生版页面，已经改用内置的学生版。'
  const first = check.problems[0] ?? '格式不对'
  return `模型重写的学生版有 ${check.problems.length} 处不合格（${first.slice(0, 40)}），已经改用内置的学生版。`
}

/* ------------------------- 逐页修补（不再整份退回） ------------------------- */

/**
 * 判据里的「第 N 页…」→ 0 基页号；解析不出来返回 -1。
 * 页数区间、空稿这类没有页码的问题是整份的问题，逐页换不掉，只能整份退回。
 */
function pageIndexOf(problem: string): number {
  const m = /^第\s*(\d+)\s*页/.exec(String(problem ?? '').trim())
  return m ? Number(m[1]) - 1 : -1
}

/** 三道闸一起过：格式 / 材料 / 语气，返回都是「第 N 页…」可解析的句子 */
export function auditProblems(slides: StudentSlide[], limits: DensityLimits): string[] {
  return [
    ...validateSlides(slides, limits).problems,
    ...materialProblems(slides),
    ...voiceProblems(slides),
  ]
}

/**
 * 把坏页换成兜底稿里的页面。
 *
 * 挑哪一页：先按相对位置算一个理想位置，再按「同页型 → 不撞句 → 没被别的坏页用掉」由近到远挑，
 * 挑不着才退回理想位置那一页。换进来的页也不能和留下的页说同一句话——否则刚补好的页
 * 下一轮又因为撞句被换，来回打转。
 */
function swapPages(
  slides: StudentSlide[],
  base: readonly StudentSlide[],
  bad: ReadonlySet<number>
): StudentSlide[] {
  const kept = new Set<string>()
  slides.forEach((s, i) => {
    if (bad.has(i)) return
    for (const t of pageSentences(s)) {
      const k = sentenceKey(t)
      if (k) kept.add(k)
    }
  })

  const spent = new Set<number>()
  const out = slides.slice()
  for (const i of [...bad].sort((a, b) => a - b)) {
    const ideal = Math.round((i * (base.length - 1)) / Math.max(1, slides.length - 1))
    const near = base.map((_, j) => j).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))
    const free = (j: number) => !spent.has(j)
    const fits = (j: number) =>
      pageSentences(base[j]).every((t) => {
        const k = sentenceKey(t)
        return !k || !kept.has(k)
      })
    const pick =
      near.find((j) => free(j) && base[j]?.kind === slides[i]?.kind && fits(j)) ??
      near.find((j) => free(j) && fits(j)) ??
      near.find((j) => free(j) && base[j]?.kind === slides[i]?.kind) ??
      near.find(free) ??
      ideal
    spent.add(pick)
    if (base[pick]) out[i] = { ...base[pick] }
    for (const t of pageSentences(out[i])) {
      const k = sentenceKey(t)
      if (k) kept.add(k)
    }
  }
  return out
}

/**
 * 逐页修补：哪页不合格只换那一页，其余照用（TASKS/26）。
 *
 * 为什么要这样：以前一条不合格就整份退回骨架稿——科学与数学各有一篇因为一句
 * 「一片见光，一片遮光」被判对偶整份降级，学生看到的就是「读读这一句」这种空壳。
 * 现在先换页，换完重验，最多三轮；坏页和整页一样多、或问题根本没有页码时才整份退回。
 */
export function repairPages(
  slides: StudentSlide[],
  base: readonly StudentSlide[],
  limits: DensityLimits,
  first: readonly string[]
): { slides: StudentSlide[]; swapped: number; left: string[] } | null {
  if (slides.length === 0 || base.length === 0) return null
  let work = slides
  let problems = [...first]
  const swapped = new Set<number>()
  for (let round = 0; round < 3 && problems.length > 0; round++) {
    const bad = new Set<number>()
    for (const p of problems) {
      const at = pageIndexOf(p)
      if (at >= 0 && at < work.length) bad.add(at)
    }
    // 没有页码（页数区间、空稿）或每一页都坏：换页救不回来，整份退回
    if (bad.size === 0 || bad.size >= work.length) return null
    work = swapPages(work, base, bad)
    bad.forEach((i) => swapped.add(i))
    problems = auditProblems(work, limits)
  }
  /* 三轮下来还剩几条（典型是「这一页没有能问出口的话」这种换页也修不掉的），
     2026-11-22 起不再整份退回：整份退回的代价是学生拿到一套模板骨架稿——
     用户指着骂的「一张图配几颗字」就是它。几页不够好，远比整份换成骨架稿轻。
     剩下的这几条通过 left 交上去，界面上照实说哪几页要老师看一眼。
     真正救不回来的两种情况仍整份退回：一条页码都定位不到（页数 / 空稿）、
     或每一页都坏（那不是修补的事）。 */
  if (problems.length > 0 && problems.length >= work.length) return null
  return { slides: work, swapped: swapped.size, left: problems }
}

/* ------------------------- 语气闸门（TASKS/08 §D） ------------------------- *
 * 这一页备注讲给学生听，用的是 voice.ts 的 classroom 档案：规则与正反例在
 * prompt.ts 里注入（buildStudentSlidesPrompt），命中判定在这里把关——两边同一
 * 判定源，不各写一套正则。defense 档案不住这条路径上（答辩预案在备课包那一次
 * 调用里生成，注入点在 prompt.ts 的 SYSTEM_PROMPT），此处只负责 classroom。
 * 内置四篇与泛化路径不过这道闸：它们是人工稿，硬命中由 scripts/check-voice.ts
 * 在离线门禁里逐条打出来，改稿是人的事，不是运行时偷偷改写文字的事。
 * -------------------------------------------------------------------------- */

/** 模型交出的学生版有哪些地方踩了 §D.2 的句式与禁词，返回可以直接给人看的一行句 */
function voiceProblems(slides: StudentSlide[]): string[] {
  const entries: VoiceDocEntry[] = slides.flatMap((s, i) => [
    {
      doc: 'llm',
      field: `第 ${i + 1} 页.页面文字`,
      text: pageVisibleText(s).join(' '),
      slot: 'classroom' as const,
    },
    { doc: 'llm', field: `第 ${i + 1} 页.notes`, text: String(s.notes ?? ''), slot: 'classroom' as const },
  ])
  const report = scanVoiceDocs(entries, { questionFields: /notes$/ })
  return report.problems.map(
    (p) => `${p.entry.field}出现「${p.label}」（${p.matched}）`
  )
}

/**
 * 配插画开没开（TASKS/11 第 4 步）：默认关——只有设置里显式写 'on' 才画。
 * 导出来给界面与门禁用，判断只写这一处：两边各写一个三目迟早会口径不一致。
 */
export function illustEnabled(cfg?: Pick<LLMConfig, 'illust'> | null): boolean {
  return cfg?.illust === 'on'
}

/**
 * 给这一叠过两遍导演（TASKS/12）：
 *   第一遍定画法 → 出图 → 图上量数字 → 第二遍按实际画排每一页。
 *
 * 没 Key 也照样配图（TASKS/13）：没填 key 就走同源代理，服务端注入 Authorization，
 * 所以这里**不许**再按「浏览器里有没有 key」决定画不画——那条件一留，
 * 所有人导出的 PPT 都会一张图没有。画什么必须由导演定，绝不许退回正则挑页。
 * 任何一遍挂了都不抛：这一页不画 / 版式按确定性规则落地，页面本身照常交付。
 *
 * 另一道门是「配插画」本身默认关：一页图要等十几秒、一份最多 6 张，
 * 打开才走下面这两遍，不打开就只交纯文字版（页型、导出、换模板一样不少）。
 */
async function withDirector(
  plan: LessonPlan,
  cfg: LLMConfig,
  slides: StudentSlide[],
  hooks?: BuildSlidesHooks
): Promise<StudentSlide[]> {
  if (slides.length === 0) return slides
  /* 默认关：不图、不请求、不报错，也不在黑板上挂一句「未配图」——
     用户没开这个开关，就不该在界面上被这件事提醒一次 */
  if (!illustEnabled(cfg)) return withPulls(slides, plan)
  // 配纸与拼页并行：到这里字已经在屏幕上，只差插画——插画的边带必须归到真正的纸
  await hooks?.awaitPaper?.()
  if (hooks?.signal?.aborted) return withPulls(slides, plan)
  try {
    const { slides: next, report } = await runDeckDirector({
      slides,
      cfg: {
        /*
         * 文本与生图用同一把 key、同一个 baseUrl：有 key = 自带额度直连，没 key = 同源代理。
         * 这里不许再看「浏览器里有没有 key」——落点只由 endpointOf 裁决（TASKS/15 块 A）。
         */
        llm: { baseUrl: cfg.baseUrl, apiKey: String(cfg.apiKey ?? '').trim(), model: cfg.model },
        image: {
          baseUrl: cfg.baseUrl,
          apiKey: String(cfg.apiKey ?? '').trim(),
          model: String(cfg.imageModel ?? '').trim() || ILLUST_MODEL,
        },
      },
      meta: {
        topic: String(plan?.meta?.topic ?? ''),
        grade: plan?.meta?.grade,
        subject: plan?.meta?.subject,
        duration: plan?.meta?.duration,
        allow: allowFor(plan?.meta?.duration ?? 0),
        paper: hooks?.paper,
      },
      cache: { plan: directorCache, art: illustCache },
      signal: hooks?.signal,
      onStage: (stage, page, total) =>
        hooks?.onProgress?.({ stage: stage === 'illust' ? 'illust' : stage, page, total }),
    })
    if (report.note) hooks?.onIllustrated?.(report.note, report.drawn)
    /* 图已定：先让模型单独指一遍句子（没图的页才有引文块），再逐字校验一遍。
       两趟顺序不能反——校验要知道这一页到底有没有画。 */
    const pulled = await fillPulls(next, plan, cfg, hooks?.signal)
    return withPulls(pulled, plan)
  } catch (e) {
    /* 不许静默（2026-11-23 真机：图全画成了，收尾某一步抛错，整份图被无声扔掉，
       用户只看到「又没有插画」）。把真实原因摆到界面上，下次一眼就知道卡在哪。 */
    const msg = e instanceof Error ? e.message : String(e)
    hooks?.onFallback?.(`配图收尾出错（${msg.slice(0, 80)}），这一份先交无图版式；再点一次生成通常就好。`)
    return withPulls(slides, plan)
  }
}

/**
 * 出一份学生版课堂 PPT。
 * - 不管浏览器里有没有 key，都走模型：落点由 endpointOf 裁决——没 key 走同源代理，
 *   有 key 用老师自己的额度直连（TASKS/15 块 A：业务层不许再判断 key）。
 * - 模型那遍不合格或请求失败时回退内置数据，并通过 onFallback 说清原因，绝不静默。
 * - 两条路最后都过两遍导演（定画法 → 回读数字 → 排版），部分页配上绘本插画。
 */
export async function buildStudentSlides(
  plan: LessonPlan,
  cfg: LLMConfig,
  hooks?: BuildSlidesHooks,
  /**
   * 老师已经改定的课件（TASKS/17 §二.3）。有它时：
   *   · prompt 里多一段「以这一叠为准」的硬约束；
   *   · 模型接不上时交出去的是从这一叠推出来的页（slidesFromDeck），
   *     不是本课内置那一叠——老师删掉/加进去的页不能白改。
   */
  edited?: readonly DeckPage[]
): Promise<StudentSlide[]> {
  const signal = hooks?.signal
  const cancelled = () => Boolean(signal?.aborted)
  // 档位：Settings 锁到具体档就按那一档 clamp/校验；'auto'/未锁 → 三档并集，模型自选不被误伤。
  // 页数不走密度档，改走时长规模（09 §S / 10 §十二）：20 / 30 / 40 分钟各 一档，4 分钟 10–14 页。
  const scale = scaleOf(plan?.meta?.duration)
  const limits = limitsFor(cfg?.density, scale, plan?.meta?.duration)
  const deckStack = Array.isArray(edited) && edited.length > 0 ? edited : null
  /** 兜底那一叠：内置示范课、或从老师改定的课件推出来；顺手挂载预置 16:9 无字插画 */
  const builtinPages = () =>
    attachBuiltinArt(
      deckStack ? slidesFromDeck(deckStack, plan, limits) : getBuiltinStudentSlides(plan, limits),
      String(plan?.meta?.topic ?? '')
    )
  const useBuiltin = () => {
    const slides = builtinPages()
    hooks?.onProgress?.({ stage: 'builtin', page: slides.length, total: slides.length })
    // 内置页也先亮出来：评委会看到「已经有一份了」，而不是干等插图
    hooks?.onDraft?.(slides)
    return slides
  }

  hooks?.onProgress?.({ stage: 'llm', page: 1, total: 1 })
  try {
    const { system, user } = buildStudentSlidesPrompt(plan, cfg.density ?? 'auto', scale, deckStack ?? undefined)
    const raw = await postChatJson(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      cfg,
      signal
    )
    // 请求已在飞的时候被外部 signal 取消：对调用方表现为「取消、交出空」，
    // 既不降级、也不把这一份半截结果缓存下去（任务 #2 的幽灵下载由此被斩断）。
    if (cancelled()) return []
    const slides = padPages(
      withMotif(normalizeSlides(raw, plan, limits), plan?.meta?.subject),
      plan,
      limits
    ).map((s) => (s.items && s.items.length ? { ...s, items: cleanItems(s.items) } : s))
    /* 补页（padPages）会从问题池里抽句子塞进 items：抽出来的问句不许留在条目里
       （TASKS/22 §六.1，真机《狼牙山五壮士》第 10 页漏了三条）。normalizeSlides 那道
       cleanItems 只管网模原稿，这里对「即将上屏的那一叠」再幂等洗一遍。 */
    /* 三道闸（格式 / 材料 / 语气）以前是一票否决：一处不合格就整份换回骨架稿，
       学生看到的反而是「读读这一句」这种空壳。现在先逐页换：哪页不合格只换那一页。 */
    const problems = auditProblems(slides, limits)
    const repaired = problems.length ? repairPages(slides, builtinPages(), limits, problems) : null
    if (problems.length && !repaired) {
      hooks?.onFallback?.(invalidReason(slides, validateSlides(slides, limits)))
      return withDirector(plan, cfg, useBuiltin(), hooks)
    }
    const done = repaired?.slides ?? slides
    /* 2026-11-22 用户拍板「40 分钟要撑满」：模型交少了不靠提示词碰运气——
       整节课按区间中位数当撑满线（m40 25 / m30 20 / m20 16），不足就用还没上屏的
       课文原句与教案素材补（padPages 补不出就如实少，绝不编页）。 */
    const range = slideRangeFor(Number(plan?.meta?.duration ?? 0))
    const floor =
      scaleOf(plan?.meta?.duration) === 'lesson'
        ? Math.min(limits.pagesMax, Math.max(limits.pagesMin, Math.round((range.min + range.max) / 2)))
        : limits.pagesMin
    const filled = done.length < floor ? padPages(done, plan, { ...limits, pagesMin: floor }) : done
    /* 凝练（2026-11-23 用户拍板「修，必须修」）：撑页数的补页会带进重复原文页与
       碎片页，模型自己也常交同一道练习的两半。这里把水页凝掉——密度优先于页数，
       宁可少几页，不让「一张图配几颗字」的页上屏。 */
    const condensed = condenseSlides(filled)
    if (repaired && (repaired.swapped > 0 || repaired.left.length > 0)) {
      /* 说法分两种：全修好了就说修好了；还剩几条就照实说哪一页要老师看一眼。
         以前一律说「已换成兜底页」，可整份退回时换掉的是全部页，说"这几页"是假话。 */
      const first = problems[0].slice(0, 40)
      hooks?.onFallback?.(
        repaired.left.length > 0
          ? `模型交出的学生版有 ${repaired.swapped} 页不合格（${first}），已把这几页换成兜底页；另有 ${repaired.left.length} 处要老师看一眼：${repaired.left[0].slice(0, 30)}`
          : `模型交出的学生版有 ${repaired.swapped} 页不合格（${first}），已把这几页换成兜底页，其余照用。`
      )
    }
    // 页面先上屏（无图），导演那两遍跑完再整叠换掉：右栏从第一段起就有东西可看
    hooks?.onDraft?.(condensed)
    return withDirector(plan, cfg, condensed, hooks)
  } catch (e) {
    // 区分「外部取消」与「请求自身失败」：signal 已 abort 就是取消，别误报成超时/失败，
    // 直接交出空让上层按取消处理；只有没被取消时才当成接口故障走内置回退。
    if (cancelled()) return []
    hooks?.onFallback?.(requestFailureReason(e))
    return withDirector(plan, cfg, useBuiltin(), hooks)
  }
}

/* ------------------------- 场景：从课件那一叠推导到学生这一叠 ------------------------- */

/**
 * 把教师课件那一叠的场景按位置搬到学生版上。
 *
 * 为什么是「按位置」而不是「按页型」：两叠的页数、页序本来就不同（学生版是重新表达的），
 * 能对上的只有大致位置。所以每页取「同一相对位置」的那一页课件——课件那页有场景，
 * 学生这页才有；课件那页留白，这里也留白。推导不出来就一个都不画，
 * 宁可整份没有动效，也不许为了“动态版”三个字凭空下雪、凭空飘花瓣。
 *
 * 学生版比课件多页时（例：40 分钟 27 页对 24 页），相邻两页会落到同一张课件页上 。
 * 场景只跟着课件页走一次：同一张课件页不许在两页学生版上各放一遍，
 * 否则“3 页场景”会变四页，且相邻两页放同一个动效。
 */
export function applySlideScenes(
  slides: StudentSlide[],
  deck: readonly DeckPage[] | null | undefined
): StudentSlide[] {
  const list = Array.isArray(slides) ? slides : []
  const pages = deck ?? []
  if (list.length === 0) return []
  if (pages.length === 0) return list.map((s) => (s.scene ? { ...s, scene: '' } : s))

  const spent = new Set<number>()
  return list.map((s, i) => {
    const at = Math.round((i * (pages.length - 1)) / Math.max(1, list.length - 1))
    const want = spent.has(at) ? '' : pages[at]?.scene
    if (!isSceneKind(want)) return s.scene ? { ...s, scene: '' } : s
    spent.add(at)
    return s.scene === want ? s : { ...s, scene: want }
  })
}

/** 这一叠里有没有一个场景：没有就不叫「动态版」，下载按钮得如实写上「本课无动态」 */
export function hasSlideScenes(slides: readonly StudentSlide[] | null | undefined): boolean {
  return (slides ?? []).some((s) => isSceneKind(s?.scene))
}
