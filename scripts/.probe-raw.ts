import { readFileSync } from 'node:fs'
const g = globalThis as unknown as { window?: unknown }
g.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const { postChatJson } = await import('../src/lib/llm')
const cfg = { baseUrl: 'https://api.siliconflow.cn/v1', apiKey: env.VITE_SILICONFLOW_API_KEY, model: 'deepseek-ai/DeepSeek-V3.2' }
const t = Date.now()
try {
  const out = await postChatJson([
    { role: 'system', content: '只输出 JSON。' },
    { role: 'user', content: '写一个 12 页小学语文课学生版页面数组，字段 kind/title/line/items/notes，JSON 形如 {"slides":[...]}。' },
  ], cfg as never)
  console.log('OK', `${Date.now()-t}ms`, JSON.stringify(out).slice(0, 200))
} catch (e) {
  console.log('ERR', `${Date.now()-t}ms`, (e as Error)?.message, (e as { constructor?: { name?: string } })?.constructor?.name)
}
