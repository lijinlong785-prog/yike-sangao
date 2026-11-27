import type { StudentSlideKind } from './slides'

/**
 * 学科包：学生版里所有「跟学科有关」的默认话术都收在这里。
 *
 * 第二十一轮之前，兜底问句池只有一套语文的（「你闻到过这个味儿吗？」），
 * 于是《长方体的认识》第 19 页出现了这句话——数学课上问学生闻到什么味儿。
 * 「字词关」同样不分学科往每节课上塞，默认目标里还写着「读出感情」。
 *
 * 这里按学科分开：语文 / 数学 / 英语 / 科学 + 认不出学科时的中性包。
 * 中性包刻意不用任何语文感官词，因为认不出学科时，宁可说得平淡，也不许说出桂花味。
 */
export type SubjectKey =
  | 'chinese'
  | 'math'
  | 'english'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'geography'
  | 'science'
  | 'other'

export function subjectKeyOf(raw: unknown): SubjectKey {
  const s = String(raw ?? '')
  if (/语文|国学|阅读|习作|古诗|文言|写字/.test(s)) return 'chinese'
  if (/数学|算术/.test(s)) return 'math'
  if (/英语|英文|外语/.test(s)) return 'english'
  /* 物理 / 化学 / 生物 / 地理四科必须分开（2026-11-22 用户拍板）：
     以前四科全落进 science，于是化学课的词页问「这几个词，分别指什么？」、
     物理课的目标写「先看仔细，动手做一次」——理科老师一眼就看出不对。
     先判具体科，再落到「科学」这个小学科的筐里。 */
  if (/物理/.test(s)) return 'physics'
  if (/化学/.test(s)) return 'chemistry'
  if (/生物/.test(s)) return 'biology'
  if (/地理/.test(s)) return 'geography'
  if (/科学|自然|常识/.test(s)) return 'science'
  return 'other'
}

/**
 * 只属于语文课的经验词。数学 / 英语 / 科学 / 中性包里出现任何一个都算跑题，
 * 生成侧不产出、校验侧扫到即失败（「闻到、味儿、朗读、感情、品一品」）。
 */
export const CHINESE_ONLY_WORDS = ['闻到', '味儿', '朗读', '感情', '品一品', '品品'] as const

export type SubjectPack = {
  key: SubjectKey
  label: string
  /** 有没有「字词关」这一页：只有语文、英语有字词；数学、科学不上这一页 */
  hasWords: boolean
  /** 一页兜底问句（同一学科、同一页型内部两选一） */
  ask: (kind: StudentSlideKind, topic: string) => string
  /** 同一学科、同一页型的整池问句——撞句换句时先在这一池里找，不去别的段里拆东墙补西墙 */
  pool: (kind: StudentSlideKind, topic: string) => string[]
  /** 「今天三件事」的三条默认条目（不带①②③） */
  tasks: (text: string) => string[]
  /** 收束页的标题：板书那一行已经被占时用它（按学科说学生这一课带走什么） */
  closing: (topic: string) => string
}

/**
 * 页型 × 学科的问句池（TASKS/17 §四.2.2）。
 *
 * 这套句子已经**降级为兜底**：正常路径上，页面标题与条目都由本课的原文、字词、
 * 板书链条、作业自己出（见 slides.ts 的 goalTasks / genericPage），这里只在
 * 「模型没写出这一页的话」时顶一句。
 *
 * 三条硬规矩：
 *   1. 每对的第一句（有课题时真正上屏的那句）必须带 `{topic}`——一句不含任何本课词的
 *      问话，投到哪一课都成立，也投到哪一课都不对；
 *   2. 不问「哪一件 / 哪一行 / 哪一句最重」——那是要学生猜老师心里想什么。
 *      只问两类：课本里看得见的东西，或学生当下要做的动作。
 *      判断一句话：这句话投到墙上，学生能不能立刻动手？
 *   3. 每一句都必须是个问句（带问号）。这一池的消费方是 pickQuestion / ensureQuestion，
 *      它们只负责往「这一页缺一个问句」的位置上填空；填进去一句祈使句，
 *      hasQuestion 照样是假，页面会被反复补问句，目标页能长到五行字。
 *      但问句的主语必须学生自己——「谁读准」「谁读给大家听」是老师点名，TASKS/22 §3.1 已删净。
 */
