/**
 * 公开课 PPT 视觉系统（2026 Qoder StudyHack 旗舰版）
 *
 * 三套公开课视觉主题：
 *   · watercolor（清新水彩）：莫兰迪青瓷 + 宣纸水彩层次，适合语文、散文、写景公开课
 *   · business（简洁商务）：极简瑞士网格 + 学院深蓝，适合数学、科学、汇报公开课
 *   · handdrawn（童趣手绘）：暖米手账双框 + 朱砂蜡笔点缀，适合小学、趣味课堂公开课
 *
 * 四种标准版式：
 *   · cover（封面） / section（章节过渡） / bullets（要点罗列） / split（图文并排）
 *
 * 固定字号阶梯（pt）：44 / 32 / 24 / 18
 * 密度红线：每页 ≤ 6 行、每行 ≤ 18 字，超限自动分页（paginateVisualSlide）
 *
 * 与 PptPreview / TemplateWall / pptx.ts 100% 同源：只吐 Placed[]，谁也不许另算坐标。
 */
import { SLIDE_LABELS, type StudentSlide } from '../slides'
import type { DeckTheme } from './theme'
import type { Placed } from './place'

export type VisualThemeId = 'watercolor' | 'business' | 'handdrawn'
export type VisualLayoutKind = 'cover' | 'section' | 'bullets' | 'split'

/** 固定四档字号阶梯（pt） */
export const VISUAL_TYPOGRAPHY = {
  cover: 44,
  heading: 32,
  body: 24,
  caption: 18,
} as const

/** 单页排版密度上限：每页 ≤ 6 行，每行 ≤ 18 字 */
export const VISUAL_LIMITS = {
  maxLinesPerSlide: 6,
  maxCharsPerLine: 18,
} as const

export interface VisualThemeMeta {
  id: VisualThemeId
  name: string
  tone: string
  tagline: string
  badge: string
  theme: DeckTheme
}

export const VISUAL_THEMES: Record<VisualThemeId, VisualThemeMeta> = {
  watercolor: {
    id: 'watercolor',
    name: '清新水彩',
    tone: '青瓷',
    tagline: '水彩晕染留白 + 宋楷书香，适配语文/写景/人文公开课',
    badge: '公开课旗舰',
    theme: {
      id: 'watercolor',
      family: 'watercolor',
      name: '清新水彩',
      tone: '青瓷',
      fits: ['公开课', '语文', '散文', '写景'],
      paper: '#F7FAF7',
      surface: '#E6F0EA',
      ink: '#1C2D26',
      muted: '#556B61',
      accent: '#286655',
      line: '#C9DDD2',
      fontTitle: 'song',
      fontBody: 'song',
    },
  },
  business: {
    id: 'business',
    name: '简洁商务',
    tone: '学院蓝',
    tagline: '瑞士网格 + 克制留白，适配数学/科学/说课汇报',
    badge: '公开课旗舰',
    theme: {
      id: 'business',
      family: 'business',
      name: '简洁商务',
      tone: '学院蓝',
      fits: ['公开课', '数学', '科学', '通用'],
      paper: '#F8FAFC',
      surface: '#EBF1F8',
      ink: '#0F172A',
      muted: '#475569',
      accent: '#1D4ED8',
      line: '#CBD5E1',
      fontTitle: 'hei',
      fontBody: 'hei',
    },
  },
  handdrawn: {
    id: 'handdrawn',
    name: '童趣手绘',
    tone: '暖杏',
    tagline: '暖纸手账框 + 蜡笔圆点，适配小学/故事/趣味课堂',
    badge: '公开课旗舰',
    theme: {
      id: 'handdrawn',
      family: 'handdrawn',
      name: '童趣手绘',
      tone: '暖杏',
      fits: ['公开课', '小学', '语文', '趣味'],
      paper: '#FFFBF1',
      surface: '#F6EBD2',
      ink: '#2A2016',
      muted: '#6E5C49',
      accent: '#C24722',
      line: '#E5D3B3',
      fontTitle: 'kai',
      fontBody: 'hei',
    },
  },
}

export const VISUAL_THEME_IDS: readonly VisualThemeId[] = ['watercolor', 'business', 'handdrawn']

export function isVisualThemeId(id: string): id is VisualThemeId {
  return id === 'watercolor' || id === 'business' || id === 'handdrawn'
}

