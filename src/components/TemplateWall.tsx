/**
 * 模板墙（Portal 挂载至 document.body，防被父级动画/层叠上下文遮挡）
 *
 * 顶部置顶 3 套「公开课旗舰视觉主题」（清新水彩 / 简洁商务 / 童趣手绘），
 * 下方完整保留 19 族 43 套经典模板（共 22 族 46 套）。
 * 缩略图、大图预览、主画布、.pptx 导出 100% 同源读取 place()。
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { place, type Placed } from '../lib/deck2/place'
import {
  FAMILIES,
  FAMILY_IDS,
  FONT_STACK,
  TEMPLATE_ORDER,
  TEMPLATES,
  familyTemplates,
  labelOf,
  type DeckTheme,
  type FamilyId,
  type TemplateId,
} from '../lib/deck2/theme'
import { isVisualThemeId, VISUAL_THEME_IDS } from '../lib/deck2/visualSystem'
import { builtinArtFor } from '../data/builtinArt'
import type { StudentSlide } from '../lib/slides'

const CQW_PER_PT = (4 / 3 / 1280) * 100

export function sampleSlide(topic: string): StudentSlide {
  const t = String(topic || '这一课').replace(/[《》]/g, '')
  return {
    kind: 'board',
    title: `《${t}》核心脉络`,
    line: '先自己读一遍，再同桌互相圈画关键词。',
    items: [
      '理清这一课的线索与顺序',
      '抓住动词与比喻里的画面感',
      '在原文里找出一句最打动你的话',
      '借景抒情：景是静的，心是活的',
    ],
    notes: '先自己读一遍，再同桌互相查。',
  }
}

export function sampleCover(topic: string): StudentSlide {
  const t = String(topic || '这一课').replace(/[《》]/g, '')
  const art = builtinArtFor(t)?.cover
  return {
    kind: 'cover',
    title: t,
    meta: '公开课示范课件',
    line: '一课三稿 · 实时同源排版',
    byline: '主讲：李金龙 · 搭档：林新锐',
    illustration: art,
    items: [],
    notes: '',
  }
}

function Canvas({ theme, slide, big = false }: { theme: DeckTheme; slide: StudentSlide; big?: boolean }) {
  const placed: Placed[] = useMemo(() => place(slide, theme), [slide, theme])
  return (
    <div
      className={big ? 'tw-canvas tw-canvas-big' : 'tw-canvas'}
      style={{ background: theme.paper, color: theme.ink }}
      aria-hidden
    >
      {placed.map((p, i) => {
        const box = {
          left: `${p.x * 100}%`,
          top: `${p.y * 100}%`,
          width: `${p.w * 100}%`,
          height: `${p.h * 100}%`,
        }
        if (p.kind === 'image') {
          return p.data ? (
            <div
              key={i}
              className="ppt-placed-fill"
              style={{
                ...box,
                backgroundImage: `url(${p.data})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          ) : null
        }
        if (p.kind === 'ellipse') {
          return (
            <div
              key={i}
              className="ppt-placed-fill"
              style={{
                ...box,
                background: p.fill ?? 'transparent',
                opacity: p.opacity ?? 1,
                borderRadius: '50%',
                transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined,
              }}
            />
          )
        }
        if (p.kind === 'rect' || p.kind === 'line') {
          const horizontal = p.w >= p.h
          return (
            <div
              key={i}
              className="ppt-placed-fill"
              style={{
                ...box,
                background: p.fill ?? 'transparent',
                opacity: p.opacity ?? 1,
                borderRadius: p.radius ? `${p.radius * CQW_PER_PT}cqw` : undefined,
                minHeight: horizontal ? 1 : undefined,
                minWidth: horizontal ? undefined : 1,
              }}
            />
          )
        }
        return (
          <div
            key={i}
            className="ppt-placed-text"
            style={{
              ...box,
              fontSize: `${(p.size ?? 18) * CQW_PER_PT}cqw`,
              color: p.color ?? theme.ink,
              fontFamily: FONT_STACK[p.font ?? 'hei'],
              fontWeight: p.bold ? 700 : 400,
              textAlign: p.align ?? 'left',
              lineHeight: p.lineHeight ?? 1.3,
              justifyContent: p.valign === 'middle' ? 'center' : 'flex-start',
            }}
          >
            {p.text}
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  open: boolean
  topic: string
  current: DeckTheme
  recommendedId: TemplateId
  onPick: (id: TemplateId) => void
  onClose: () => void
}

export default function TemplateWall({ open, topic, current, recommendedId, onPick, onClose }: Props) {
  const slide = useMemo(() => sampleSlide(topic), [topic])
  const cover = useMemo(() => sampleCover(topic), [topic])
  const [peekId, setPeekId] = useState<TemplateId>(current.id)
  const [filter, setFilter] = useState<'all' | 'visual' | 'classic'>('all')

  useEffect(() => {
    if (open) setPeekId(current.id)
  }, [open, current.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null
  const peek = TEMPLATES[peekId] ?? current

  const visualFamilies: FamilyId[] = FAMILY_IDS.filter((f) => isVisualThemeId(f))
  const classicFamilies: FamilyId[] = FAMILY_IDS.filter((f) => !isVisualThemeId(f))
  const visibleClassicCount = TEMPLATE_ORDER.filter((t) => !isVisualThemeId(t.family)).length

  const content = (
    <div className="tw-backdrop" onClick={onClose} role="presentation">
      <div
        className="tw-panel"
        role="dialog"
        aria-modal="true"
        aria-label="选择公开课 PPT 视觉模板"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tw-head">
          <div>
            <h3>视觉模板库</h3>
            <p className="tw-sub">
              {VISUAL_THEME_IDS.length} 套公开课旗舰主题 + {classicFamilies.length} 族 {visibleClassicCount} 套经典模板（共 {TEMPLATE_ORDER.length} 套）· 零重生成，保留全部手动改字与配图
            </p>
          </div>
          <div className="tw-head-right">
            <div className="tw-filter-pills">
              <button
                type="button"
                className={filter === 'all' ? 'tw-pill active' : 'tw-pill'}
                onClick={() => setFilter('all')}
              >
                全部（{TEMPLATE_ORDER.length}）
              </button>
              <button
                type="button"
                className={filter === 'visual' ? 'tw-pill active' : 'tw-pill'}
                onClick={() => setFilter('visual')}
              >
                公开课旗舰（3）
              </button>
              <button
                type="button"
                className={filter === 'classic' ? 'tw-pill active' : 'tw-pill'}
                onClick={() => setFilter('classic')}
              >
                经典 19 族（{visibleClassicCount}）
              </button>
            </div>
            <button type="button" className="btn outline sm" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        <div className="tw-body">
          <div className="tw-list">
            {filter !== 'classic' && (
              <section className="tw-group tw-featured-group">
                <h4 className="tw-group-head">
                  公开课旗舰视觉主题
                  <span className="tw-group-note">44 / 32 / 24 / 18 pt 固定字阶 · 每页 ≤ 6 行自动分页 · 4 种标准版式</span>
                </h4>
                <div className="tw-grid tw-grid-featured">
                  {visualFamilies.map((f) => {
                    const t = TEMPLATES[f]
                    const on = t.id === current.id
                    const hot = t.id === peekId
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`tw-card tw-card-featured${on ? ' active' : ''}${hot ? ' hot' : ''}`}
                        onClick={() => {
                          onPick(t.id)
                          onClose()
                        }}
                        onMouseEnter={() => setPeekId(t.id)}
                        onFocus={() => setPeekId(t.id)}
                        aria-pressed={on}
                        title={`${labelOf(t)} · ${FAMILIES[f].note}`}
                      >
                        <Canvas theme={t} slide={cover} />
                        <span className="tw-cap">
                          <span className="tw-name">{labelOf(t)}</span>
                          <span className="tw-badge flagship">公开课</span>
                          {t.id === recommendedId && <span className="tw-badge">推荐</span>}
                          {on && <span className="tw-badge now">当前</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {filter !== 'visual' &&
              classicFamilies.map((f) => {
                const fam = FAMILIES[f]
                const list = familyTemplates(f)
                return (
                  <section className="tw-group" key={f}>
                    <h4 className="tw-group-head">
                      {fam.name}
                      <span className="tw-group-note">{fam.note}</span>
                    </h4>
                    <div className="tw-grid">
                      {list.map((t) => {
                        const on = t.id === current.id
                        const hot = t.id === peekId
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={`tw-card${on ? ' active' : ''}${hot ? ' hot' : ''}`}
                            onClick={() => {
                              onPick(t.id)
                              onClose()
                            }}
                            onMouseEnter={() => setPeekId(t.id)}
                            onFocus={() => setPeekId(t.id)}
                            aria-pressed={on}
                            title={`${labelOf(t)} · ${fam.note}`}
                          >
                            <Canvas theme={t} slide={slide} />
                            <span className="tw-cap">
                              <span className="tw-name">{labelOf(t)}</span>
                              {t.id === recommendedId && <span className="tw-badge">推荐</span>}
                              {on && <span className="tw-badge now">当前</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
          </div>

          <aside className="tw-peek">
            <Canvas theme={peek} slide={cover} big />
            <Canvas theme={peek} slide={slide} big />
            <p className="tw-peek-name">{labelOf(peek)}</p>
            <p className="tw-peek-fits">适合：{FAMILIES[peek.family].fits.join(' / ')}</p>
            <p className="tw-peek-note">{FAMILIES[peek.family].note}</p>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => {
                onPick(peek.id)
                onClose()
              }}
              disabled={peek.id === current.id}
            >
              {peek.id === current.id ? '当前正在使用' : '应用这套模板'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}