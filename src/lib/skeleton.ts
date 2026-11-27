/**
 * 通用骨架稿（TASKS/15 §3.3 B3-b）：模型三级链全挂时，接住任何课题。
 *
 * 三条硬规矩：
 *   1. 不编课文：段里的字只写「这一段要解决什么」「这里留一个学生活动」，
 *      不写任何具体课文内容、不假装读过这篇文章；
 *   2. 标题只用课题本身，页内文案全走结构提示；
 *   3. 配色不在这里定——由 builtinScheme 按课题意象 / 学科中性纸挑，
 *      与离线内置课走同一条路（student.ts 的 catch 直接吃这一套）。
 *
 * 环节模板按「学科 + 学段」选；时长按 scaleOf() 分档：片段 4 段、整节课 6 段。
 * 后面的 planForScale() 会再按 20 / 30 / 40 分钟挑环节、改比例，所以这里给 6 段最稳。
 */
import type { LessonInput, LessonPlan, Pause, Segment } from '../types'
import { scaleOf } from './scale'

type Template = { name: string; goal: string; teacher: string; student: string; ask: string }

const PRIMARY = '小学'
const SECONDARY = '中学'

/** 语文：导入 → 初读 → 精读 → 品析 → 迁移 → 小结 */
const CHINESE: Template[] = [
  {
    name: '导入',
    goal: '这一段要解决什么：让学生带着一个问题进课文，不要先给结论。',
    teacher: '这里留一个教师动作：提一个和课题有关的问题，问完就停。',
    student: '自己说一句，说完举手。',
    ask: '题目里的这个东西，你在哪儿见过或用过？',
  },
  {
    name: '初读',
    goal: '这一段要解决什么：把课文读通，读不准的字词圈出来。',
    teacher: '这里留一个教师动作：给足朗读时间，只收问题，不急着讲。',
    student: '自由朗读，圈出不认识的字词。',
    ask: '哪些地方你读不顺？',
  },
  {
    name: '精读',
    goal: '这一段要解决什么：盯住最能说明问题的那一段，一句一句读。',
    teacher: '这里留一个教师动作：挑一段投出来，带着学生一句一句往下读。',
    student: '找出关键的一句，说说为什么是它。',
    ask: '哪一句最要紧？',
  },
  {
    name: '品析',
    goal: '这一段要解决什么：从「写了什么」走到「为什么这样写」。',
    teacher: '这里留一个教师动作：把两个词并排放，让学生比一比。',
    student: '换一个词试试，说清换掉之后差在哪。',
    ask: '换成别的词，差在哪？',
  },
  {
    name: '迁移',
    goal: '这一段要解决什么：把这一课学到的方法用到别处。',
    teacher: '这里留一个教师动作：给一个同类的短材料，让学生自己试。',
    student: '用刚学到的方法，写一两句。',
    ask: '你打算怎么用上它？',
  },
  {
    name: '小结',
    goal: '这一段要解决什么：收束到一句学生能带走的话，再留作业。',
    teacher: '这里留一个教师动作：请两三位学生说这一课的收获，再布置作业。',
    student: '说一句这一课记住了什么。',
    ask: '这一课你想带走哪一句？',
  },
]

/** 数学：情境 → 探究 → 归纳 → 练习 → 变式 → 小结 */
const MATH: Template[] = [
  {
    name: '情境',
    goal: '这一段要解决什么：从一个真实情境里提出一个数学问题。',
    teacher: '这里留一个教师动作：出示情境，让学生自己把问题说清楚。',
    student: '说说这个情境里要解决的是什么。',
    ask: '这道题要我们求什么？',
  },
  {
    name: '探究',
    goal: '这一段要解决什么：让学生先动手试，试出不同的做法。',
    teacher: '这里留一个教师动作：不示范，先巡视，收集不同的做法。',
    student: '自己试一种办法，把步骤写下来。',
    ask: '你是从哪一步想到的？',
  },
  {
    name: '归纳',
    goal: '这一段要解决什么：把几种做法收成一条能说清的规律。',
    teacher: '这里留一个教师动作：把两种做法并排写在黑板上，让学生找相同点。',
    student: '用一句话说出这条规律。',
    ask: '它们的共同点是什么？',
  },
  {
    name: '练习',
    goal: '这一段要解决什么：当堂练一遍，看出谁还没会。',
    teacher: '这里留一个教师动作：出两道基础题，当堂看结果。',
    student: '独立做完，做完举手。',
    ask: '哪一步最容易错？',
  },
  {
    name: '变式',
    goal: '这一段要解决什么：换一个条件，看规律还成不成立。',
    teacher: '这里留一个教师动作：只改一个条件，让学生判断并说理由。',
    student: '先说结论，再说依据。',
    ask: '条件换了，结论还成立吗？',
  },
  {
    name: '小结',
    goal: '这一段要解决什么：收束到一条方法，再留作业。',
    teacher: '这里留一个教师动作：请学生复述方法，再布置作业。',
    student: '说清这节课的方法分几步。',
    ask: '这节课的方法分几步？',
  },
]

