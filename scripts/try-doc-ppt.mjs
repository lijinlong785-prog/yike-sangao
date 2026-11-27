/**
 * 对照实验：用百炼 qwen-doc-turbo 的 ppt skill 直接出一份 .pptx。
 *
 * 跑法：DASHSCOPE_API_KEY=sk-xxx node scripts/try-doc-ppt.mjs "桂花雨"
 * 产物：/tmp/yike-doc-ppt/*.pptx（下载链接 24 小时有效，所以立刻落盘）
 *
 * 这个脚本只用来跟自家链路做观感对照，不进 npm scripts，不参与门禁。
 */

import { mkdir, writeFile } from 'node:fs/promises'

const KEY = process.env.DASHSCOPE_API_KEY
if (!KEY) {
  console.error('缺 DASHSCOPE_API_KEY（百炼控制台 API-KEY 页创建，sk- 开头）')
  process.exit(1)
}

const topic = process.argv[2] || '桂花雨'
const OUT = '/tmp/yike-doc-ppt'
/** 业务空间专属域名（控制台 API Key 页给的那个），老 dashscope.aliyuncs.com 仍可用但已进入维护 */
const BASE = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1'
const URL_GEN = `${BASE.replace(/\/$/, '')}/services/aigc/text-generation/generation`

const body = {
  model: 'qwen-doc-turbo',
  input: {
    messages: [
      { role: 'system', content: '你是一位小学语文老师，为《桂花雨》这一课做课堂演示文稿。' },
      { role: 'user', content: `请围绕《${topic}》生成一份课堂 PPT，面向五年级学生，10 到 14 页。` },
    ],
  },
  parameters: {
    /* general 模式要 file content（文件/文档地址），纯文本只能用 creative：
       第一次用 general 直接被 400 打回——"The parameter skill only supports file content." */
    skill: [{ type: 'ppt', mode: process.env.PPT_MODE || 'creative' }],
  },
}

const t0 = Date.now()
const res = await fetch(URL_GEN, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${KEY}`,
    'X-DashScope-SSE': 'enable',
  },
  body: JSON.stringify(body),
})

if (!res.ok) {
  console.error(`HTTP ${res.status}`)
  console.error((await res.text()).slice(0, 800))
  process.exit(1)
}

/** 流式三段：大纲 → 逐页 HTML → 最终文件链接，都在 reasoning_content / content 里 */
let tail = ''
let pages = 0
let outlineDone = false
const decoder = new TextDecoder()

for await (const chunk of res.body) {
  tail += decoder.decode(chunk, { stream: true })
  const lines = tail.split('\n')
  tail = lines.pop() ?? ''
  for (const line of lines) {
    if (line.startsWith('event:error')) {
      await mkdir(OUT, { recursive: true })
      console.error(`\n上游报错：${line.replace('event:', '').trim()}`)
      continue
    }
    if (line.startsWith('data:') && /"code"\s*:/.test(line)) {
      console.error(`\n上游报错：${line.slice(0, 300)}`)
      continue
    }
    if (!line.startsWith('data:')) continue
    const raw = line.slice(5).trim()
    if (!raw || raw === '[DONE]') continue
    let evt
    try {
      evt = JSON.parse(raw)
    } catch {
      continue
    }
    const c = evt?.output?.choices?.[0]
    if (!c) continue
    const think = c.message?.reasoning_content
    if (think) {
      if (!outlineDone && /<html|<!DOCTYPE/i.test(think)) {
        outlineDone = true
        console.log(`  大纲好了（${((Date.now() - t0) / 1000).toFixed(0)}s），开始逐页出 HTML`)
      }
      if (/<html|<!DOCTYPE/i.test(think)) pages += 1
    }
    if (c.message?.content) {
      const link = c.message.content
      console.log(`  文件字段：${link.slice(0, 200)}`)
      await mkdir(OUT, { recursive: true })
      const url = (link.match(/https?:\/\/[^\s"')]+/) || [])[0]
      if (url) {
        const bin = await fetch(url)
        if (!bin.ok) {
          console.error(`  下载失败 HTTP ${bin.status}`)
          process.exit(1)
        }
        const buf = Buffer.from(await bin.arrayBuffer())
        const file = `${OUT}/qwen-doc-${Date.now()}.pptx`
        await writeFile(file, buf)
        console.log(`\n落盘：${file}（${(buf.length / 1024).toFixed(0)} KB，${((Date.now() - t0) / 1000).toFixed(0)}s）`)
      }
    }
  }
}

console.log(`\n合计 ${((Date.now() - t0) / 1000).toFixed(0)} 秒，识别到 ${pages} 段页面 HTML`)