/* 原文页（quote）不在问句池里：原文页只放课文原句，不补问句，所以这里可以不写它。 */
const ASKS: Record<SubjectKey, Partial<Record<StudentSlideKind, string[]>>> = {
  chinese: {
    cover: ['《{topic}》这个题目里，你认得哪几个字？', '这个题目里，你认得哪几个字？'],
    hook: ['《{topic}》里写的这个场面，你碰上过吗？', '这个场面，你碰上过吗？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个词，你能读准几个？', '这几个词，你能读准几个？'],
    'close-read': ['读《{topic}》这一句，哪个词在写声音？', '这一句里，哪个词在写声音？'],
    compare: ['《{topic}》这两处，差在哪？', '这两处，差在哪？'],
    board: ['《{topic}》这三行，能照顺序说一遍吗？', '照黑板这三行，能按顺序说一遍吗？'],
    drill: ['《{topic}》这一段，你先试哪一步？', '这一段，你先试哪一步？'],
    homework: ['《{topic}》这两件事，今晚先做哪一件？', '这两件事，今晚先做哪一件？'],
    end: ['《{topic}》这一课，你带走哪一句？', '这一课，你带走哪一句？'],
  },
  math: {
    /* 封面不要再把课题加上引号重复一遍（「长方体的认识」，先数什么？—— 数学老师看了会皱眉）：
       也不要写「这个形状」——《比大小》是数的大小，没有形状可看。只问数与量。 */
    cover: ['《{topic}》这一课，先看手边哪一样？', '手边这几样，先看哪一样？'],
    hook: ['《{topic}》桌上这几样，哪儿不一样？', '桌上这几样，哪儿不一样？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这一步，先算哪个？', '这一步，先算哪个？'],
    'close-read': ['《{topic}》这一步，为什么这样做？', '这一步，为什么这样做？'],
    compare: ['《{topic}》两边，差在哪？', '两边，差在哪？'],
    board: ['《{topic}》这三行，能一行一行算下来吗？', '照黑板这三行，能一行一行算下来吗？'],
    drill: ['《{topic}》你先算哪一步？', '你先算哪一步？'],
    homework: ['《{topic}》这两题，你今晚先算哪一题？', '这两题，你今晚先算哪一题？'],
    end: ['《{topic}》今天这几个数，你记住哪个？', '今天这几个数，你记住哪个？'],
  },
  english: {
    cover: ['《{topic}》这一课，先听还是先说？', '这一课，先听还是先说？'],
    hook: ['《{topic}》图上这些，英语怎么说？', '图上这些，英语怎么说？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个词，你能读准几个？', '这几个词，你能读准几个？'],
    'close-read': ['读《{topic}》这一句，哪个词是新的？', '这一句里，哪个词是新的？'],
    compare: ['《{topic}》这两句，哪儿不一样？', '这两句，哪儿不一样？'],
    board: ['《{topic}》这三句，能按顺序说一遍吗？', '照黑板这三句，能按顺序说一遍吗？'],
    drill: ['《{topic}》你先说哪一句？', '你先说哪一句？'],
    homework: ['《{topic}》这两件，先说给谁听？', '这两件，先说给谁听？'],
    end: ['《{topic}》今天这句，你会说了吗？', '今天这句，你会说了吗？'],
  },
  physics: {
    /* 物理只问三样：看得见的现象、要读的数、要动的这一次。
       不问「这个规律说明了什么」——那是要学生猜教参。 */
    cover: ['《{topic}》这一课，先看哪个现象？', '先看哪个现象？'],
    hook: ['《{topic}》这样一动，什么变了？', '这样一动，什么变了？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个量，各读什么数？', '这几个量，各读什么数？'],
    'close-read': ['《{topic}》这一次，力是往哪儿使的？', '这一次，力是往哪儿使的？'],
    compare: ['《{topic}》这两次，哪儿不一样？', '这两次，哪儿不一样？'],
    board: ['《{topic}》这几行，能照着算一遍吗？', '照黑板这几行，能照着算一遍吗？'],
    drill: ['《{topic}》你先测哪一个？', '你先测哪一个？'],
    homework: ['《{topic}》这两题，今晚先算哪一题？', '这两题，今晚先算哪一题？'],
    end: ['《{topic}》这个现象，家里哪儿能看见？', '这个现象，家里哪儿能看见？'],
  },
  chemistry: {
    /* 化学只问：变没变、变成什么、凭哪一条看得出来。不问「这说明了什么性质」 */
    cover: ['《{topic}》这一课，先看哪一瓶？', '先看哪一瓶？'],
    hook: ['《{topic}》它变了，还是没变？', '它变了，还是没变？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个符号，各代表什么？', '这几个符号，各代表什么？'],
    'close-read': ['《{topic}》这一步，凭什么说它变了？', '这一步，凭什么说它变了？'],
    compare: ['《{topic}》这两瓶，哪儿不一样？', '这两瓶，哪儿不一样？'],
    board: ['《{topic}》这个式子，能照着写一遍吗？', '这个式子，能照着写一遍吗？'],
    drill: ['《{topic}》你先做哪一步？', '你先做哪一步？'],
    homework: ['《{topic}》这两题，今晚先写哪一个？', '这两题，今晚先写哪一个？'],
    end: ['《{topic}》这个变化，你在哪儿见过？', '这个变化，你在哪儿见过？'],
  },
  biology: {
    /* 生物只问：这是哪一处、它干什么用、动过之后哪儿不同。不问「生命的意义」 */
    cover: ['《{topic}》这一课，先看哪一个？', '先看哪一个？'],
    hook: ['《{topic}》它哪一处还在动？', '它哪一处还在动？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个词，各指哪一处？', '这几个词，各指哪一处？'],
    'close-read': ['《{topic}》这一处，是干什么用的？', '这一处，是干什么用的？'],
    compare: ['《{topic}》这两样，哪儿不一样？', '这两样，哪儿不一样？'],
    board: ['《{topic}》这几行，能照顺序说一遍吗？', '照黑板这几行，能照顺序说一遍吗？'],
    drill: ['《{topic}》你先标出哪一处？', '你先标出哪一处？'],
    homework: ['《{topic}》这两件，今晚先做哪一件？', '这两件，今晚先做哪一件？'],
    end: ['《{topic}》这个东西，你在哪儿见过？', '这个东西，你在哪儿见过？'],
  },
  geography: {
    /* 地理只问图上的东西：哪儿高、哪儿低、为什么在这儿。不问「你感受到祖国的辽阔」 */
    cover: ['《{topic}》这一课，先看哪张图？', '先看哪张图？'],
    hook: ['《{topic}》这张图上，哪儿最高？', '这张图上，哪儿最高？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个词，各指图上的什么？', '这几个词，各指图上的什么？'],
    'close-read': ['《{topic}》这一处，为什么在这个位置？', '这一处，为什么在这个位置？'],
    compare: ['《{topic}》这两地，哪儿不一样？', '这两地，哪儿不一样？'],
    board: ['《{topic}》这几行，能照着说一遍吗？', '照黑板这几行，能照着说一遍吗？'],
    drill: ['《{topic}》你先在图上标哪一处？', '你先在图上标哪一处？'],
    homework: ['《{topic}》这两题，今晚先做哪一题？', '这两题，今晚先做哪一题？'],
    end: ['《{topic}》这个地方，你在哪儿听过？', '这个地方，你在哪儿听过？'],
  },
  science: {
    cover: ['《{topic}》这一课，先看哪一样？', '这一课，先看哪一样？'],
    hook: ['《{topic}》先看，它变了没有？', '先看，它变了没有？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个词，分别指什么？', '这几个词，分别指什么？'],
    'close-read': ['《{topic}》为什么会这样？', '为什么会这样？'],
    compare: ['《{topic}》两边，差在哪？', '两边，差在哪？'],
    board: ['《{topic}》这几行，能照顺序说一遍吗？', '照黑板这几行，能按顺序说一遍吗？'],
    drill: ['《{topic}》你先试哪一步？', '你先试哪一步？'],
    homework: ['《{topic}》这两件，今晚先做哪一件？', '这两件，今晚先做哪一件？'],
    end: ['《{topic}》这个现象，你在哪儿见过？', '这个现象，你在哪儿见过？'],
  },
  other: {
    cover: ['《{topic}》这一课，先弄清楚什么？', '这一课，先弄清楚什么？'],
    hook: ['《{topic}》先看这一样，它像什么？', '先看这一样，它像什么？'],
    goals: ['《{topic}》三件事，能一件一件做完吗？', '三件事，能一件一件做完吗？'],
    words: ['《{topic}》这几个词，分别指什么？', '这几个词，分别指什么？'],
    'close-read': ['《{topic}》这一步，为什么这样做？', '这一步，为什么这样做？'],
    compare: ['《{topic}》两边，差在哪？', '两边，差在哪？'],
    board: ['《{topic}》这几行，能照顺序说一遍吗？', '照黑板这几行，能按顺序说一遍吗？'],
    drill: ['《{topic}》你先试哪一步？', '你先试哪一步？'],
    homework: ['《{topic}》这两件，今晚先做哪一件？', '这两件，今晚先做哪一件？'],
    end: ['《{topic}》这一课，你带走哪一句？', '这一课，你带走哪一句？'],
  },
}

