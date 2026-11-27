import { useEffect, useRef, useState } from 'react'
import {
  getSpeechRecognition,
  parseLessonSpeech,
  type SpeechRecognitionLike,
} from '../lib/speech'
import type { LessonInput } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onApply?: (partial: Partial<LessonInput>) => void
  /** 给了这个就把原句交给调用方，由它写进输入框 */
  onRawText?: (text: string) => void
}

const MAX_MS = 15_000

export default function VoiceSheet({ open, onClose, onApply, onRawText }: Props) {
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [manual, setManual] = useState('')
  const [error, setError] = useState('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const timerRef = useRef<number | null>(null)

  const supported = typeof window !== 'undefined' && Boolean(getSpeechRecognition())

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function stop() {
    clearTimer()
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
  }

  useEffect(() => {
    if (!open) {
      recRef.current?.abort()
      recRef.current = null
      clearTimer()
      setListening(false)
      setText('')
      setInterim('')
      setManual('')
      setError('')
    }
  }, [open])

  useEffect(
    () => () => {
      recRef.current?.abort()
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    []
  )

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

  if (!open) return null

  function start() {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setError('当前浏览器不支持语音输入。可以下面直接打字，或者用 Safari 打开。')
      return
    }
    setError('')
    setText('')
    setInterim('')

    const rec = new Ctor()
    rec.lang = 'zh-CN'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      let final = ''
      let temp = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i]
        const piece = item?.[0]?.transcript ?? ''
        if (item.isFinal) final += piece
        else temp += piece
      }
      if (final) setText((prev) => prev + final)
      setInterim(temp)
    }

    rec.onerror = (event) => {
      const code = event.error ?? ''
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('麦克风权限被拒绝了。可以在下面把刚才那句话打出来。')
      } else if (code === 'no-speech') {
        setError('没有听到声音。靠近一点再说一次，或者直接打字。')
      } else if (code === 'network') {
        setError('语音识别服务连不上。可以直接打字，流程不受影响。')
      } else {
        setError('语音识别中断了。可以直接打字，或者再试一次。')
      }
      clearTimer()
      setListening(false)
    }

    rec.onend = () => {
      clearTimer()
      setListening(false)
    }

    try {
      rec.start()
      recRef.current = rec
      setListening(true)
      clearTimer()
      timerRef.current = window.setTimeout(() => rec.stop(), MAX_MS)
    } catch {
      setError('麦克风启动失败。可以直接打字，或者用 Safari 打开。')
      setListening(false)
    }
  }

  function handleApply() {
    const spoken = `${text}${interim}`.trim()
    const source = spoken || manual.trim()
    if (!source) {
      setError('还没有识别到文字。说一句再试，或者直接在下面打字。')
      return
    }
    if (recRef.current) stop()
    if (onRawText) {
      onRawText(source)
      onClose()
      return
    }
    const parsed = parseLessonSpeech(source)
    if (!parsed.topic) {
      setError('听清了，但没找到课题名。把课题单独写一行再确认。')
      setManual(source)
      return
    }
    onApply?.(parsed)
    onClose()
  }

  return (
    <div className="sheet-mask" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>说一句</h3>
          <button className="sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="sheet-sub">
          直接说清楚要讲哪一课。比如：「我要讲五年级上册的桂花雨，第二课时」。
        </p>

        {!supported && (
          <div className="alert" style={{ marginBottom: 14 }}>
            当前浏览器不支持语音输入（Chrome 桌面版在国内通常不可用）。请用 Safari
            打开，或者直接打字。
          </div>
        )}

        {supported && (
          <div className="mic-stage">
            <button
              className={listening ? 'mic-btn live' : 'mic-btn'}
              onClick={listening ? stop : start}
              aria-label={listening ? '停止识别' : '开始识别'}
            >
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <p className="mic-tip">
              {listening ? '正在听…说完点一下停止（最长 15 秒）' : '点一下开始说'}
            </p>
          </div>
        )}

        <div className="live-text" aria-live="polite">
          {text}
          {interim && <span className="interim">{interim}</span>}
          {!text && !interim && <span className="interim">识别到的文字会出现在这里</span>}
        </div>

        {error && (
          <div className="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="field" style={{ marginTop: 14 }}>
          <span className="label">
            {supported ? '或者直接打一句' : '把刚才那句话打出来'}
          </span>
          <textarea
            rows={2}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="我要讲五年级上册的桂花雨，第二课时"
          />
        </div>

        <p className="speech-hint">
          试着说：我要讲五年级上册的桂花雨，第二课时
        </p>

        <div className="sheet-actions">
          <button className="btn primary sm" onClick={handleApply}>
            用这段
          </button>
          <button
            className="btn outline sm"
            onClick={() => {
              if (recRef.current) stop()
              setText('')
              setInterim('')
              setManual('')
              setError('')
            }}
          >
            重来
          </button>
        </div>
      </div>
    </div>
  )
}
