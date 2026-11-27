/**
 * 课件的一页（16:9 纸面 + 逐字段可编辑）。
 *
 * 从旧的 Preview.tsx 里搬出来：结果页右栏切到「课件」时渲染的就是这一页，
 * 改字、加条、删页、插页、调序、恢复单页都写回 App 持有的那一叠（09 §E）。
 * 这里不持有任何页面副本，只把用户的动作交给上层。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { LAYOUT_NAME, type DeckPage } from '../lib/deck'

interface Props {
  page: DeckPage
  index: number
  total: number
  topic: string
  /** 纸面纹理（lines / dots 的内联 SVG），落在卡片自身；none 时为 undefined */
  texture?: CSSProperties
  onPatch: (patch: Partial<DeckPage>) => void
  onBullet: (index: number, text: string) => void
  onAddBullet: () => void
  onDelete: () => void
  onInsert: () => void
  onMove: (delta: number) => void
  onRestore: () => void
}

export default function DeckPageView({
  page,
  index,
  total,
  topic,
  texture,
  onPatch,
  onBullet,
  onAddBullet,
  onDelete,
  onInsert,
  onMove,
  onRestore,
}: Props) {
  const cover = page.kind === 'cover'
  const [menu, setMenu] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const bullets = page.bullets ?? []
  // 版式是 App 排好的推导值；直接手写的 DeckPage（测试、旧存档）在这里兜底
  const layout = page.layout ?? 'cards'
  const visual = page.visual ?? LAYOUT_NAME[layout]

  return (
    <article className={`pv-page layout-${layout}${cover ? ' is-cover' : ''}`} style={texture}>
      <div className="pv-ops">
        <button className="pv-ops-btn" onClick={() => setMenu((v) => !v)} aria-label="页面操作">
          ⋯
        </button>
        {menu && (
          <div className="pv-ops-menu">
            <button
              disabled={index === 0}
              onClick={() => {
                setMenu(false)
                onMove(-1)
              }}
            >
              上移
            </button>
            <button
              disabled={index >= total - 1}
              onClick={() => {
                setMenu(false)
                onMove(1)
              }}
            >
              下移
            </button>
            <button
              onClick={() => {
                setMenu(false)
                onInsert()
              }}
            >
              下面插一页
            </button>
            <button
              onClick={() => {
                setMenu(false)
                onRestore()
              }}
            >
              恢复这页
            </button>
            {!cover && (
              <button
                onClick={() => {
                  setMenu(false)
                  onDelete()
                }}
              >
                删除这页
              </button>
            )}
          </div>
        )}
      </div>

      <div className="pv-page-label">
        {page.label}
        {page.duration && <span className="pv-duration">{page.duration}</span>}
        {/* 每页至少一个视觉元素：版式名就是这一页的视觉元素，不靠配图 */}
        <span className="pv-visual-chip">{visual}</span>
        {page.userEdited && <span className="pv-edited">改过</span>}
      </div>
      <h3 className="pv-page-title">
        <Editable
          value={page.title}
          ariaLabel="页面标题"
          onSave={(v) => {
            if (v.trim()) onPatch({ title: v })
          }}
        />
      </h3>
      <div className={cover ? 'pv-rule short' : 'pv-rule'} />

      {page.prep ? (
        <div className="pv-prep">
          {page.prep.map((g) => (
            <div className="pv-prep-col" key={g.heading}>
              <h4>{g.heading}</h4>
              {g.items.length === 0 ? (
                <p className="pv-prep-item">本课不需要</p>
              ) : (
                g.items.map((it) => (
                  <p className="pv-prep-item" key={it.name}>
                    <b>{it.name}</b>
                    {it.usage}
                    {it.searchHint && <span className="pv-search">检索：{it.searchHint}</span>}
                  </p>
                ))
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="pv-bullets">
          {bullets.map((b, i) => (
            <li key={i}>
              <Editable value={b} ariaLabel={`第 ${i + 1} 条要点`} onSave={(v) => onBullet(i, v)} />
            </li>
          ))}
          <li className="pv-bullet-add">
            <button className="link-btn plain" onClick={onAddBullet}>
              ＋ 加一条
            </button>
          </li>
        </ul>
      )}

      {page.question && (
        <p className="pv-question">
          问：
          <Editable value={page.question} ariaLabel="底部提问" onSave={(v) => onPatch({ question: v })} />
        </p>
      )}

      {layout === 'full' && <div className="pv-visual-frame" aria-hidden />}

      {page.figureHint && layout !== 'full' && <div className="pv-figure" aria-hidden />}

      <div className="pv-notes">
        <button className="link-btn plain" onClick={() => setNotesOpen((v) => !v)}>
          备注{page.notes ? '' : '（空）'} {notesOpen ? '▾' : '▸'}
        </button>
        {notesOpen && <NotesEditor notes={page.notes} onSave={(v) => onPatch({ notes: v })} />}
      </div>

      <div className="pv-page-foot">
        <span>《{topic}》</span>
        <span>
          {index + 1} / {total}
        </span>
      </div>
    </article>
  )
}

/**
 * 一句话的编辑位（TASKS/09 §E.2）：平时看不出可以改，点一下变输入框，失焦保存。
 * Esc 取消；Enter 提交（多行则留给换行）。
 */
export function Editable({
  value,
  onSave,
  ariaLabel,
  placeholder = '（点这里写）',
}: {
  value: string
  onSave: (next: string) => void
  ariaLabel: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  function start() {
    cancelled.current = false
    setDraft(value)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft !== value) onSave(draft)
  }

  if (!editing) {
    return (
      <span
        className="pv-edit"
        role="button"
        tabIndex={0}
        title="点一下改这句话"
        onClick={start}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            start()
          }
        }}
      >
        {value || <span className="pv-edit-empty">{placeholder}</span>}
      </span>
    )
  }

  return (
    <input
      className="pv-edit-input"
      autoFocus
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** 备注：展开才挂一个文本域（不展开时一页不多出一个可点区）*/
function NotesEditor({ notes, onSave }: { notes: string; onSave: (next: string) => void }) {
  const [draft, setDraft] = useState(notes)
  useEffect(() => setDraft(notes), [notes])
  return (
    <textarea
      className="pv-notes-input"
      rows={4}
      value={draft}
      aria-label="演讲者备注"
      placeholder="（点这里写口播）"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== notes) onSave(draft)
      }}
    />
  )
}