import type { LessonPlan, SegmentTimed } from '../types'
import type { DeckPage } from './deck'
import { formatTime } from './timing'

/** 表格单元格转义：竖线会把列切断，换行会把行切断，粘到 Word 里最常在这里出错 */
function cell(value: string): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
}

/** 板书里可能自带反引号，围栏长度要比内容里最长的一串多一个 */
function fence(code: string): string {
  const runs = code.match(/`+/g) ?? []
  const longest = runs.reduce((max, r) => Math.max(max, r.length), 0)
  const mark = '`'.repeat(Math.max(3, longest + 1))
  return `${mark}\n${code}\n${mark}`
}

/**
 * 「课件逐页」那一节（10 §七）：文字直接取界面正在显示的那一叠，
 * 不再从 plan 重新算——用户改了什么，导出的文稿就是什么。
 */
function deckLines(deck: DeckPage[]): string[] {
  const out: string[] = []
  deck.forEach((p, i) => {
    const head = [p.label, p.duration].filter(Boolean).join(' · ')
    out.push(`### 第 ${i + 1} 页${head ? `　${head}` : ''}${p.userEdited ? '（改过）' : ''}`)
    out.push('')
    out.push(`**${p.title}**`)
    for (const b of p.bullets ?? []) {
      if (String(b).trim()) out.push(`- ${b}`)
    }
    for (const g of p.prep ?? []) {
      const items = g.items.length
        ? g.items.map((it) => `${it.name}${it.usage}`).join('；')
        : '本课不需要'
      out.push(`- **${g.heading}**：${items}`)
    }
    if (p.question) out.push(`**问**：${p.question}`)
    if (p.figureHint) out.push(`**图位**：${p.figureHint}`)
    if (p.notes) {
      out.push('')
      out.push(`> 口播：${String(p.notes).replace(/\s*\n+\s*/g, ' ')}`)
    }
    out.push('')
  })
  return out
}

export function planToMarkdown(
  plan: LessonPlan,
  timed: SegmentTimed[],
  deck?: DeckPage[]
): string {
  const { meta } = plan
  const lines: string[] = []
  // 带了当前那一叠课件，就多一节「课件逐页」，后面的章节号跟着顺延
  const hasDeck = Boolean(deck && deck.length > 0)
  const num = hasDeck ? ['三', '四', '五', '六'] : ['二', '三', '四', '五']

  lines.push(`# 《${meta.topic}》备课包`)
  lines.push('')
  lines.push(
    `> ${meta.stage}${meta.grade} · ${meta.subject} · ${meta.period} · ${meta.textbook || '教材不限'} ｜ 时长 ${formatTime(meta.duration)}`
  )
  lines.push('')

  lines.push('## 一、教学设计')
  lines.push('')
  lines.push('### 教学目标')
  lines.push(`- **课文里的**：${plan.objectives.knowledge}`)
  lines.push(`- **课上怎么练**：${plan.objectives.process}`)
  lines.push(`- **读完留下的**：${plan.objectives.emotion}`)
  lines.push('')
  lines.push(`**教学重点**：${plan.keyPoint}`)
  lines.push('')
  lines.push(`**教学难点**：${plan.hardPoint}`)
  lines.push('')
  lines.push(`**教学准备**：${plan.preparation}`)
  lines.push('')
  lines.push('### 教学过程')
  lines.push('')
  lines.push('| 环节 | 时间 | 累计 | 达成目标 | 教师活动 | 学生活动 |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const s of timed) {
    lines.push(
      `| ${cell(s.name)} | ${s.seconds}s | ${formatTime(s.end)} | ${cell(s.goal)} | ${cell(
        s.teacher
      )} | ${cell(s.student)} |`
    )
  }
  lines.push('')
  lines.push('### 停顿点')
  const pauses = timed.flatMap((s) => (s.pauses ?? []).map((p) => ({ seg: s.name, p })))
  if (pauses.length === 0) {
    lines.push('这一版没有插停顿点。')
  } else {
    for (const { seg, p } of pauses) {
      lines.push(`- **${cell(seg)}**：停 ${p.seconds} 秒（${p.type}）「${cell(p.question)}」`)
    }
  }
  lines.push('')
  lines.push('### 作业布置')
  lines.push(`- **必做**：${plan.homework.must}`)
  lines.push(`- **选做**：${plan.homework.optional}`)
  lines.push('')

  if (hasDeck) {
    lines.push('## 二、课件（逐页，与预览一致）')
    lines.push('')
    lines.push('> 这一节就是导出 .pptx 的同一份内容：改过的、插过的、删过的页都在这里。')
    lines.push('')
    deckLines(deck ?? []).forEach((l) => lines.push(l))
  }

  lines.push(`## ${num[0]}、说课稿`)
  lines.push('')
  for (const sec of plan.speech) {
    lines.push(`### ${sec.section}`)
    lines.push('')
    lines.push(sec.text)
    lines.push('')
  }

  lines.push(`## ${num[1]}、板书设计`)
  lines.push('')
  lines.push(fence(plan.blackboard.layout))
  lines.push('')
  lines.push('**书写顺序**：')
  plan.blackboard.order.forEach((o, i) => lines.push(`${i + 1}. ${o}`))
  lines.push('')

  lines.push(`## ${num[2]}、答辩预案`)
  lines.push('')
  plan.defense.forEach((d, i) => {
    lines.push(`**Q${i + 1}：${d.question}**`)
    lines.push('')
    lines.push(`A：${d.answer}`)
    lines.push('')
  })

  lines.push(`## ${num[3]}、时间表`)
  lines.push('')
  lines.push('| 环节 | 时间预算 | 时间段 | 这一页该说什么 |')
  lines.push('| --- | --- | --- | --- |')
  for (const s of timed) {
    lines.push(
      `| ${cell(s.name)} | ${s.seconds}s | ${formatTime(s.start)} – ${formatTime(
        s.end
      )} | ${cell(s.script)} |`
    )
  }
  lines.push('')
  lines.push(`合计：${meta.duration} 秒（${formatTime(meta.duration)}）`)
  lines.push('')

  return lines.join('\n')
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
