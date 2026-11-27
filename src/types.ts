export interface LessonInput {
  topic: string
  subject: string
  stage: string
  grade: string
  period: string
  textbook: string
  duration: number
  /**
   * 这节课要讲的句子。一行为一句；也可以整篇贴入，由 splitQuotes 自动切句。
   * 空 = 没有原文，学生版不出原文页（不报错）
   */
  text?: string
}

export type PauseType = '确认理解' | '引发思考' | '过渡'

/** 讲稿里的停顿点：停几秒、问一句、留白给学生 */
export interface Pause {
  /** 插在哪句话之后，用于定位 */
  afterText: string
  seconds: number
  question: string
  type: PauseType
}

export interface Segment {
  name: string
  ratio: number
  goal: string
  teacher: string
  student: string
  script: string
  pauses?: Pause[]
}

export interface Defense {
  question: string
  answer: string
}

/** 教学准备：课件素材 / 实物教具 / 音视频。只出清单、图位与检索词，不生成图片和音频 */
export interface PrepItem {
  name: string
  usage: string
  searchHint?: string
}

export interface TeachingPrep {
  courseware: PrepItem[]
  physical: PrepItem[]
  media: PrepItem[]
}

export interface SpeechSection {
  section: string
  text: string
}

export interface LessonPlan {
  meta: LessonInput
  objectives: {
    knowledge: string
    process: string
    emotion: string
  }
  keyPoint: string
  hardPoint: string
  preparation: string
  segments: Segment[]
  homework: { must: string; optional: string }
  blackboard: { layout: string; order: string[] }
  prep: TeachingPrep
  speech: SpeechSection[]
  defense: Defense[]
}

export interface SegmentTimed extends Segment {
  seconds: number
  start: number
  end: number
}