/** 「今天三件事」的条目：先按学科找关键词，凑不满三条再补该学科的通用动作 */
const TASKS: Record<SubjectKey, { re: RegExp; task: string }[]> = {
  chinese: [
    { re: /读|朗读|诵读/, task: '读通课文' },
    { re: /说|讲|交流|表达/, task: '说出想法' },
    { re: /写|仿写|练笔/, task: '写一段' },
    { re: /演|表演|分角色/, task: '演一遍' },
    { re: /背|背诵/, task: '背下来' },
    { re: /圈|画出|找出|勾/, task: '找出那句话' },
  ],
  math: [
    { re: /量|称|测量/, task: '量一量' },
    { re: /数/, task: '数一数' },
    { re: /搭|摆|拼|剪|折|画/, task: '动手摆一摆' },
    { re: /算|计算/, task: '算一算' },
    { re: /比较|比一比|多少|大小/, task: '比一比' },
    { re: /规律|发现/, task: '找出规律' },
    { re: /记录|记下|填/, task: '记下来' },
    { re: /说|讲|解释|表达/, task: '说清为什么' },
  ],
  english: [
    { re: /读|朗读/, task: '读准词' },
    { re: /听/, task: '听懂这一句' },
    { re: /说|对话|开口/, task: '开口说' },
    { re: /写/, task: '写下来' },
    { re: /演|表演|角色/, task: '演一遍' },
  ],
  physics: [
    { re: /测|量|读|读数/, task: '量一量，记个数' },
    { re: /算|计算|求/, task: '算一算' },
    { re: /画|作图|受力/, task: '画出受力' },
    { re: /实验|做|动手/, task: '动手做一次' },
    { re: /比较|比一比|变化/, task: '比一比两次' },
    { re: /说|解释|为什么/, task: '说清为什么' },
  ],
  chemistry: [
    { re: /实验|做|操作/, task: '动手做一次' },
    { re: /观察|颜色|现象|看/, task: '看颜色变化' },
    { re: /写|方程式|式子/, task: '写出式子' },
    { re: /记录|记下|填/, task: '记下现象' },
    { re: /比较|对比|区别/, task: '比一比两瓶' },
    { re: /说|解释|原因/, task: '说清为什么' },
  ],
  biology: [
    { re: /观察|看|标本/, task: '看仔细' },
    { re: /画|标|指/, task: '标出部位' },
    { re: /实验|做|培养/, task: '做一次' },
    { re: /比较|对比|区别/, task: '比一比两样' },
    { re: /记录|记下|填/, task: '记下变化' },
    { re: /说|解释|作用/, task: '说清用处' },
  ],
  geography: [
    { re: /读图|看图|地图|图/, task: '读一遍图' },
    { re: /标|填|画/, task: '标在图上' },
    { re: /算|计算|量/, task: '算一算' },
    { re: /比较|对比|差异/, task: '比一比两地' },
    { re: /说|解释|为什么|原因/, task: '说清为什么' },
  ],
  science: [
    { re: /观察|看/, task: '先看仔细' },
    { re: /实验|做|操作/, task: '做一次' },
    { re: /记录|记下|画/, task: '记下变化' },
    { re: /比较|对比/, task: '比一比' },
    { re: /说|解释|原因/, task: '说清为什么' },
  ],
  other: [
    { re: /看|观察/, task: '先看仔细' },
    { re: /做|试|操作/, task: '动手试一次' },
    { re: /说|讲|解释/, task: '说清为什么' },
    { re: /记|写|填/, task: '记下来' },
  ],
}