/** 其它学科：导入 → 学习 → 活动 → 练习 → 小结（够用，不硬套语文数学的名目） */
const GENERAL: Template[] = [
  {
    name: '导入',
    goal: '这一段要解决什么：用一个问题把学生带进这一课。',
    teacher: '这里留一个教师动作：提问开场，不急着给答案。',
    student: '先自己想一想，把想到的写一句。',
    ask: '关于这个题目，你已知什么？',
  },
  {
    name: '学习',
    goal: '这一段要解决什么：把这一课最核心的一段内容讲清楚。',
    teacher: '这里留一个教师动作：挑重点讲，讲完留时间提问。',
    student: '边听边记，把没懂的标出来。',
    ask: '哪一处还没听懂？',
  },
  {
    name: '活动',
    goal: '这一段要解决什么：让学生动手做一次，把听到的变成做过的。',
    teacher: '这里留一个教师动作：给任务、给时间，不替学生做。',
    student: '动手做一次，做完派一人说结果。',
    ask: '你们组是怎么做的？',
  },
  {
    name: '练习',
    goal: '这一段要解决什么：当堂练，看出谁还没会。',
    teacher: '这里留一个教师动作：出两道题，当堂看结果。',
    student: '独立做完，做完举手。',
    ask: '哪一步最容易错？',
  },
  {
    name: '小结',
    goal: '这一段要解决什么：收束成一句能带走的话，再留作业。',
    teacher: '这里留一个教师动作：请学生说收获，再布置作业。',
    student: '说一句今天记住了什么。',
    ask: '今天你想带走哪一句？',
  },
]

/** 片段档（≤10 分钟）只留四段：导入 → 核心 → 练习 → 小结 */
const CLIP_NAMES: Record<'语文' | '数学' | '其它', RegExp[]> = {
  语文: [/导入/, /精读/, /迁移/, /小结/],
  数学: [/情境/, /探究/, /练习/, /小结/],
  其它: [/导入/, /学习/, /练习/, /小结/],
}
const CLIP_RATIOS = [0.15, 0.45, 0.28, 0.12]
const LESSON_RATIOS = [0.12, 0.16, 0.3, 0.18, 0.14, 0.1]

function subjectKey(subject: string): '语文' | '数学' | '其它' {
  const s = String(subject ?? '')
  if (/语文|中文/.test(s)) return '语文'
  if (/数学/.test(s)) return '数学'
  return '其它'
}

function templatesOf(subject: string): Template[] {
  const key = subjectKey(subject)
  if (key === '语文') return CHINESE
  if (key === '数学') return MATH
  return GENERAL
}

/** 学段只改措辞（小学多一句「做一做」，中学多一句「说依据」），不改环节结构 */
function stageHint(stage: string): string {
  return String(stage ?? '').includes(PRIMARY) ? PRIMARY : SECONDARY
}

function pauseOf(t: Template, stage: string): Pause {
  const question = stageHint(stage) === PRIMARY ? t.ask : `${t.ask.replace(/？$/, '')}，说清依据。`
  return { afterText: '停一下', seconds: 5, question, type: '引发思考' }
}

function toSegment(t: Template, ratio: number, stage: string): Segment {
  const primary = stageHint(stage) === PRIMARY
  // 口播只给结构：这一段自己讲什么、停在哪里，不写课文原句。
  // 每一句都必须是能直接念出口的完整话——这一叠就是模型没接上时老师手里的稿子。
  const ask = t.ask.replace(/[？?]$/, '')
  return {
    name: t.name,
    ratio,
    goal: primary ? `${t.goal}先让学生做一做，再收。` : `${t.goal}让学生说清依据，不只说结论。`,
    teacher: t.teacher,
    student: t.student,
    // 这一截口播会被 slides.ts 拆成短句上屏（hook 页标题就从这里取），
    // 所以只作最小改动：讲台话换成学生听得懂的说法，句子结构与原来一致。
    script: `这一段让两名学生回答「${ask}」，各自说一句，等两个人都说完再往下走。${primary ? '说不清的，先指一指书上那一处，再补一句。' : '谁说得不清楚，就补一句依据，不替他说。'}`,
    pauses: [pauseOf(t, stage)],
  }
}

/**
 * 由用户输入直接拼一份骨架教案。
 * 不读课文、不猜情节、不给任何「课文里写了什么」的判断——只保证流程走得完。
 */
