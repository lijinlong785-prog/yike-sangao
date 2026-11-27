/**
 * 稿子的纯文本（TASKS/21 §二.6）：教学设计 / 说课稿 / 板书 / 答辩 / 时间表合成一份，
 * 一个「复制全部稿子」按钮直接进剪贴板，粘到 Word 里就能交。
 *
 * 为什么是一个纯函数：界面只负责写剪贴板，内容排序只写在这里一份；
 * 门禁拿同一份函数验「五节都在、环节齐全、没有占位话」，不读 DOM。
 */
import type { LessonPlan, SegmentTimed } from '../types'
import { formatTime } from './timing'

const line = (s: string): string => String(s ?? '').trim()

export function scriptTextOf(plan: LessonPlan, timed: readonly SegmentTimed[]): string {
  const meta = [
    [plan.meta.stage, plan.meta.grade].filter(Boolean).join(''),
    plan.meta.subject,
    plan.meta.period,
    plan.meta.textbook,
    `${Math.round(Number(plan.meta.duration) / 60)} 分钟`,
  ]
    .filter(Boolean)
    .join(' · ')

  const out: string[] = []
  out.push(`《${line(plan.meta.topic)}》`)
  if (meta) out.push(meta)
  out.push('')

  out.push('一、教学设计')
  out.push('教学目标')
  out.push(`1. 课文里的：${line(plan.objectives.knowledge)}`)
  out.push(`2. 课上怎么练：${line(plan.objectives.process)}`)
  out.push(`3. 读完留下的：${line(plan.objectives.emotion)}`)
  out.push(`教学重点：${line(plan.keyPoint)}`)
  out.push(`教学难点：${line(plan.hardPoint)}`)
  out.push('')
  out.push('教学过程')
  timed.forEach((s, i) => {
    out.push(`${i + 1}. ${line(s.name)}（${s.seconds}s · ${formatTime(s.start)}–${formatTime(s.end)}）`)
    if (s.goal) out.push(`   目标：${line(s.goal)}`)
    if (s.teacher) out.push(`   教师：${line(s.teacher)}`)
    if (s.student) out.push(`   学生：${line(s.student)}`)
    for (const p of s.pauses ?? []) {
      out.push(`   停 ${p.seconds} 秒 · ${line(p.type)}：${line(p.question)}`)
    }
  })
  out.push('')
  out.push('作业布置')
  out.push(`必做：${line(plan.homework.must)}`)
  out.push(`选做：${line(plan.homework.optional)}`)
  out.push(`教学准备：${line(plan.preparation)}`)
  out.push('')

  out.push('二、说课稿')
  for (const sec of plan.speech ?? []) {
    out.push(`【${line(sec.section)}】`)
    out.push(line(sec.text))
  }
  out.push('')

  out.push('三、板书设计')
  out.push(plan.blackboard.layout)
  out.push('书写顺序：')
  ;(plan.blackboard.order ?? []).forEach((o, i) => out.push(`${i + 1}. ${line(o)}`))
  out.push('')

  out.push('四、答辩预案')
  ;(plan.defense ?? []).forEach((d, i) => {
    out.push(`Q${i + 1}：${line(d.question)}`)
    out.push(`A：${line(d.answer)}`)
  })
  out.push('')

  out.push('五、讲台时间表')
  timed.forEach((s) => {
    out.push(`${formatTime(s.start)}–${formatTime(s.end)}（${s.seconds}s）${line(s.name)}`)
    if (s.script) out.push(line(s.script))
  })

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}