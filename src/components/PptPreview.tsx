/**
 * 学生版课堂 PPT 的预览（结果页右栏切到「学生版」时渲染）。
 *
 * 铁律：这一层显示什么，导出的 .pptx 就是什么。
 *   StudentSlide[] → place(slide, template) → Placed[] → 百分比画布 & pptx.ts renderPlaced
 *
 * 2026 升级：
 *   · 点击 PPT 画面直接展开编辑面板，点击画面插画直接触发本地换图；
 *   · 每页支持「本地上传 / 替换 / 移除配图」，自动裁切压缩为 16:9（1280×720 JPEG），
 *     写入 edits.ts 的 SlidePatch.illustration，支持 40 步撤销、换模板保留并直写 .pptx。
 */
import { useRef, useState } from 'react'
import { SLIDE_LABELS, hasSlideScenes, type StudentSlide } from '../lib/slides'
import { backdropFor } from '../lib/backdrop'
import { paperOf, type DeckTheme } from '../lib/theme'
import { FOOT_SLOT, place, type Placed } from '../lib/deck2/place'
import { FONT_STACK, type DeckTheme as TemplateTheme } from '../lib/deck2/theme'
import { INSERTABLE, INSERT_LABELS, newPage, type InsertKind } from '../lib/deck2/newPage'
import type { PageRef, SlidePatch } from '../lib/deck2/edits'
import type { PptxExportState } from '../lib/student'
import BackdropSvg from './BackdropSvg'

interface Props {
  topic: string
  slides: StudentSlide[]
  theme: DeckTheme
  /** 这一叠按哪套模板排（TASKS/20）：预览与下载读的是同一个对象 */
  template: TemplateTheme
  index: number
  onIndex: (next: number) => void
  exportState: PptxExportState
  making?: boolean
  progress?: string
  idle?: boolean
  stale?: boolean
  base: StudentSlide[]
  refs: PageRef[]
  editedCount: number
  onPatch: (ref: PageRef, patch: SlidePatch) => void
  onMove: (at: number, delta: number) => void
  onRemove: (at: number) => void
  onAdd: (at: number, id: string, slide: StudentSlide) => void
  onUndo?: () => void
  canUndo?: boolean
  onResetEdits: () => void
  onGenerate: () => void
  onCancel?: () => void
  onDownload: (animated: boolean) => void
}

/** 纸宽 1280px ↔ 13.333in ↔ 960pt：1pt = 4/3 px = 0.104167cqw */
const CQW_PER_PT = (4 / 3 / 1280) * 100

let serial = 0
const freshId = (): string => `new-${Date.now().toString(36)}-${(serial += 1)}`

/** 将老师本地选择的图片中心裁切并压缩为 16:9（1280×720 JPEG），确保预览与导出 .pptx 零变形 */
async function compressImageTo16x9(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('无法解析该图片格式'))
    el.src = dataUrl
  })
  const targetW = 1280
  const targetH = 720
  const targetRatio = targetW / targetH
  const srcW = img.naturalWidth || targetW
  const srcH = img.naturalHeight || targetH
  const srcRatio = srcW / srcH

  let sx = 0
  let sy = 0
  let sw = srcW
  let sh = srcH
  if (srcRatio > targetRatio) {
    sw = srcH * targetRatio
    sx = (srcW - sw) / 2
  } else if (srcRatio < targetRatio) {
    sh = srcW / targetRatio
    sy = (srcH - sh) / 2
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH)
  return canvas.toDataURL('image/jpeg', 0.86)
}

