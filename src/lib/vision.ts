import type { LLMConfig } from './llm'
import { endpointOf } from './endpoint'

export interface PhotoRecognition {
  topic: string
  stage: string
  grade: string
  period: string
  textbook: string
  points: string[]
}

/** 示例教材图的离线识别结果：没有 Key、没有网络也能把流程演示完整 */
export const SAMPLE_RECOGNITION: PhotoRecognition = {
  topic: '桂花雨',
  stage: '小学',
  grade: '五年级',
  period: '第一课时',
  textbook: '部编版',
  points: [
    '本单元语文要素：初步了解课文借助具体事物抒发感情的方法',
    '课文围绕桂花写了爱桂花、摇桂花、念桂花三件事',
    '关键句：这里的桂花再香，也比不上家乡院子里的桂花',
  ],
}

const VISION_PROMPT = `这是一页中小学教材或课件的照片。请识别并只输出 JSON，不要任何解释：
{
  "topic": "课题名，不带书名号",
  "stage": "小学 / 初中 / 高中",
  "grade": "年级，如五年级",
  "period": "课时，如第一课时；看不出来就留空",
  "textbook": "教材版本，如部编版；看不出来就留空",
  "points": ["本页要点，3 到 5 条，每条不超过 30 字"]
}`

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('这张图读不出来，换一张试试。'))
    reader.readAsDataURL(file)
  })
}

/** 把内置示例图读成 dataURL，没 Key 时也能走代理让视觉模型识别一遍 */
export async function urlToDataUrl(src: string): Promise<string> {
  const res = await fetch(src)
  if (!res.ok) throw new Error('示例图加载失败。')
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('示例图加载失败。'))
    reader.readAsDataURL(blob)
  })
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim()
}

/**
 * 识图专用模型链：只认「能吃图片」的模型，不跟文本那一条链走。
 *
 * 为什么单独一条：文本链的头是 DeepSeek-V3.2（纯文本），把图片丢给它
 * 必然 400 —— 这就是「拍照开题一点就报『当前模型不支持图片识别』」的原因。
 * DeepSeek-V4.1-Flash（含 1017 快照）是原生多模态，文字、图片同一套接口。
 * 三级都 Recognise 不了，最后才用回老师自己配的那个（万一是通义 VL 一类）。
 */
const VISION_MODELS = [
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  'Qwen/Qwen2.5-VL-72B-Instruct',
]

/** 400 里写着「模型不存在 / 不支持图片」——换下一级；其余错误照常上报 */
function retryableVision(detail: string): boolean {
  return /model|image|vision|support|not found|invalid/i.test(detail)
}

export async function recognizePhoto(
  dataUrl: string,
  cfg: LLMConfig
): Promise<PhotoRecognition> {
  // 落点由 endpointOf 裁决：没填 key 就走同源代理，服务端注入 Authorization
  const ep = endpointOf('/chat/completions', cfg)
  const models = [...VISION_MODELS, cfg.model].filter(
    (m, i, all) => Boolean(m) && all.indexOf(m) === i
  )
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 60_000)
  let lastDetail = ''
  let lastStatus = 0

  try {
    for (const model of models) {
      const res = await fetch(ep.url, {
        method: 'POST',
        signal: controller.signal,
        headers: ep.headers,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: VISION_PROMPT },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      })

      if (!res.ok) {
        lastStatus = res.status
        lastDetail = await res.text().catch(() => '')
        if (lastStatus === 400 || lastStatus === 404) {
          if (retryableVision(lastDetail)) continue
        }
        throw new Error(`识别失败（${lastStatus}）。可以先手动填写，不影响生成。`)
      }

      const data = await res.json()
      const content: string = data?.choices?.[0]?.message?.content ?? ''
      if (!content) throw new Error('模型没有返回识别结果，请手动填写。')

      const raw = JSON.parse(extractJson(content)) as Partial<PhotoRecognition>
      if (!raw?.topic) throw new Error('没能从这张图里认出课题，请手动填写。')

      return {
        topic: String(raw.topic).replace(/[《》]/g, '').trim(),
        stage: String(raw.stage ?? '小学').trim(),
        grade: String(raw.grade ?? '').trim(),
        period: String(raw.period ?? '').trim(),
        textbook: String(raw.textbook ?? '').trim(),
        points: Array.isArray(raw.points)
          ? raw.points.filter((p): p is string => typeof p === 'string').slice(0, 5)
          : [],
      }
    }
    throw new Error('当前模型都不支持图片识别。可以先手动填写，不影响生成。')
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('识别超时了。可以先手动填写，不影响后面的生成。')
    }
    throw e instanceof Error ? e : new Error('识别失败，请手动填写。')
  } finally {
    window.clearTimeout(timer)
  }
}