/** 按单行 ≤ 18 字智能折行，保证中文阅读呼吸感，绝不丢字 */
export function splitLineToLimit(raw: string, maxChars = VISUAL_LIMITS.maxCharsPerLine): string[] {
  const clean = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const chars = Array.from(clean)
  if (chars.length <= maxChars) return [clean]
  const out: string[] = []
  let start = 0
  while (start < chars.length) {
    let end = Math.min(start + maxChars, chars.length)
    // 尽量在标点处断开，不把标点孤立在下一行首
    if (end < chars.length) {
      const slice = chars.slice(start, end)
      let cut = -1
      for (let i = slice.length - 1; i >= Math.floor(maxChars * 0.55); i -= 1) {
        if (/[，。；、：？！,. ;!?]/.test(slice[i])) {
          cut = start + i + 1
          break
        }
      }
      if (cut > start) end = cut
    }
    const piece = chars.slice(start, end).join('').trim()
    if (piece) out.push(piece)
    start = end
  }
  return out
}

/** 将一页的条目展开为 ≤18 字/行 的标准行表 */
export function normalizeVisualLines(items: readonly string[]): string[] {
  const out: string[] = []
  for (const item of items) {
    const parts = splitLineToLimit(item, VISUAL_LIMITS.maxCharsPerLine)
    for (const p of parts) out.push(p)
  }
  return out
}

/**
 * 公开课视觉系统自动分页：
 * 每页 ≤ 6 行、每行 ≤ 18 字；超限时自动拆分为续页（保留标题、插画/问句语义），一条不丢。
 */
export function paginateVisualSlide(slide: StudentSlide): StudentSlide[] {
  if (slide.kind === 'cover' || slide.kind === 'quote' || slide.kind === 'end') {
    return [slide]
  }
  const rawItems = (slide.items ?? []).map((s) => String(s ?? '').trim()).filter(Boolean)
  if (rawItems.length === 0) return [slide]

  const wrapped: string[] = normalizeVisualLines(rawItems)
  const cap = VISUAL_LIMITS.maxLinesPerSlide
  if (wrapped.length <= cap && rawItems.length <= cap) {
    return [slide]
  }

  const pages: StudentSlide[] = []
  for (let i = 0; i < wrapped.length; i += cap) {
    const chunk = wrapped.slice(i, i + cap)
    const pageNo = Math.floor(i / cap)
    pages.push({
      ...slide,
      title: pageNo === 0 ? slide.title : `${slide.title}（续）`,
      items: chunk,
      // 续页不重复塞大图，避免同图连屏
      illustration: pageNo === 0 ? slide.illustration : undefined,
    })
  }
  return pages
}

/** 根据页型与配图判定 4 种标准版式之一 */
export function visualLayoutOf(slide: StudentSlide): VisualLayoutKind {
  if (slide.kind === 'cover') return 'cover'
  const hasArt = typeof slide.illustration === 'string' && slide.illustration.startsWith('data:image/')
  if (hasArt && slide.kind !== 'quote' && slide.kind !== 'end') return 'split'
  if (slide.kind === 'end' || slide.kind === 'quote' || (slide.kind === 'hook' && (slide.items?.length ?? 0) <= 2)) {
    return 'section'
  }
  return 'bullets'
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim()
}

/**
 * 三套公开课视觉主题的统一版面引擎：
 * 严格遵循 44 / 32 / 24 / 18 pt 字号阶梯与 4 种标准版式，
 * 同时赋予三套主题清晰可辨的视觉识别度。
 */