/** 关键词一个都对不上时的三条，仍然按学科分——数学不会拿到「读出感情」 */
const TASK_FALLBACK: Record<SubjectKey, string[]> = {
  chinese: ['读全篇，圈出生字词', '找出写景的那两句', '照样子写一句'],
  math: ['数一数，记个数', '动手摆一摆', '说清为什么'],
  english: ['读准这几个词', '开口说一句', '听懂这一句'],
  physics: ['先看现象变了没有', '量一个数，记下来', '说清为什么'],
  chemistry: ['先看颜色变没变', '写一遍这个式子', '说清为什么'],
  biology: ['先看仔细', '标出图上这几处', '说清它干什么用'],
  geography: ['先把图读一遍', '在图上标出一处', '说清为什么在这儿'],
  science: ['先看仔细', '动手做一次', '说清为什么'],
  other: ['先看仔细', '动手试一次', '说清为什么'],
}

const LABELS: Record<SubjectKey, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  geography: '地理',
  science: '科学',
  other: '综合',
}

/** 收束页标题的最后一手：不编课文，只说这一科这一课要带走的是什么 */
const CLOSING: Record<SubjectKey, (topic: string) => string> = {
  chinese: () => '这一课带走的那一句',
  math: () => '这一课数出来的几个数',
  english: () => '今天要说顺的这几句',
  physics: () => '这一课看清的那个现象',
  chemistry: () => '这一课看清的那个变化',
  biology: () => '这一课认下的那一处',
  geography: () => '这一课读懂的那张图',
  science: () => '这一课看清的那件事',
  other: () => '这一课弄清的那件事',
}

