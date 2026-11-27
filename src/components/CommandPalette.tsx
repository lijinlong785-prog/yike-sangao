/**
 * Linear 级 ⌘K 全局备课指令面板（Portal 挂载至 document.body）
 *
 * 支持模糊搜索 + 方向键直达：
 *   · 切换课型时长（10 / 20 / 30 / 40 分）
 *   · 跳转任意教学环节（双栏同步定位）
 *   · 切换三大公开课视觉主题（清新水彩 / 简洁商务 / 童趣手绘）
 *   · 打开模板墙 / 粉笔黑板 / 上台提词器 / 切换视图
 *   · 一键执行导出（Word / 教师版 PPTX / 学生版 PPTX / Markdown / 复制全稿 / 全屏演示 / 打印）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface CommandItem {
  id: string
  group: string
  title: string
  subtitle?: string
  shortcut?: string
  keywords?: string
  disabled?: boolean
  run: () => void
}

interface Props {
  open: boolean
  commands: CommandItem[]
  onClose: () => void
}

function fuzzyMatch(item: CommandItem, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const hay = `${item.title} ${item.subtitle ?? ''} ${item.group} ${item.keywords ?? ''}`.toLowerCase()
  if (hay.includes(query)) return true
  // 顺序子序列模糊匹配（例如输入 "sc" 命中 "水彩" 或 "40" 命中 "40分公开课"）
  let pos = 0
  for (const ch of query) {
    const idx = hay.indexOf(ch, pos)
    if (idx < 0) return false
    pos = idx + 1
  }
  return true
}

export default function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => commands.filter((c) => fuzzyMatch(c, query)), [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      window.setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => (filtered.length ? (c + 1) % filtered.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => (filtered.length ? (c - 1 + filtered.length) % filtered.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const hit = filtered[cursor]
        if (hit && !hit.disabled) {
          onClose()
          hit.run()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, cursor, onClose])

  // 键盘移动时自动滚入可视区域
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  if (!open) return null

  // 按分组归类渲染，同时保留全局平坦下标用于键盘选择
  const grouped: { group: string; items: { item: CommandItem; flatIdx: number }[] }[] = []
  filtered.forEach((item, flatIdx) => {
    let bucket = grouped.find((g) => g.group === item.group)
    if (!bucket) {
      bucket = { group: item.group, items: [] }
      grouped.push(bucket)
    }
    bucket.items.push({ item, flatIdx })
  })

  const modal = (
    <div className="cmd-backdrop" onClick={onClose} role="presentation">
      <div
        className="cmd-panel"
        role="dialog"
        aria-modal="true"
        aria-label="全局备课指令台"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-search-row">
          <span className="cmd-search-icon" aria-hidden>⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索指令：切时长、跳环节、换水彩主题、打开黑板、导出 Word / PPTX…"
            aria-label="搜索备课指令"
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>

        <div className="cmd-list" ref={listRef}>
          {grouped.length === 0 ? (
            <p className="cmd-empty">没有找到匹配「{query}」的指令</p>
          ) : (
            grouped.map((g) => (
              <div className="cmd-group" key={g.group}>
                <div className="cmd-group-title">{g.group}</div>
                {g.items.map(({ item, flatIdx }) => (
                  <button
                    key={item.id}
                    type="button"
                    data-cmd-idx={flatIdx}
                    disabled={item.disabled}
                    className={`cmd-item${flatIdx === cursor ? ' active' : ''}`}
                    onMouseEnter={() => setCursor(flatIdx)}
                    onClick={() => {
                      if (item.disabled) return
                      onClose()
                      item.run()
                    }}
                  >
                    <span className="cmd-item-main">
                      <span className="cmd-item-title">{item.title}</span>
                      {item.subtitle && <span className="cmd-item-sub">{item.subtitle}</span>}
                    </span>
                    {item.shortcut && <kbd className="cmd-item-key">{item.shortcut}</kbd>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <footer className="cmd-foot">
          <span>↑↓ 选择</span>
          <span>↵ 执行</span>
          <span>ESC 关闭</span>
        </footer>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