export function placeVisualSlide(slide: StudentSlide, theme: DeckTheme): Placed[] {
  const id = isVisualThemeId(theme.family) ? theme.family : 'watercolor'
  const layout = visualLayoutOf(slide)
  const art =
    typeof slide.illustration === 'string' && slide.illustration.startsWith('data:image/') ? slide.illustration : ''
  const title = cleanStr(slide.title)
  const line = cleanStr(slide.line)
  const quote = cleanStr(slide.text) || title
  const note = cleanStr(slide.note)
  const items = normalizeVisualLines(slide.items ?? []).slice(0, VISUAL_LIMITS.maxLinesPerSlide)
  const out: Placed[] = []

  const pushText = (p: Omit<Placed, 'kind'>) => {
    if (!cleanStr(p.text)) return
    out.push({ kind: 'text', ...p })
  }

  /* ==================== 1. 封面版式（cover） ==================== */
  if (layout === 'cover') {
    if (art) {
      // 满版铺底：字压图上，与 place.ts 封面兜底 100% 同构
      out.push({ kind: 'image', x: 0, y: 0, w: 1, h: 1, data: art })
    }

    if (id === 'watercolor') {
      if (!art) {
        // 清新水彩无图时：柔和水彩晕染圆斑 + 底部淡绿水波带（严格落在 [0,1] 纸面内）
        out.push({ kind: 'ellipse', x: 0.58, y: 0.04, w: 0.38, h: 0.56, fill: theme.surface, opacity: 0.85 })
        out.push({ kind: 'ellipse', x: 0.66, y: 0.36, w: 0.3, h: 0.46, fill: theme.accent, opacity: 0.14 })
        out.push({ kind: 'rect', x: 0, y: 0.86, w: 1, h: 0.14, fill: theme.surface, opacity: 0.65 })
      } else {
        out.push({ kind: 'rect', x: 0.055, y: 0.24, w: 0.52, h: 0.5, fill: theme.paper, opacity: 0.84, radius: 14 })
      }
      out.push({ kind: 'rect', x: 0.085, y: 0.29, w: 0.055, h: 0.01, fill: theme.accent, opacity: 0.9, radius: 4 })
      pushText({
        x: 0.085, y: 0.32, w: 0.46, h: 0.17,
        text: title, size: VISUAL_TYPOGRAPHY.cover, font: theme.fontTitle,
        color: theme.ink, bold: true, align: 'left', valign: 'middle', lineHeight: 1.22,
      })
      if (slide.meta) {
        pushText({
          x: 0.085, y: 0.515, w: 0.45, h: 0.06,
          text: slide.meta, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
          color: theme.accent, align: 'left', valign: 'middle',
        })
      }
      if (line) {
        pushText({
          x: 0.085, y: 0.585, w: 0.45, h: 0.1,
          text: line, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
          color: theme.muted, align: 'left', valign: 'top', lineHeight: 1.45,
        })
      }
      if (slide.byline) {
        pushText({
          x: 0.58, y: 0.885, w: 0.35, h: 0.055,
          text: slide.byline, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
          color: theme.muted, align: 'right', valign: 'middle',
        })
      }
      return out
    }

    if (id === 'business') {
      // 简洁商务：左侧深蓝结构竖条 + 极简网格卡片
      out.push({ kind: 'rect', x: 0, y: 0, w: 0.028, h: 1, fill: theme.accent, opacity: 0.95 })
      if (!art) {
        out.push({ kind: 'rect', x: 0.66, y: 0, w: 0.34, h: 1, fill: theme.surface, opacity: 0.85 })
        out.push({ kind: 'rect', x: 0.66, y: 0, w: 0.004, h: 1, fill: theme.line, opacity: 0.9 })
        out.push({ kind: 'rect', x: 0.72, y: 0.22, w: 0.22, h: 0.24, fill: theme.accent, opacity: 0.12, radius: 8 })
        out.push({ kind: 'rect', x: 0.72, y: 0.52, w: 0.22, h: 0.24, fill: theme.accent, opacity: 0.08, radius: 8 })
      } else {
        out.push({ kind: 'rect', x: 0.06, y: 0.22, w: 0.52, h: 0.52, fill: theme.paper, opacity: 0.9, radius: 8 })
      }
      if (slide.meta) {
        pushText({
          x: 0.09, y: 0.26, w: 0.46, h: 0.055,
          text: slide.meta, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
          color: theme.accent, bold: true, align: 'left', valign: 'middle',
        })
      }
      pushText({
        x: 0.09, y: 0.33, w: 0.48, h: 0.18,
        text: title, size: VISUAL_TYPOGRAPHY.cover, font: theme.fontTitle,
        color: theme.ink, bold: true, align: 'left', valign: 'middle', lineHeight: 1.2,
      })
      out.push({ kind: 'line', x: 0.09, y: 0.535, w: 0.18, h: 0.006, fill: theme.accent, opacity: 0.95 })
      if (line) {
        pushText({
          x: 0.09, y: 0.565, w: 0.46, h: 0.11,
          text: line, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
          color: theme.muted, align: 'left', valign: 'top', lineHeight: 1.4,
        })
      }
      if (slide.byline) {
        pushText({
          x: 0.09, y: 0.87, w: 0.48, h: 0.055,
          text: slide.byline, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
          color: theme.muted, align: 'left', valign: 'middle',
        })
      }
      return out
    }

    // handdrawn 童趣手绘封面：暖杏双框手账卡 + 蜡笔圆点
    if (!art) {
      out.push({ kind: 'rect', x: 0.04, y: 0.06, w: 0.92, h: 0.88, fill: theme.surface, opacity: 0.52, radius: 18 })
      out.push({ kind: 'ellipse', x: 0.78, y: 0.14, w: 0.12, h: 0.21, fill: theme.accent, opacity: 0.16 })
      out.push({ kind: 'ellipse', x: 0.72, y: 0.62, w: 0.16, h: 0.28, fill: '#EAB308', opacity: 0.2 })
    }
    out.push({ kind: 'rect', x: 0.075, y: 0.22, w: 0.53, h: 0.54, fill: theme.paper, opacity: art ? 0.88 : 0.95, radius: 16 })
    out.push({ kind: 'rect', x: 0.075, y: 0.22, w: 0.53, h: 0.022, fill: theme.accent, opacity: 0.85, radius: 8 })
    out.push({ kind: 'ellipse', x: 0.105, y: 0.275, w: 0.016, h: 0.028, fill: theme.accent, opacity: 0.9 })
    out.push({ kind: 'ellipse', x: 0.128, y: 0.275, w: 0.016, h: 0.028, fill: '#D97706', opacity: 0.85 })
    out.push({ kind: 'ellipse', x: 0.151, y: 0.275, w: 0.016, h: 0.028, fill: '#2D7A5E', opacity: 0.85 })
    pushText({
      x: 0.105, y: 0.325, w: 0.47, h: 0.18,
      text: title, size: VISUAL_TYPOGRAPHY.cover, font: theme.fontTitle,
      color: theme.ink, bold: true, align: 'left', valign: 'middle', lineHeight: 1.25,
    })
    if (slide.meta) {
      pushText({
        x: 0.105, y: 0.525, w: 0.47, h: 0.055,
        text: slide.meta, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
        color: theme.accent, bold: true, align: 'left', valign: 'middle',
      })
    }
    if (line) {
      pushText({
        x: 0.105, y: 0.59, w: 0.47, h: 0.11,
        text: line, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
        color: theme.muted, align: 'left', valign: 'top', lineHeight: 1.4,
      })
    }
    if (slide.byline) {
      pushText({
        x: 0.58, y: 0.875, w: 0.34, h: 0.055,
        text: slide.byline, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
        color: theme.muted, align: 'right', valign: 'middle',
      })
    }
    return out
  }

  /* ==================== 公共页眉装饰（内页三主题差异化） ==================== */
  if (id === 'watercolor') {
    out.push({ kind: 'ellipse', x: 0.8, y: 0.02, w: 0.18, h: 0.26, fill: theme.surface, opacity: 0.85 })
    out.push({ kind: 'rect', x: 0, y: 0.935, w: 1, h: 0.065, fill: theme.surface, opacity: 0.55 })
    out.push({ kind: 'rect', x: 0.075, y: 0.085, w: 0.012, h: 0.058, fill: theme.accent, opacity: 0.9, radius: 4 })
  } else if (id === 'business') {
    out.push({ kind: 'rect', x: 0, y: 0, w: 1, h: 0.018, fill: theme.accent, opacity: 0.95 })
    out.push({ kind: 'line', x: 0.07, y: 0.195, w: 0.86, h: 0.002, fill: theme.line, opacity: 0.9 })
    out.push({ kind: 'line', x: 0.07, y: 0.93, w: 0.86, h: 0.0015, fill: theme.line, opacity: 0.85 })
  } else {
    out.push({ kind: 'rect', x: 0.035, y: 0.04, w: 0.93, h: 0.88, fill: theme.surface, opacity: 0.36, radius: 16 })
    out.push({ kind: 'rect', x: 0.075, y: 0.072, w: 0.13, h: 0.042, fill: theme.accent, opacity: 0.16, radius: 10 })
    out.push({ kind: 'ellipse', x: 0.9, y: 0.078, w: 0.022, h: 0.038, fill: '#EAB308', opacity: 0.55 })
  }

  const labelBox =
    id === 'business'
      ? { x: 0.07, y: 0.04, w: 0.22, h: 0.045 }
      : id === 'handdrawn'
        ? { x: 0.085, y: 0.072, w: 0.12, h: 0.042 }
        : { x: 0.8, y: 0.085, w: 0.13, h: 0.045 }

  pushText({
    ...labelBox,
    text: SLIDE_LABELS[slide.kind],
    size: VISUAL_TYPOGRAPHY.caption,
    font: theme.fontBody,
    color: theme.accent,
    bold: true,
    align: id === 'watercolor' ? 'right' : id === 'handdrawn' ? 'center' : 'left',
    valign: 'middle',
  })

  /* ==================== 2. 章节过渡 / 原文金句（section） ==================== */
  if (layout === 'section') {
    const heroText = slide.kind === 'quote' ? `“${quote}”` : slide.kind === 'end' ? line || items[0] || title : title
    const heroSize = Array.from(heroText).length > 38 ? VISUAL_TYPOGRAPHY.body : VISUAL_TYPOGRAPHY.heading

    if (id === 'watercolor') {
      out.push({ kind: 'rect', x: 0.11, y: 0.24, w: 0.78, h: 0.48, fill: theme.surface, opacity: 0.72, radius: 16 })
      out.push({ kind: 'rect', x: 0.46, y: 0.275, w: 0.08, h: 0.008, fill: theme.accent, opacity: 0.8, radius: 3 })
    } else if (id === 'business') {
      out.push({ kind: 'rect', x: 0.09, y: 0.25, w: 0.014, h: 0.46, fill: theme.accent, opacity: 0.9 })
      out.push({ kind: 'rect', x: 0.104, y: 0.25, w: 0.8, h: 0.46, fill: theme.surface, opacity: 0.65 })
    } else {
      out.push({ kind: 'rect', x: 0.1, y: 0.23, w: 0.8, h: 0.5, fill: theme.paper, opacity: 0.96, radius: 18 })
      out.push({ kind: 'line', x: 0.14, y: 0.26, w: 0.72, h: 0.004, fill: theme.accent, opacity: 0.5 })
      out.push({ kind: 'line', x: 0.14, y: 0.695, w: 0.72, h: 0.004, fill: theme.accent, opacity: 0.5 })
    }

    pushText({
      x: 0.14, y: 0.3, w: 0.72, h: 0.34,
      text: heroText, size: heroSize, font: theme.fontTitle,
      color: theme.ink, bold: slide.kind !== 'quote',
      align: id === 'business' ? 'left' : 'center', valign: 'middle', lineHeight: 1.55,
    })

    const sub = slide.kind === 'quote' ? (note ? `—— ${note}` : '') : line && line !== heroText ? line : items.join(' · ')
    if (sub) {
      pushText({
        x: 0.14, y: 0.76, w: 0.72, h: 0.08,
        text: sub, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
        color: theme.accent, align: id === 'business' ? 'left' : 'center', valign: 'middle',
      })
    }
    return out
  }

  /* ==================== 3. 图文并排（split） ==================== */
  if (layout === 'split') {
    const titleX = id === 'watercolor' ? 0.1 : 0.075
    const titleY = id === 'business' ? 0.095 : id === 'handdrawn' ? 0.13 : 0.082
    pushText({
      x: titleX, y: titleY, w: 0.48, h: 0.095,
      text: title, size: VISUAL_TYPOGRAPHY.heading, font: theme.fontTitle,
      color: theme.ink, bold: true, align: 'left', valign: 'middle', lineHeight: 1.2,
    })

    // 右侧 16:9 插画精装框（留衬边）
    const frameX = 0.545
    const frameY = 0.22
    const frameW = 0.39
    const frameH = 0.51
    out.push({ kind: 'rect', x: frameX - 0.012, y: frameY - 0.018, w: frameW + 0.024, h: frameH + 0.036, fill: theme.surface, opacity: 0.9, radius: id === 'business' ? 6 : 14 })
    if (art) {
      out.push({ kind: 'image', x: frameX, y: frameY, w: frameW, h: frameH, data: art })
    }

    // 左侧要点（固定 24pt，每行 ≤ 18 字，≤ 6 行）
    const bodyText = items.map((item, idx) => (id === 'business' ? `0${idx + 1}  ${item}` : `· ${item}`)).join('\n')
    if (bodyText) {
      pushText({
        x: 0.075, y: 0.24, w: 0.44, h: 0.54,
        text: bodyText, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
        color: theme.ink, align: 'left', valign: 'top', lineHeight: 1.52,
      })
    }

    if (line) {
      out.push({ kind: 'rect', x: 0.075, y: 0.815, w: 0.85, h: 0.075, fill: theme.surface, opacity: 0.72, radius: id === 'business' ? 4 : 10 })
      pushText({
        x: 0.095, y: 0.822, w: 0.81, h: 0.06,
        text: line, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
        color: theme.accent, bold: true, align: 'left', valign: 'middle',
      })
    }
    return out
  }

  /* ==================== 4. 要点罗列（bullets） ==================== */
  const titleX = id === 'watercolor' ? 0.1 : 0.075
  const titleY = id === 'business' ? 0.095 : id === 'handdrawn' ? 0.13 : 0.082
  pushText({
    x: titleX, y: titleY, w: 0.72, h: 0.095,
    text: title, size: VISUAL_TYPOGRAPHY.heading, font: theme.fontTitle,
    color: theme.ink, bold: true, align: 'left', valign: 'middle', lineHeight: 1.2,
  })

  const count = items.length
  if (count > 0) {
    if (id === 'business' && count >= 2 && count <= 6) {
      // 简洁商务：双列结构化卡片网格
      const cols = 2
      const rows = Math.ceil(count / cols)
      const gapX = 0.03
      const gapY = 0.032
      const cardW = (0.85 - gapX) / cols
      const totalH = 0.54
      const cardH = Math.min(0.24, (totalH - gapY * (rows - 1)) / rows)
      items.forEach((item, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const cx = 0.075 + col * (cardW + gapX)
        const cy = 0.24 + row * (cardH + gapY)
        out.push({ kind: 'rect', x: cx, y: cy, w: cardW, h: cardH, fill: theme.surface, opacity: 0.82, radius: 6 })
        out.push({ kind: 'rect', x: cx, y: cy, w: 0.008, h: cardH, fill: theme.accent, opacity: 0.9, radius: 2 })
        pushText({
          x: cx + 0.025, y: cy + 0.015, w: cardW - 0.04, h: cardH - 0.03,
          text: `${idx + 1}. ${item}`, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
          color: theme.ink, align: 'left', valign: 'middle', lineHeight: 1.38,
        })
      })
    } else if (id === 'handdrawn') {
      // 童趣手绘：圆润手账卡片叠排 + 彩色圆点序号
      const startY = 0.245
      const availH = 0.545
      const step = Math.min(0.115, availH / Math.max(1, count))
      const dotColors = [theme.accent, '#D97706', '#2D7A5E', '#2563EB', '#9333EA', theme.accent]
      items.forEach((item, idx) => {
        const cy = startY + idx * step
        out.push({ kind: 'rect', x: 0.08, y: cy, w: 0.84, h: step - 0.016, fill: theme.paper, opacity: 0.94, radius: 10 })
        out.push({ kind: 'ellipse', x: 0.1, y: cy + (step - 0.016) * 0.34, w: 0.015, h: 0.026, fill: dotColors[idx % dotColors.length], opacity: 0.9 })
        pushText({
          x: 0.13, y: cy + 0.005, w: 0.77, h: step - 0.024,
          text: item, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
          color: theme.ink, align: 'left', valign: 'middle', lineHeight: 1.35,
        })
      })
    } else {
      // 清新水彩：左侧水彩晕染底卡 + 优雅要点行
      out.push({ kind: 'rect', x: 0.075, y: 0.23, w: 0.85, h: 0.55, fill: theme.surface, opacity: 0.52, radius: 14 })
      const bodyText = items.map((item, idx) => `0${idx + 1}　${item}`).join('\n')
      pushText({
        x: 0.11, y: 0.26, w: 0.78, h: 0.49,
        text: bodyText, size: VISUAL_TYPOGRAPHY.body, font: theme.fontBody,
        color: theme.ink, align: 'left', valign: 'top', lineHeight: 1.56,
      })
    }
  }

  if (line) {
    out.push({ kind: 'rect', x: 0.075, y: 0.815, w: 0.85, h: 0.075, fill: theme.surface, opacity: 0.78, radius: id === 'business' ? 4 : 10 })
    pushText({
      x: 0.095, y: 0.822, w: 0.81, h: 0.06,
      text: line, size: VISUAL_TYPOGRAPHY.caption, font: theme.fontBody,
      color: theme.accent, bold: true, align: 'left', valign: 'middle',
    })
  }

  return out
}
