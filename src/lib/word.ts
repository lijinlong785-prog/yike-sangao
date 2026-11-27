import type { LessonPlan, SegmentTimed } from '../types'
import type { DeckPage } from './deck'
import { formatTime } from './timing'

const esc = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * 「课件逐页」那一节（10 §七）：文字直接取界面正在显示的那一叠，
 * 不再从 plan 重新算——用户改了什么，导出的文稿就是什么。
 */
function deckSection(deck: DeckPage[]): string {
  const items = deck
    .map((p, i) => {
      const head = [p.label, p.duration].filter(Boolean).join(' · ')
      const lines: string[] = []
      lines.push(`<p class="label">第 ${i + 1} 页${head ? `　${esc(head)}` : ''}${
        p.userEdited ? '<span style="color:#B23A2E">（改过）</span>' : ''
      }</p>`)
      lines.push(`<p><b>${esc(p.title)}</b></p>`)
      const bullets = (p.bullets ?? []).filter((b) => String(b).trim())
      if (bullets.length) {
        lines.push(`<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
      }
      const prep = (p.prep ?? [])
        .map(
          (g) =>
            `<li><b>${esc(g.heading)}</b>：${
              g.items.length
                ? esc(g.items.map((it) => `${it.name}${it.usage}`).join('；'))
                : '本课不需要'
            }</li>`
        )
        .join('')
      if (prep) lines.push(`<ul>${prep}</ul>`)
      if (p.question) lines.push(`<p>问：${esc(p.question)}</p>`)
      if (p.figureHint) lines.push(`<p>图位：${esc(p.figureHint)}</p>`)
      if (p.notes) lines.push(`<p class="indent">口播：${esc(String(p.notes).replace(/\s*\n+\s*/g, ' '))}</p>`)
      return lines.join('')
    })
    .join('')
  return `<h2>二、课件（逐页，与预览一致）</h2><p class="meta">这一节就是导出 .pptx 的同一份内容：改过的、插过的、删过的页都在这里。</p>${items}`
}

/**
 * 生成 Word（.doc）可打开的 HTML。
 * 直接用 HTML 而不是 Markdown，是因为 Markdown 表格粘进 Word 只会变成带竖线的文本，
 * 而师范生交作业、打印教案都需要真正的表格。
 */
export function planToDocHtml(plan: LessonPlan, timed: SegmentTimed[], deck?: DeckPage[]): string {
  const m = plan.meta
  const hasDeck = Boolean(deck && deck.length > 0)
  const num = hasDeck ? ['三', '四', '五', '六'] : ['二', '三', '四', '五']
  const segRows = timed
    .map(
      (s) => `<tr>
        <td>${esc(s.name)}</td>
        <td>${s.seconds}s</td>
        <td>${formatTime(s.end)}</td>
        <td>${esc(s.goal)}</td>
        <td>${esc(s.teacher)}</td>
        <td>${esc(s.student)}</td>
      </tr>`
    )
    .join('')

  const pauseLine = (s: SegmentTimed): string =>
    (s.pauses ?? [])
      .map(
        (p) =>
          `<br><span style="color:#B23A2E">● 停 ${p.seconds} 秒，问：「${esc(p.question)}」</span>`
      )
      .join('')

  const timelineRows = timed
    .map(
      (s) => `<tr>
        <td>${esc(s.name)}</td>
        <td>${s.seconds}s</td>
        <td>${formatTime(s.start)} – ${formatTime(s.end)}</td>
        <td>${esc(s.script)}${pauseLine(s)}</td>
      </tr>`
    )
    .join('')

  const speech = plan.speech
    .map((sec) => `<h3>${esc(sec.section)}</h3><p class="indent">${esc(sec.text)}</p>`)
    .join('')

  const defense = plan.defense
    .map(
      (d, i) =>
        `<p class="q">Q${i + 1}：${esc(d.question)}</p><p class="indent">${esc(d.answer)}</p>`
    )
    .join('')

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>《${esc(m.topic)}》备课包</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: "宋体", "PingFang SC", serif; font-size: 11pt; line-height: 1.75; color: #111; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 6pt; }
  .meta { text-align: center; color: #555; font-size: 10pt; margin-bottom: 18pt; }
  h2 { font-size: 14pt; border-bottom: 1px solid #999; padding-bottom: 4pt; margin: 22pt 0 10pt; }
  h3 { font-size: 12pt; margin: 12pt 0 6pt; color: #1E1C19; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 5pt 6pt; vertical-align: top; text-align: left; }
  th { background: #f0f0f0; }
  pre { font-family: Consolas, "宋体", monospace; font-size: 10pt; background: #f7f7f7;
        border: 1px solid #ddd; padding: 8pt; white-space: pre; line-height: 1.6; }
  .indent { text-indent: 2em; margin: 0 0 6pt; }
  .q { font-weight: bold; margin: 10pt 0 2pt; }
  .label { font-weight: bold; }
  ul, ol { padding-left: 18pt; margin: 0 0 6pt; }
  li { margin-bottom: 4pt; }
</style>
</head>
<body>
  <h1>《${esc(m.topic)}》备课包</h1>
  <p class="meta">${esc(m.stage)}${esc(m.grade)} · ${esc(m.subject)} · ${esc(m.period)}${
    m.textbook ? ` · ${esc(m.textbook)}` : ''
  } ｜ ${formatTime(m.duration)}</p>

  <h2>一、教学设计</h2>
  <h3>教学目标</h3>
  <ul>
    <li><span class="label">课文里的：</span>${esc(plan.objectives.knowledge)}</li>
    <li><span class="label">课上怎么练：</span>${esc(plan.objectives.process)}</li>
    <li><span class="label">读完留下的：</span>${esc(plan.objectives.emotion)}</li>
  </ul>
  <p><span class="label">教学重点：</span>${esc(plan.keyPoint)}</p>
  <p><span class="label">教学难点：</span>${esc(plan.hardPoint)}</p>
  <p><span class="label">教学准备：</span>${esc(plan.preparation)}</p>

  <h3>教学过程</h3>
  <table>
    <tr><th>环节</th><th>时间</th><th>累计</th><th>达成目标</th><th>教师活动</th><th>学生活动</th></tr>
    ${segRows}
  </table>

  <h3>作业布置</h3>
  <p><span class="label">必做：</span>${esc(plan.homework.must)}</p>
  <p><span class="label">选做：</span>${esc(plan.homework.optional)}</p>

  ${hasDeck ? deckSection(deck ?? []) : ''}

  <h2>${num[0]}、说课稿</h2>
  ${speech}

  <h2>${num[1]}、板书设计</h2>
  <pre>${esc(plan.blackboard.layout)}</pre>
  <h3>书写顺序</h3>
  <ol>${plan.blackboard.order.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>

  <h2>${num[2]}、答辩预案</h2>
  ${defense}

  <h2>${num[3]}、时间表</h2>
  <table>
    <tr><th>环节</th><th>时间预算</th><th>时间段</th><th>这一页该说什么</th></tr>
    ${timelineRows}
  </table>
  <p class="meta">合计 ${m.duration} 秒（${formatTime(m.duration)}）</p>
</body>
</html>`
}

export function downloadWord(filename: string, html: string) {
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
