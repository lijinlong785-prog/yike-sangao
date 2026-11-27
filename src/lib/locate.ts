/**
 * 课题 → 教材定位 + 关键原句（联网，2026-11-22 用户拍板）。
 *
 * 老师的输入只有一句「我要讲六年级的《狼牙山五壮士》」。没贴原文时，
 * 这一课是哪本教材、第几册第几单元、原文那几句——以前全靠 DeepSeek 凭记忆，
 * 冷门课文就写成套话（真机《狼牙山》第一次跑，库里没原文，模型交上来的
 * 「原文页」全是不存在的句子）。这一层用百炼 qwen + 联网检索去查。
 *
 * 三条边界（都是踩过的坑，不许放宽）：
 *   1. **只查定位与原句，不抓全文**。整篇课文有版权，而且网上的版本常被改过
 *      一两个字——引文块和原文页的信任基础是「逐字」，抓错一个字整条链就废。
 *   2. **查不到就说查不到**（found:false），绝不让模型"顺着编几句"。
 *      编出来的原句比没有原文坏得多：学生会照着背。
 *   3. **一律走同源代理**，不在浏览器里带任何 key。代理层负责开 enable_search，
 *      前端传什么都不作数（不然谁都能把这把 key 用去搜别的）。
 */
import { splitQuotes } from '../data/texts'
import { endpointOf } from './endpoint'

/** 只有这一个落点：百炼兼容模式 + 联网检索（服务端已经把 search 强制打开） */
const LOCATE_MODEL = 'qwen-plus'

export interface LocateHit {
  /** 教材版本，如「统编版」「人教版」 */
  textbook: string
  /** 年级册次，如「六年级上册」 */
  grade: string
  /** 单元，如「第二单元」 */
  unit: string
  /** 课序，如「第 6 课」 */
  lesson: string
  /** 学科，如「语文」「物理」 */
  subject: string
  author: string
  /** 逐字原句（3–8 句），已过 splitQuotes 同一把尺 */
  quotes: string[]
}

const SYSTEM = `你是教材资料员。别人报一个课题，你给出它在中国大陆现行中小学教材里的准确位置，以及课文里逐字存在的几句话。

只返回一个 JSON 对象，不要 markdown 围栏，不要任何解释：
{"found":true,"textbook":"统编版","grade":"六年级上册","unit":"第二单元","lesson":"第6课","subject":"语文","author":"沈重","quotes":["……","……"]}

规矩（违反任何一条，这一趟就作废）：
1. quotes 只放课本上**逐字存在**的句子，3 到 8 句。抄原文，不改写、不缩写、不合并、不加省略号、不把两句拼成一句。
2. 每句 12 到 60 个字。挑这一段里课堂上会让学生读、会指着问的那几句（关键场面、关键对话、点题句）。
3. 拿不准是不是原文的句子，一句都不要放。宁可只给 3 句真的，也不给 6 句半真半假的。
4. 数学、物理、化学、生物、地理这类课没有「课文」：quotes 换成这一课课本上的**原话**——定义、法则、公式的文字表述、例题题干，同样是照着书写，不许自己转述。
5. 这一课你找不到、或者不确定是不是现行教材里的，就返回 {"found":false}。不许猜，不许用同名的别的文章顶上。
6. 学段年级按现行教材写（如「六年级上册」「八年级下册」「高中必修一」）；单册不分上下就写册次。`

/** 从模型回复里挖出那个 JSON（模型偶尔还是会围一圈 ```） */
function pickJson(raw: string): Record<string, unknown> | null {
  const text = String(raw ?? '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const j = JSON.parse(text.slice(start, end + 1))
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * 查这一课。查不到 / 网络挂了 / 回复不是 JSON —— 一律返回 null，
 * 调用方按「没有原文」照常往下走（一页原文页都不出，不许凭记忆补）。
 */
export async function locateTopic(topic: string, signal?: AbortSignal): Promise<LocateHit | null> {
  const t = String(topic ?? '').trim()
  if (!t) return null
  let res: Response
  try {
    /* 落点统一走 endpointOf（门禁第 2 条）：'locate' 这一档永远返回同源代理，
       不给 BYOK 留口子。 */
    const ep = endpointOf('/chat/completions', { apiKey: '' }, 'locate')
    res = await fetch(ep.url, {
      method: 'POST',
      headers: ep.headers,
      body: JSON.stringify({
        model: LOCATE_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `课题：《${t}》` },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      }),
      /* 这条路挡在「点生成」到「开始备课」中间，不能让老师干等：
         没给 signal 就自己上 20 秒的闸，超时按查不到处理（照常出课件）。 */
      signal: signal ?? AbortSignal.timeout(20_000),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  let raw = ''
  try {
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    raw = String(j?.choices?.[0]?.message?.content ?? '')
  } catch {
    return null
  }
  const j = pickJson(raw)
  if (!j || j.found === false) return null

  const quotes = splitQuotes((Array.isArray(j.quotes) ? j.quotes : []).map((q) => String(q ?? '')).join('\n'))
  /* 一句都过不了切句这把尺（太短 / 全是解释句）就当没查到：
     拿零句原文去占位，会让后面「有原文」的分支走空转。 */
  if (quotes.length === 0) return null

  const str = (v: unknown): string => String(v ?? '').trim()
  return {
    textbook: str(j.textbook),
    grade: str(j.grade),
    unit: str(j.unit),
    lesson: str(j.lesson),
    subject: str(j.subject),
    author: str(j.author),
    quotes,
  }
}
