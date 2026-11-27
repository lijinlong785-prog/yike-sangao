import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 同源代理（TASKS/13 / 26）：前端只调 /api/ds/*（文本、写 SVG）与 /api/sf/*（位图生图），
 * key 在这里由 dev server 注入，所以 `npm run dev` 和 `node server.mjs` 是同一种走法。
 * 注意 loadEnv 第三个参数必须是空串，否则读不到不带 VITE_ 前缀的 key。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const dsKey = String(env.DEEPSEEK_API_KEY || '').trim()
  const sfKey = String(env.SILICONFLOW_API_KEY || env.VITE_SILICONFLOW_API_KEY || '').trim()
  /**
   * 两条代理 dev 与 preview 共用：
   * 以前只写了 server.proxy，`npm run preview` 打开就一个 `/api` 都没有——
   * 页面能开、生成「成功」，其实是全部静默退回了内置稿 / 骨架稿（2026-11-22 修）。
   */
  const proxy = {
    // 文本 / 写 SVG：DeepSeek 官方（模型名由服务端换成 deepseek-flash）
    '/api/ds': {
      target: 'https://api.deepseek.com',
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api\/ds/, '/v1'),
      headers: dsKey ? { Authorization: `Bearer ${dsKey}` } : {},
    },
    // 位图生图：硅基流动
    '/api/sf': {
      target: 'https://api.siliconflow.cn',
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api\/sf/, '/v1'),
      headers: sfKey ? { Authorization: `Bearer ${sfKey}` } : {},
    },
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy,
    },
    preview: {
      port: 4173,
      host: true,
      proxy,
    },
  }
})
