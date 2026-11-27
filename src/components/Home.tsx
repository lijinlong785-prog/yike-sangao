/**
 * Editorial Studio 极简大留白首屏（2026 Qoder StudyHack）
 *
 * Perplexity / Apple 风格：
 *   · 精致眉标 + 渐变衬线主标题 + 一句话核心价值；
 *   · 磨砂浮起一体化备课输入框，内置 10分试讲 / 20分精简 / 30分标准 / 40分公开课 快捷胶囊；
 *   · 课文原文收拢为可折叠抽屉；
 *   · 下方 3 列精选示范课画廊（带学段/学科标签与 16:9 预置插画），免 API Key 0 秒直达。
 */
import { useEffect, useRef, useState } from 'react'
import type { LessonInput } from '../types'
import { parseLessonSpeech } from '../lib/speech'
import type { LLMConfig } from '../lib/llm'
import type { PhotoRecognition } from '../lib/vision'
import { findText, splitQuotes } from '../data/texts'
import { EXAMPLES, type ExampleEntry } from '../data/examples'
import { builtinArtFor } from '../data/builtinArt'
import { locateTopic } from '../lib/locate'
import PhotoSheet from './PhotoSheet'
import VoiceSheet from './VoiceSheet'
import RunMeter from './RunMeter'

interface Props {
  value: LessonInput
  loading: boolean
  error: string
  cfg: LLMConfig
  onGenerate: (input: LessonInput) => void
  onOpenDemo: (entry: ExampleEntry, durationSec: number) => void
  onCancel: () => void
  onOpenSettings: () => void
}

/** 课时范围下探至 10–45 分钟（覆盖 10 分试讲到 40 分公开课） */
export const DURATION_MIN = 10
export const DURATION_MAX = 45
const DURATION_DEFAULT = 40

const DURATION_PRESETS = [
  { minutes: 10, label: '10分试讲' },
  { minutes: 20, label: '20分精简' },
  { minutes: 30, label: '30分标准' },
  { minutes: 40, label: '40分公开课' },
] as const

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return DURATION_DEFAULT
  return Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(n)))
}

function PaperclipIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M20 11.5 11.3 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8.2-8.2" />
    </svg>
  )
}