export function packOf(raw: unknown): SubjectPack {
  const key = subjectKeyOf(raw)
  const pool = (kind: StudentSlideKind, topic: string): string[] => {
    const list = ASKS[key][kind] ?? ASKS[key].end ?? []
    const t = String(topic ?? '').trim()
    return list.map((q) => q.replace(/\{topic\}/g, t || '这一课'))
  }
  const ask = (kind: StudentSlideKind, topic: string): string => {
    const t = String(topic ?? '').trim()
    const list = pool(kind, topic)
    return (t ? list[0] : list[1]) ?? list[0]
  }
  const tasks = (text: string): string[] => {
    const src = String(text ?? '')
    const out: string[] = []
    for (const { re, task } of TASKS[key]) {
      if (re.test(src) && !out.includes(task)) out.push(task)
      if (out.length === 3) break
    }
    for (const t of TASK_FALLBACK[key]) {
      if (out.length >= 3) break
      if (!out.includes(t)) out.push(t)
    }
    return out.slice(0, 3)
  }
  return {
    key,
    label: LABELS[key],
    /* 术语页（words）：语文 / 英语是字词，物理 / 化学是符号与单位——
       这两科不背符号，后面每一页都读不下去。
       生物 / 地理的名词靠正文带（「叶绿体」「等高线」在图上指着说更清楚），
       单独摆一页词表反而把课打碎了。 */
    hasWords: key === 'chinese' || key === 'english' || key === 'physics' || key === 'chemistry',
    ask,
    pool,
    tasks,
    closing: CLOSING[key],
  }
}

/** 非语文课里出现了语文专属词：返回命中的词，没命中给空数组 */
export function chineseOnlyHits(text: string, key: SubjectKey): string[] {
  if (key === 'chinese') return []
  const s = String(text ?? '')
  return CHINESE_ONLY_WORDS.filter((w) => s.includes(w))
}
