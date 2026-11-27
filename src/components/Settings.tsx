import { useState } from 'react'
import type { LLMConfig } from '../lib/llm'
import { DEFAULT_DENSITY, DENSITY_LABELS, type DensityLock } from '../lib/density'

interface Props {
  value: LLMConfig
  onChange: (next: LLMConfig) => void
}

/** 课堂密度锁档选项：'auto' = 不锁（模型按判据自定），其余三档手动锁死 */
const DENSITY_OPTIONS: DensityLock[] = ['auto', 'lean', 'standard', 'rich']

const PRESETS = [
  {
    name: '硅基流动（推荐）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3.2',
  },
  { name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
]

export default function Settings({ value, onChange }: Props) {
  const [form, setForm] = useState<LLMConfig>(value)
  const [saved, setSaved] = useState(false)

  function set<K extends keyof LLMConfig>(key: K, v: LLMConfig[K]) {
    setForm((f) => ({ ...f, [key]: v }))
    setSaved(false)
  }

  function handleSave() {
    onChange(form)
    setSaved(true)
  }

  return (
    <div className="settings">
      <h2>设置</h2>
      {/* 页面默认只有这一句：没有「必填 key」这条路（TASKS/13 §4.6） */}
      <p className="sub">已连好，直接生成即可。模型 key 在服务端，你不用填任何东西。</p>

      <section className="card">
        <div className="field">
          <span className="label">
            课堂密度（不锁 = 模型按页自判、三档并集做安全网，不锁时不保证 ≤ 一行上限；建议锁「
            {DENSITY_LABELS[DEFAULT_DENSITY]}
            」，也可手动锁死一档）
          </span>
          <div className="preset-row">
            {DENSITY_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={(form.density ?? 'auto') === opt ? 'chip active' : 'chip'}
                onClick={() => set('density', opt)}
              >
                {opt === 'auto' ? '自动' : DENSITY_LABELS[opt]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">
            配插画（默认开）：一份最多 6 张，千问绘本风优先（服务端额度），画不成自动降级，最后还有矢量兜底；
            每张要等十几秒，现场演示时不建议开——不打开就只出纯文字版，页型、换模板、导出一样不少
          </span>
          <div className="preset-row">
            {(['off', 'on'] as const).map((opt) => (
              <button
                key={opt}
                className={(form.illust ?? 'on') === opt ? 'chip active' : 'chip'}
                onClick={() => set('illust', opt)}
              >
                {opt === 'on' ? '配插画（默认）' : '不配'}
              </button>
            ))}
          </div>
        </div>

        <div className="actions">
          <button className="btn primary" onClick={handleSave}>
            保存
          </button>
          {saved && <span className="saved">已保存</span>}
        </div>
      </section>

      {/* 自带额度是「可选」而不是「必填」：默认折着，不占版面也不挡路 */}
      <details className="card">
        <summary>用自己的额度（可选）</summary>
        <div className="byok-body">
          <p className="hint">
            填了自己的 key，请求就直连你填的地址、走你的账；不填也完全能用，key 由服务端注入。
          </p>

          <div className="preset-row">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className={form.baseUrl === p.baseUrl ? 'chip active' : 'chip'}
                onClick={() => {
                  // 点预设只换地址与模型，已填的 key 一个字都不动
                  set('baseUrl', p.baseUrl)
                  set('model', p.model)
                }}
              >
                {p.name}
              </button>
            ))}
          </div>

          <label className="field">
            <span className="label">接口地址（Base URL）</span>
            <input
              value={form.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value)}
              placeholder="https://api.siliconflow.cn/v1"
            />
          </label>

          <label className="field">
            <span className="label">模型名称</span>
            <input
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="deepseek-ai/DeepSeek-V3.2"
            />
          </label>

          <label className="field">
            <span className="label">API Key</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder="留空就走服务端"
            />
          </label>

          <div className="actions">
            <button className="btn primary" onClick={handleSave}>
              保存
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setForm({ ...value, apiKey: '', imageKey: undefined })
                setSaved(false)
              }}
            >
              清空自带的 key
            </button>
            {saved && <span className="saved">已保存</span>}
          </div>
        </div>
      </details>

      <p className="hint">不填 key 也能把整条流程跑完；清空浏览器存储后直接输入课题即可。</p>
    </div>
  )
}