export default function Home({
  value,
  loading,
  error,
  cfg,
  onGenerate,
  onOpenDemo,
  onCancel,
  onOpenSettings,
}: Props) {
  const [text, setText] = useState(value.topic ?? '')
  const [essay, setEssay] = useState(value.text ?? '')
  const [essayOpen, setEssayOpen] = useState(Boolean(value.text))
  const [minutes, setMinutes] = useState(
    value.duration ? clampMinutes(Math.round(value.duration / 60)) : DURATION_DEFAULT
  )
  const [attachOpen, setAttachOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [locating, setLocating] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setStartedAt(loading ? Date.now() : 0)
  }, [loading])

  useEffect(() => {
    if (!attachOpen) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setAttachOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [attachOpen])

  const canSubmit = text.trim().length > 0 && !loading && !locating

  async function submit() {
    if (!canSubmit || locating) return
    setNotice('')
    setAttachOpen(false)
    const parsed = parseLessonSpeech(text)
    const topic = (parsed.topic ?? '').trim() || text.trim()
    const pasted = splitQuotes(essay).join('\n')
    const builtin = findText(topic)?.quotes.join('\n') ?? ''

    let source = pasted || builtin
    let located: Awaited<ReturnType<typeof locateTopic>> = null
    if (!source) {
      setLocating(true)
      setNotice('在网上查这一课的课本原文…')
      try {
        located = await locateTopic(topic)
        source = located?.quotes.join('\n') ?? ''
        setNotice(
          located
            ? `查到了：${[located.textbook, located.grade, located.lesson].filter(Boolean).join(' · ')}`
            : '这一课未查到课本原文，将按课题直接生成备课包。'
        )
      } finally {
        setLocating(false)
      }
    }

    onGenerate({
      topic,
      stage: parsed.stage ?? '',
      grade: parsed.grade ?? located?.grade ?? '',
      subject: parsed.subject ?? located?.subject ?? '',
      period: parsed.period ?? '',
      textbook: parsed.textbook ?? located?.textbook ?? '',
      duration: clampMinutes(minutes) * 60,
      text: source || undefined,
    })
  }

  function applyPhoto(result: PhotoRecognition) {
    const period = result.period ? `，${result.period}` : ''
    setText(`我要讲${result.grade ?? ''}的《${result.topic}》${period}`)
    setNotice('')
  }

  function applyVoice(raw: string) {
    setText(raw)
    setNotice('')
  }

  // 精选 6 门示范课（首排优先展示《荷塘月色》《桂花雨》《草船借箭》，次排《圆的面积》《长方体的认识》《背影》）
  const featuredDemos = EXAMPLES.slice(0, 6)

  return (
    <div className="studio-home">
      <section className="studio-hero">
        <div className="studio-eyebrow">
          <span className="studio-eyebrow-dot" />
          <span>2026 QODER STUDYHACK · 教师备课生产力工作台</span>
        </div>
        <h1 className="studio-title">一课三稿</h1>
        <p className="studio-subtitle">
          输入课题与课时，同步生成可原地编辑的<strong>教学设计</strong>、<strong>教师课件</strong>与<strong>公开课级学生 PPT</strong>，改完直出 Word / .pptx
        </p>
      </section>

      {/* 磨砂浮起一体化备课输入框 */}
      <div className="studio-composer" ref={boxRef}>
        <div className="studio-input-wrap">
          <button
            type="button"
            className="ask-attach"
            aria-label="拍照或口述"
            title="拍照识教材 / 语音口述"
            onClick={() => setAttachOpen((v) => !v)}
          >
            <PaperclipIcon />
          </button>
          {attachOpen && (
            <div className="ask-attach-menu">
              <button
                type="button"
                onClick={() => {
                  setAttachOpen(false)
                  setPhotoOpen(true)
                }}
              >
                📷 拍教材目录
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachOpen(false)
                  setVoiceOpen(true)
                }}
              >
                🎙 语音口述课题
              </button>
            </div>
          )}

          <textarea
            autoFocus
            rows={2}
            value={text}
            placeholder="说一句或拍一张：我要讲高一语文《荷塘月色》，第一课时"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void submit()
              }
            }}
          />
        </div>

        {/* 底部控制条：四档课型快捷胶囊 + 自定义分钟 + 生成按钮 */}
        <div className="studio-composer-bar">
          <div className="studio-presets" role="group" aria-label="快捷课型时长">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                className={`studio-pill${minutes === p.minutes ? ' active' : ''}`}
                onClick={() => setMinutes(p.minutes)}
              >
                {p.label}
              </button>
            ))}
            <label className="studio-dur-custom" title="可自定义 10–45 分钟">
              <input
                type="number"
                min={DURATION_MIN}
                max={DURATION_MAX}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                onBlur={() => setMinutes((m) => clampMinutes(m))}
                aria-label="自定义课时分钟数"
              />
              <span>分</span>
            </label>
          </div>

          <div className="studio-submit-wrap">
            <button
              type="button"
              className="studio-drawer-toggle"
              aria-expanded={essayOpen}
              onClick={() => setEssayOpen((v) => !v)}
            >
              {essayOpen ? '收起课文原文 ▴' : `粘贴课文原文${essay.trim() ? '（已填）' : ''} ▾`}
            </button>
            <button
              type="button"
              className={`ask-send${loading ? ' stop' : ''}`}
              disabled={!loading && !canSubmit}
              onClick={loading ? onCancel : () => void submit()}
              title={loading ? '停止这次生成，输入的字都还留着' : undefined}
            >
              {loading ? '停止生成' : '生成三稿 →'}
            </button>
          </div>
        </div>

        {/* 可折叠课文原文抽屉 */}
        {essayOpen && (
          <div className="studio-essay-drawer">
            <div className="studio-essay-head">
              <span>课文原文 / 必讲金句（可选）</span>
              <em>贴整篇会自动按句切分，写入学生版 PPT 原文页；留空自动匹配内置课文库</em>
            </div>
            <textarea
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              placeholder="把这节课要带学生精读的原句贴在这里，一行一句或整段粘贴均可…"
              rows={4}
            />
          </div>
        )}
      </div>

      {loading && startedAt > 0 && <RunMeter stage="plan" at={startedAt} label="正在撰写一课三稿…" />}

      {error && (
        <div className="alert">
          {error}
          <button className="link-btn" onClick={onOpenSettings}>
            打开设置
          </button>
        </div>
      )}
      {notice && <div className="alert ok">{notice}</div>}

      {/* 3 列精选示范课画廊（免 API Key 0 秒直达） */}
      <section className="studio-gallery" aria-label="精选公开课示范">
        <div className="studio-gallery-head">
          <div>
            <h2>精选公开课示范</h2>
            <p>免配置 API Key · 预置 16:9 无字水彩/几何插画 · 点击即进入完整工作台</p>
          </div>
          <span className="studio-gallery-badge">当前预设：{minutes} 分钟课型</span>
        </div>

        <div className="studio-grid">
          {featuredDemos.map((ex) => {
            const art = builtinArtFor(ex.plan.meta.topic)?.cover
            return (
              <button
                key={ex.id}
                type="button"
                className="demo-card"
                onClick={() => onOpenDemo(ex, clampMinutes(minutes) * 60)}
              >
                <div className="demo-card-cover">
                  {art ? (
                    <img src={art} alt="" />
                  ) : (
                    <div className="demo-card-placeholder">
                      <span>《{ex.label}》</span>
                    </div>
                  )}
                  <div className="demo-card-tags">
                    <span className="demo-tag stage">{ex.plan.meta.stage}{ex.plan.meta.grade}</span>
                    <span className="demo-tag subject">{ex.plan.meta.subject}</span>
                  </div>
                </div>
                <div className="demo-card-body">
                  <div className="demo-card-title">
                    <strong>《{ex.label}》</strong>
                    <span className="demo-card-arrow">进入工作台 →</span>
                  </div>
                  <p className="demo-card-desc">{ex.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <PhotoSheet
        open={photoOpen}
        cfg={cfg}
        onClose={() => setPhotoOpen(false)}
        onApply={applyPhoto}
      />
      <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} onRawText={applyVoice} />
    </div>
  )
}