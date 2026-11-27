import type { LessonInput } from '../types'

/** 浏览器原生语音识别的最小接口，避免依赖 @types/dom-speech-recognition */
export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

export interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const CN_NUM = '一二三四五六七八九十'

/**
 * 从一句话里抽课题 / 学段 / 年级 / 课时 / 教材 / 学科。
 * 例：我要讲五年级上册的桂花雨，第二课时
 *  → { topic: '桂花雨', stage: '小学', grade: '五年级', period: '第二课时' }
 */
export function parseLessonSpeech(raw: string): Partial<LessonInput> {
  const text = raw.replace(/\s+/g, '')
  const out: Partial<LessonInput> = {}

  const subjectMatch = text.match(/语文|数学|英语|科学|道德与法治|历史|地理/)
  if (subjectMatch) out.subject = subjectMatch[0]

  const bookMatch = text.match(/(部编|人教|苏教|北师大|外研|沪教)(版)?/)
  if (bookMatch) out.textbook = `${bookMatch[1]}版`

  let stage = text.match(/小学|初中|高中/)?.[0]
  const primaryGrade = text.match(new RegExp(`([${CN_NUM.slice(0, 6)}])年级`))
  const juniorGrade = text.match(/初([一二三])/)
  const seniorGrade = text.match(/高([一二三])/)

  if (primaryGrade) {
    out.grade = `${primaryGrade[1]}年级`
    stage = stage ?? '小学'
  } else if (juniorGrade) {
    out.grade = `初${juniorGrade[1]}`
    stage = stage ?? '初中'
  } else if (seniorGrade) {
    out.grade = `高${seniorGrade[1]}`
    stage = stage ?? '高中'
  }
  if (stage) out.stage = stage

  const periodMatch = text.match(new RegExp(`第([${CN_NUM}]+)课时`))
  if (periodMatch) out.period = `第${periodMatch[1]}课时`

  let rest = text
    .replace(/[《》「」“”"]/g, '')
    .replace(/^我?(今天|明天|后天|这节|下次)?(要|想|准备)?(试讲|讲讲|讲一下|讲一讲|讲|说课|说说|说|上一节|上)/, '')
    .replace(/小学|初中|高中/g, '')
    .replace(new RegExp(`([${CN_NUM.slice(0, 6)}])年级`, 'g'), '')
    .replace(/初[一二三]|高[一二三]/g, '')
    .replace(/[上下]册/g, '')
    .replace(new RegExp(`第[${CN_NUM}]+课时`, 'g'), '')
    .replace(/(部编|人教|苏教|北师大|外研|沪教)版?/g, '')
    .replace(/语文|数学|英语|科学|道德与法治|历史|地理/g, '')
    .replace(/[，。、,.!?！？;；:：·]/g, '')
    .replace(/^(的|讲|说|一下|一讲|关于|有关)+/, '')
    .replace(/[的吧啊呢呀]$/, '')
    .trim()

  if (!rest) {
    rest = text
      .replace(/[《》「」“”" ，。、,.!?！？;；:：]/g, '')
      .replace(/^我?(今天|明天|后天|这节|下次)?(要|想|准备)?(试讲|讲讲|讲一下|讲一讲|讲|说课|说说|说|上一节|上)/, '')
      .replace(/^(的|讲|说|一下|一讲|关于|有关)+/, '')
  }
  if (rest) out.topic = rest

  return out
}