export function skeletonPlan(input: LessonInput): LessonPlan {
  const topic = String(input.topic ?? '').trim() || '这一课'
  const subject = String(input.subject ?? '').trim()
  const stage = String(input.stage ?? '').trim()
  const grade = String(input.grade ?? '').trim()
  const clip = scaleOf(Number(input.duration)) === 'clip'

  const all = templatesOf(subject)
  const key = subjectKey(subject)
  const picked = clip
    ? all.filter((t) => CLIP_NAMES[key === '语文' ? '语文' : key === '数学' ? '数学' : '其它'].some((re) => re.test(t.name)))
    : all
  // 兜底：哪个学科都截不出四段时，回到前四段（环节名不完美，但流程完整）
  const rows = picked.length > 0 ? picked : all.slice(0, 4)
  const ratios = clip ? CLIP_RATIOS : LESSON_RATIOS
  const segments = rows.map((t, i) => toSegment(t, ratios[i] ?? 1 / rows.length, stage))

  return {
    meta: {
      topic,
      subject: subject || '语文',
      stage: stage || PRIMARY,
      grade: grade || '五年级',
      period: input.period || '第一课时',
      textbook: input.textbook || '部编版',
      duration: Number(input.duration) || 2400,
      // 原文跟着计划走：学生版出原文页（TASKS/19a），离线路径也要带上
      text: input.text,
    },
    objectives: {
      knowledge: '这一课要读准的字词、要说清的那一句话，按课本这一单元的清单一项一项过，过关了再往下走。',
      process: '课上先自己做一遍，再把自己的做法说给旁边的人听，最后挑两位同学说清方法和理由。',
      emotion: '最后留一分钟，让学生说一句这一课让他想到什么，不要求说满，说一句就够。',
    },
    keyPoint: '这一课最该讲透的，是学生自己动手试过的那一步；把过程说清楚，比把结论背下来更要紧。',
    hardPoint: '学生最容易卡住的，是说清「为什么这样写」，而不只是知道答案。',
    preparation: '课本、课件、板书用具；学生每人一张草稿纸，用来写第一次尝试，写完同桌互看。',
    segments,
    homework: {
      must: '把这一课最要紧的那一段再读一遍。',
      optional: '用自己的话，把这一课讲给家里人听一遍。',
    },
    blackboard: {
      // 板书是学生抬头要读的字：三行都写环节名，不留空格、不留下划线。
      layout: `        ${topic}\n\n  ① ${segments[0]?.name ?? '问题'}\n  ② ${segments[1]?.name ?? '方法'}\n  ③ ${segments[2]?.name ?? '落点'}`,
      order: [
        `课题「${topic}」居中写在最上方`,
        `三行按顺序往下写：${segments[0]?.name ?? '问题'} → ${segments[1]?.name ?? '方法'} → ${segments[2]?.name ?? '落点'}`,
        '最后一行写这一课的方法，写完停一秒再开口',
      ],
    },
    prep: {
      courseware: [{ name: '本课课件一页', usage: '开场与收束时投屏' }],
      physical: [{ name: '板书贴纸', usage: '随讲随贴，标出三条主线' }],
      media: [],
    },
    speech: [
      {
        section: '说教材',
        text: `《${topic}》这一课在${input.textbook || '课本'}这一单元里承担方法落地的任务：字词要读准，句子要读通，写法要当堂用一次，后面的课文接着用这套方法。`,
      },
      {
        section: '说学情',
        text: `${grade}学生已经能独立读通这篇课文，但「作者为什么这样写」还说不清，需要在品析环节多留两次发言；说得清的那几个，再请他们给同桌补一句依据。`,
      },
      {
        section: '说目标',
        text: '本课三条目标：读准生字词；能找出关键句并说明它在写什么；能仿写一句同样句式的句子，写完同桌互评。',
      },
      {
        section: '说教法与学法',
        text: '课上以学生活动为主：先自己试一遍，再和同桌对一遍，最后全班收成一条能说清的方法；老师只在学生卡住的那一步给台阶，不替他们说答案。',
      },
      {
        section: '说教学过程',
        text: `课按 ${segments.map((s) => s.name).join(' → ')} 六步走，每一步留一个停顿点，等学生答完再往下，不抢时间。`,
      },
      {
        section: '说板书',
        text: `板书走线索式：课题「${topic}」写在最上方，中间三行横着排开，一行一个环节名，最后一行写这一课的方法。`,
      },
    ],
    defense: [
      {
        question: '你这个环节的设计意图是什么？',
        answer: '先让学生自己试一遍，卡在哪儿我看得见，再收方法；一上来就讲，学生只会点头，不会做。',
      },
      {
        question: '这节课的难点在哪，你用什么方法突破？',
        answer: '难点落在「为什么这样」上。办法是降台阶：先问看得见的具体，再问依据，最后回到原来的问题重问一次。',
      },
      {
        question: '如果课堂上学生答不上来，你怎么处理？',
        answer: '先把问题换小，再请一位学生示范说一遍，然后回到原问题请另一位重答；答不上来不是不会，是问题太大。',
      },
      {
        question: '如果只有三分钟，你会删掉哪个环节？',
        answer: '删掉练习那一环，把它并进小结当口头题；导入与核心那一段不动，方法必须当堂说清楚。',
      },
    ],
  }
}