export default function PptPreview({
  topic,
  slides,
  theme,
  template,
  index,
  onIndex,
  exportState,
  making = false,
  progress = '',
  idle = false,
  stale = false,
  base,
  refs,
  editedCount = 0,
  onPatch,
  onMove,
  onRemove,
  onAdd,
  onUndo,
  canUndo = false,
  onResetEdits,
  onGenerate,
  onCancel,
  onDownload,
}: Props) {
  const [scriptOpen, setScriptOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [newKind, setNewKind] = useState<InsertKind>('close-read')
  const [imgBusy, setImgBusy] = useState(false)
  const [imgErr, setImgErr] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const total = slides.length
  const at = Math.min(Math.max(0, index), Math.max(0, total - 1))
  const slide = slides[at]
  const ref = refs[at] ?? at
  const baseSlide = typeof ref === 'number' ? base[ref] ?? slide : slide

  if (idle && !slide) {
    return (
      <div className="ppt-panel">
        <p className="ppt-empty">课件改好了吗？改好就生成学生版。</p>
        <div className="ppt-nav">
          <button className="btn primary sm" onClick={onGenerate}>
            生成学生版 PPT
          </button>
          <button className="btn primary sm" disabled title="生成完才能下载">
            还没生成
          </button>
        </div>
      </div>
    )
  }

  if (!slide) {
    return (
      <div className="ppt-panel">
        <p className="ppt-empty">
          {making ? `PPT 正在生成${progress ? ` · ${progress}` : '…'}` : '页面还在准备'}
        </p>
        {making && onCancel && (
          <div className="ppt-nav">
            <button className="btn outline sm" onClick={onCancel} title="停止这次生成">
              停止
            </button>
          </div>
        )}
      </div>
    )
  }

  const paper = template ? template.paper : paperOf(theme, slide.kind)
  const ink = template ? template.ink : theme.ink
  const accent = template ? template.accent : theme.accent
  const label = SLIDE_LABELS[slide.kind]
  const placed: Placed[] = place(slide, template)
  const animated = hasSlideScenes(slides)
  const hasArt = Boolean(slide.illustration && slide.illustration.startsWith('data:image/'))
  const baseHasArt = Boolean(baseSlide?.illustration && baseSlide.illustration.startsWith('data:image/'))

  const footLabel = exportState.busy
    ? `正在编排第 ${exportState.page} / 共 ${exportState.total} 页…`
    : exportState.done
      ? '已下载 ✓'
      : making
        ? '还在画'
        : '下载 PPT'

  const setText = (key: 'title' | 'line' | 'text' | 'note' | 'notes', value: string) =>
    onPatch(ref, { [key]: value === (baseSlide?.[key] ?? '') ? undefined : value })

  const setPatch = (key: 'meta' | 'byline', value: string) =>
    onPatch(ref, { [key]: value === (baseSlide?.[key] ?? '') ? undefined : value })

  const setItems = (text: string) => {
    const list = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const was = baseSlide?.items ?? []
    onPatch(ref, { items: JSON.stringify(list) === JSON.stringify(was) ? undefined : list })
  }

  const triggerPickImage = () => {
    setImgErr('')
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImgBusy(true)
    setImgErr('')
    try {
      const compressed = await compressImageTo16x9(file)
      onPatch(ref, { illustration: compressed })
    } catch (err) {
      setImgErr(err instanceof Error ? err.message : '图片处理失败，请换一张尝试')
    } finally {
      setImgBusy(false)
    }
  }

  const removeImage = () => {
    setImgErr('')
    onPatch(ref, { illustration: baseHasArt ? '' : undefined })
  }

  const restoreImage = () => {
    setImgErr('')
    onPatch(ref, { illustration: undefined })
  }

  const addPage = () => {
    const n = refs.filter((r) => typeof r === 'string').length + 1
    onAdd(at, freshId(), newPage(newKind, n))
    setEditing(true)
  }

  return (
    <div className="ppt-panel">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileChange(e)}
      />

      {stale && (
        <p className="ppt-stale">
          上一版已过期（课件改过了）
          <button className="link-btn" onClick={onGenerate} disabled={making}>
            课件改过了，重新生成
          </button>
        </p>
      )}

      {editedCount > 0 && (
        <p className="ppt-edited">
          已自定义 {editedCount} 处 · 导出的 .pptx 与当前画面完全一致
          {onUndo && (
            <button type="button" className="link-btn" onClick={onUndo} disabled={!canUndo}>
              撤销
            </button>
          )}
          <button type="button" className="link-btn" onClick={onResetEdits}>
            还原原始
          </button>
        </p>
      )}

      {/* 点击画面直接展开编辑；点击画面内插画直接触发本地换图 */}
      <article
        className={`ppt-slide is-placed is-clickable${editing ? ' is-editing' : ''}`}
        style={{ background: paper, color: ink }}
        aria-label={label}
        title="点击画面展开编辑，点击插画可直接替换配图"
        onClick={() => setEditing(true)}
      >
        <BackdropSvg bg={backdropFor(paper, at, slide.kind)} paper={paper} ink={ink} accent={accent} />

        {placed.map((p, i) => {
          const box = {
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            width: `${p.w * 100}%`,
            height: `${p.h * 100}%`,
          }
          if (p.kind === 'image') {
            if (!p.data) return null
            const isFullBg = p.w > 0.99 && p.h > 0.99
            return (
              <div
                key={i}
                className={`ppt-img-hit${isFullBg ? ' is-cover-bg' : ''}`}
                style={box}
                title="点击直接替换本页配图（自动裁切压缩为 16:9）"
                onClick={(e) => {
                  e.stopPropagation()
                  triggerPickImage()
                }}
              >
                <img className="ppt-placed-img" src={p.data} alt="" style={{ left: 0, top: 0, width: '100%', height: '100%' }} />
                {!isFullBg && <span className="ppt-img-badge">点击换图</span>}
              </div>
            )
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
                aria-hidden
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
                aria-hidden
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
                color: p.color ?? ink,
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

        {/* 悬浮快捷提示条：点击换图 / 点击编辑 */}
        <div className="ppt-hover-bar" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ppt-hover-chip" onClick={() => setEditing((v) => !v)}>
            {editing ? '收起编辑' : '✎ 编辑此页'}
          </button>
          {slide.kind !== 'quote' && (
            <button type="button" className="ppt-hover-chip" onClick={triggerPickImage} disabled={imgBusy}>
              {imgBusy ? '处理中…' : hasArt ? '🖼 替换配图' : '＋ 上传配图'}
            </button>
          )}
        </div>

        {slide.kind !== 'cover' && (
          <>
            <div
              className="ppt-placed-text ppt-placed-foot"
              style={{
                left: `${FOOT_SLOT.left.x * 100}%`,
                top: `${FOOT_SLOT.left.y * 100}%`,
                width: `${FOOT_SLOT.left.w * 100}%`,
                height: `${FOOT_SLOT.left.h * 100}%`,
                fontSize: `${9 * CQW_PER_PT}cqw`,
                color: template ? template.muted : undefined,
              }}
            >
              {topic}
            </div>
            <div
              className="ppt-placed-text ppt-placed-foot"
              style={{
                left: `${FOOT_SLOT.right.x * 100}%`,
                top: `${FOOT_SLOT.right.y * 100}%`,
                width: `${FOOT_SLOT.right.w * 100}%`,
                height: `${FOOT_SLOT.right.h * 100}%`,
                fontSize: `${9 * CQW_PER_PT}cqw`,
                color: template ? template.muted : undefined,
                textAlign: 'right',
              }}
            >
              {at + 1} / {total}
            </div>
          </>
        )}
      </article>

      {editing && (
        <div className="ppt-edit">
          <div className="ppt-edit-head">
            <span>正在编辑第 {at + 1} 页 · 实时同步至导出 .pptx</span>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              完成收起
            </button>
          </div>
          <label className="ppt-edit-row">
            <span>标题</span>
            <input
              type="text"
              value={slide.title}
              onChange={(e) => setText('title', e.target.value)}
              aria-label="这一页的标题"
            />
          </label>
          {slide.kind === 'quote' ? (
            <label className="ppt-edit-row">
              <span>原文</span>
              <textarea
                rows={3}
                value={slide.text ?? ''}
                onChange={(e) => setText('text', e.target.value)}
                aria-label="这一页的原文"
              />
            </label>
          ) : (
            <label className="ppt-edit-row">
              <span>这一句</span>
              <input
                type="text"
                value={slide.line ?? ''}
                onChange={(e) => setText('line', e.target.value)}
                aria-label="这一页的问句"
              />
            </label>
          )}
          {slide.kind === 'cover' && (
            <>
              <label className="ppt-edit-row">
                <span>教材</span>
                <input
                  type="text"
                  value={slide.meta ?? ''}
                  placeholder="小学语文 · 五年级"
                  onChange={(e) => setPatch('meta', e.target.value)}
                  aria-label="封面上标注的教材与年级"
                />
              </label>
              <label className="ppt-edit-row">
                <span>班级</span>
                <input
                  type="text"
                  value={slide.byline ?? ''}
                  placeholder="五年级　　班"
                  onChange={(e) => setPatch('byline', e.target.value)}
                  aria-label="封面上的年级班级与授课人"
                />
              </label>
            </>
          )}
          {slide.kind !== 'quote' && (
            <label className="ppt-edit-row">
              <span>条目</span>
              <textarea
                rows={Math.min(6, Math.max(2, slide.items?.length ?? 0))}
                value={(slide.items ?? []).join('\n')}
                placeholder="一行一条，可留空（公开课主题超 6 行自动分页）"
                onChange={(e) => setItems(e.target.value)}
                aria-label="这一页的条目，一行一条"
              />
            </label>
          )}
          {/* 本地上传 / 替换 / 移除配图 */}
          {slide.kind !== 'quote' && (
            <div className="ppt-edit-row ppt-edit-art">
              <span>配图</span>
              <div className="ppt-art-controls">
                {hasArt && (
                  <img className="ppt-art-thumb" src={slide.illustration} alt="当前配图缩略图" />
                )}
                <div className="ppt-art-btns">
                  <button type="button" className="btn outline sm" onClick={triggerPickImage} disabled={imgBusy}>
                    {imgBusy ? '压缩 16:9 中…' : hasArt ? '替换本地配图' : '上传本地配图'}
                  </button>
                  {hasArt && (
                    <button type="button" className="btn ghost sm" onClick={removeImage}>
                      移除配图
                    </button>
                  )}
                  {baseHasArt && slide.illustration !== baseSlide?.illustration && (
                    <button type="button" className="btn ghost sm" onClick={restoreImage}>
                      恢复默认图
                    </button>
                  )}
                </div>
                {imgErr && <span className="ppt-art-err">{imgErr}</span>}
              </div>
            </div>
          )}
          <label className="ppt-edit-row">
            <span>讲稿</span>
            <textarea
              rows={3}
              value={slide.notes ?? ''}
              placeholder="上台念的第一句（导出至 PowerPoint 演讲者备注）"
              onChange={(e) => setText('notes', e.target.value)}
              aria-label="这一页的讲稿（进 PowerPoint 演讲者备注）"
            />
          </label>
        </div>
      )}

      <div className="ppt-script">
        <button
          type="button"
          className="link-btn plain"
          onClick={() => setScriptOpen((v) => !v)}
          aria-expanded={scriptOpen}
        >
          讲稿备注 {scriptOpen ? '▾' : '▸'}
        </button>
        {scriptOpen && <p className="ppt-script-text">{slide.notes || '（这一页还没有口播）'}</p>}
      </div>

      <div className="ppt-nav">
        <button className="btn outline sm" disabled={at === 0} onClick={() => onIndex(at - 1)}>
          ←
        </button>
        <span className="ppt-count">
          {at + 1} / {total}
        </span>
        <button className="btn outline sm" disabled={at >= total - 1} onClick={() => onIndex(at + 1)}>
          →
        </button>
        <span className="ppt-pageops">
          <button
            type="button"
            className="btn outline sm"
            disabled={at === 0}
            title="这一页往前挪"
            onClick={() => onMove(at, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn outline sm"
            disabled={at >= total - 1}
            title="这一页往后挪"
            onClick={() => onMove(at, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn outline sm"
            disabled={total <= 1}
            title="把这一页从这一叠里删掉（导出的 pptx 里也没有）"
            onClick={() => onRemove(at)}
          >
            删
          </button>
          <select
            className="ppt-newkind"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as InsertKind)}
            aria-label="新加的这一页用哪种页型"
            title="新加的那一页用哪种页型（与整份 PPT 同一套）"
          >
            {INSERTABLE.map((kind) => (
              <option key={kind} value={kind}>
                {INSERT_LABELS[kind]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn outline sm"
            title="按左边选的页型，在这一页后面插一页（导出的 pptx 里也有）"
            onClick={addPage}
          >
            ＋ 加一页
          </button>
        </span>
        <button type="button" className="btn outline sm" onClick={() => setEditing((v) => !v)}>
          {editing ? '收起编辑' : '编辑此页'}
        </button>
        {making && onCancel ? (
          <button className="btn outline sm" onClick={onCancel} title="停止这次生成，已经出来的页会留着">
            停止
          </button>
        ) : (
          <button
            className="btn primary sm"
            onClick={() => onDownload(animated)}
            disabled={exportState.busy || making}
            title={making ? progress || 'PPT 还在生成' : undefined}
          >
            {footLabel}
          </button>
        )}
      </div>
    </div>
  )
}