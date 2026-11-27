/**
 * 只给浏览器复查用：把 /tmp/real 里真机跑出来的备课包 + 学生版拼成一份合法存档，
 * 写 /tmp/real/session.json，浏览器 evaluate 时塞进 localStorage 就能直接落在结果页。
 *
 * 不进 npm scripts、不进门禁（点开头的临时脚本）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { buildDeck, deckFingerprint } from '../src/lib/deck'
import { allocate } from '../src/lib/timing'
import { planKeyOf, SESSION_VERSION } from '../src/lib/session'
import { EMPTY_EDITS } from '../src/lib/deck2/edits'
import type { LessonInput, LessonPlan } from '../src/types'
import type { StudentSlide } from '../src/lib/slides'

const plan = JSON.parse(readFileSync('/tmp/real/plan.json', 'utf8')) as LessonPlan
const slides = JSON.parse(readFileSync('/tmp/real/slides.json', 'utf8')) as StudentSlide[]
const duration = 40 * 60 // 秒：App 里的时长一律是秒（20–45 分钟 → 1200–2700）
const deck = buildDeck(plan, allocate(plan.segments, plan.meta.duration))
const input: LessonInput = {
  topic: '桂花雨',
  subject: '语文',
  stage: '小学',
  grade: '五年级',
  period: '第一课时',
  textbook: '部编版',
  duration,
}
const snapshot = {
  v: SESSION_VERSION,
  savedAt: Date.now(),
  input,
  plan,
  duration,
  isDemo: false,
  planKey: planKeyOf(plan, duration),
  slides,
  fingerprint: deckFingerprint(deck),
  degraded: false,
  edits: EMPTY_EDITS,
  templateId: 'suke',
  tab: 'student',
  slideAt: 0,
}
writeFileSync('/tmp/real/session.json', JSON.stringify(snapshot))
console.log(
  `session.json 就绪：planKey=${snapshot.planKey} / slides=${slides.length} / fingerprint=${snapshot.fingerprint} / ${(
    JSON.stringify(snapshot).length / 1024
  ).toFixed(0)}KB`
)