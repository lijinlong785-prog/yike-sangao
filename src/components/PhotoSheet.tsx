import { useEffect, useRef, useState } from 'react'
import type { LLMConfig } from '../lib/llm'
import {
  SAMPLE_RECOGNITION,
  fileToDataUrl,
  recognizePhoto,
  urlToDataUrl,
  type PhotoRecognition,
} from '../lib/vision'

interface Props {
  open: boolean
  cfg: LLMConfig
  onClose: () => void
  onApply: (result: PhotoRecognition) => void
}

export default function PhotoSheet({ open, cfg, onClose, onApply }: Props) {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState<PhotoRecognition | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setError('')
      setResult(null)
      setPreview('')
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('只支持图片文件，换一张试试。')
      return
    }
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      setPreview(dataUrl)
      const recognized = await recognizePhoto(dataUrl, cfg)
      setResult(recognized)
    } catch (e) {
      setError(e instanceof Error ? e.message : '识别失败，请手动填写。')
    } finally {
      setBusy(false)
    }
  }

  async function handleSample() {
    setError('')
    setResult(null)
    setPreview('/sample-page.jpg')
    setBusy(true)
    // 不管浏览器里有没有 key 都先让视觉模型真认一遍（落点由 endpointOf 裁决，
    // 没 key 走同源代理）；识别失败再落离线结果，流程不断
    try {
      const dataUrl = await urlToDataUrl('/sample-page.jpg')
      setResult(await recognizePhoto(dataUrl, cfg))
      return
    } catch {
      // 忽略，走下面的离线结果
    } finally {
      setBusy(false)
    }
    setResult(SAMPLE_RECOGNITION)
  }

  return (
    <div className="sheet-mask" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>拍教材 / 课件</h3>
          <button className="sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="sheet-sub">
          拍一页教材或课件，自动认出课题、学段、年级和本页要点。认出来的内容可以改。
        </p>

        <div
          className={dragging ? 'dropzone dragging' : 'dropzone'}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void handleFile(e.dataTransfer.files?.[0])
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.6A2 2 0 0 1 9.5 4.5h5a2 2 0 0 1 1.7 1L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          <strong>把图片拖到这里</strong>
          <span>或者点击选择文件</span>
        </div>

        <div className="sheet-actions">
          <button className="btn outline sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            选择图片
          </button>
          <button className="btn outline sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
            用手机拍
          </button>
          <button className="link-btn" onClick={() => void handleSample()} disabled={busy}>
            试一张示例图
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {preview && (
          <img className="photo-preview" src={preview} alt="待识别的教材页" style={{ marginTop: 16 }} />
        )}

        {busy && (
          <div className="skeleton-wrap" aria-live="polite">
            <div className="skeleton w-40" />
            <div className="skeleton w-80" />
            <div className="skeleton w-60" />
            <p className="hint" style={{ marginTop: 2 }}>
              正在认出这一页的内容…
            </p>
          </div>
        )}

        {error && (
          <div className="alert" style={{ marginTop: 16 }}>
            {error}
            <div style={{ marginTop: 8 }}>
              <button className="link-btn" onClick={onClose}>
                手动填写
              </button>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="recognized">
              <div className="recognized-row">
                <b>课题</b>
                <span>{result.topic}</span>
              </div>
              <div className="recognized-row">
                <b>学段年级</b>
                <span>
                  {result.stage}
                  {result.grade}
                </span>
              </div>
              <div className="recognized-row">
                <b>课时</b>
                <span>{result.period || '未识别'}</span>
              </div>
              <div className="recognized-row">
                <b>教材版本</b>
                <span>{result.textbook || '未识别'}</span>
              </div>
              <div className="recognized-row">
                <b>本页要点</b>
                <span>
                  {result.points.length === 0
                    ? '未识别到要点'
                    : result.points.map((p, i) => (
                        <span key={i} style={{ display: 'block' }}>
                          {i + 1}. {p}
                        </span>
                      ))}
                </span>
              </div>
            </div>

            <div className="sheet-actions">
              <button
                className="btn primary sm"
                onClick={() => {
                  onApply(result)
                  onClose()
                }}
              >
                用这个结果
              </button>
              <button className="btn outline sm" onClick={() => void handleSample()} disabled={busy}>
                换一张示例
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
