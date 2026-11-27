/**
 * 模板层 · 分页：装不下就拆页，绝不静默丢字（用户铁底线）。
 *
 * 为什么要有这一层：内容层按「最宽的那一族」写（编号页最多 6 条），但有的族
 * 一页只画得下 5 条（例题 / 书页 / 提纲）。以前 layout 里一句 slice(0, 5) 就把
 * 第 6 条扔了——老师想讲的那一条因为换了套模板就不上屏了。现在：
 *
 *   · 条目超量 → 拆成续页（每页 ≤ 这一族画得下的条数，ITEM_CAP 是唯一真源）；
 *   · 原文超长 → chunkQuote 逐字拆页（内容层已拆过一道，这里是第二道保险）；
 *   · 收尾页多条目 → 一条一页（收尾版式只画第一条，多出来的以前全丢）。
 *
 * 三处同源不变：Result.tsx 在 applyEdits 之前对 rawSlides 调一次，预览 / 演示 /
 * 导出拿到的都是拆完的那一叠——页码、页数、文字三处一致。
 *
 * 纯函数：不发网络、不看时钟、不取随机；同输入同输出；幂等（拆完的再拆不变）。
 * 短页原引用返回：没超量的那一叠进来是什么出去就是什么。
 */
import { chunkQuote, type StudentSlide } from '../slides'
import { archetypeOf, ITEM_CAP, type Arch } from './place'
import type { DeckTheme } from './theme'
import { isVisualThemeId, paginateVisualSlide } from './visualSystem'

/** 这一族这一版式一页画几条；compare / plain 全画（不截），返回 Infinity */
function capOf(arch: Arch, theme: DeckTheme): number {
  if (arch === 'numbered') return ITEM_CAP[theme.family].numbered
  if (arch === 'words') return ITEM_CAP[theme.family].words
  if (arch === 'end') return 1
  return Number.POSITIVE_INFINITY
}

/** 按 cap 条一组切条目（保持原顺序，不重排、不去重、不改字） */
function chunkItems(items: readonly string[], cap: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < items.length; i += cap) out.push(items.slice(i, i + cap))
  return out
}

/**
 * 把一叠学生版按这套模板的容量拆页。拆出来的续页与原页同 kind / 同标题 /
 * 同出处，只是条目少了——学生看到的是「同一件事分两页讲」，不是换了内容。
 */
export function paginate(slides: readonly StudentSlide[], theme: DeckTheme): StudentSlide[] {
  if (!Array.isArray(slides) || slides.length === 0) return slides as StudentSlide[]
  const out: StudentSlide[] = []
  let changed = false
  const isVisual = isVisualThemeId(theme.family)
  for (const s of slides) {
    const arch = archetypeOf(s.kind)

    /* 原文页：逐字拆块（标题 = 正文 = 那一块，出处跟着每一块） */
    if (arch === 'quote') {
      const chunks = chunkQuote(String(s.text ?? s.title ?? ''))
      if (chunks.length > 1) {
        changed = true
        for (const c of chunks) out.push({ ...s, title: c, text: c })
      } else {
        out.push(s)
      }
      continue
    }

    /* 公开课旗舰视觉主题：严格遵守每页 ≤ 6 行、每行 ≤ 18 字，超限自动拆续页 */
    if (isVisual && arch !== 'cover' && arch !== 'end') {
      const split = paginateVisualSlide(s)
      if (split.length > 1 || split[0] !== s) changed = true
      for (const p of split) out.push(p)
      continue
    }

    const items = s.items ?? []
    const cap = capOf(arch, theme)

    /* 收尾页：版式只画「那一句」（line 优先，其次 items[0]）。
       line 与 items 都有时，line 单独一页、条目一条一页——谁都不许被盖掉。 */
    if (arch === 'end') {
      const line = String(s.line ?? '').trim()
      if (items.length === 0 || (items.length === 1 && !line)) {
        out.push(s)
        continue
      }
      changed = true
      if (line) out.push({ ...s, items: [], line })
      for (const one of items) out.push({ ...s, items: [one], line: '' })
      continue
    }

    if (items.length <= cap) {
      out.push(s)
      continue
    }
    changed = true
    for (const chunk of chunkItems(items, cap)) out.push({ ...s, items: chunk })
  }
  return changed ? out : (slides as StudentSlide[])
}