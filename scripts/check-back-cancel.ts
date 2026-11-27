/**
 * 「返回键 + 生成可中断」的离线验收（2026-11-22 用户要求）。
 *
 * 两件事：① 首页以外的每一屏左上角都有一颗固定的「← 返回」；
 *        ② 两段生成（备课包 / 学生版）在跑的时候都能点一下停掉，
 *          而且停了以后不报错、不磨兜底稿、已经上屏的页留着。
 *
 * 这一层全是界面接线，没有可以离线跑一遍的纯函数，所以逐条读源码断言——
 * 与 check:pptpreview 读 styles.css 是同一种做法。
 *
 *   ① 顶栏有 topbar-left + 「← 返回」，且只在 view !== 'home' 时出现；
 *   ② 返回的去向：设置页回原来的那一屏，结果页回首页且清本机存档；
 *   ③ 备课包带 signal：generatePlan(next, cfg, controller.signal)；
 *   ④ 备课包被取消不落框架稿：catch 里判 controller.signal.aborted 先 return，并留一句人话；
 *   ⑤ 首页那颗按钮生成中是「停止」，且真的接到 onCancel；
 *   ⑥ 学生版这条链暴露 cancel()：abort + 换代号 + 清 pending；
 *   ⑦ 停止后留现场：cancel 不动 slides，状态按是否已有页面给 ready / idle；
 *   ⑧ 结果页生成中给的是可点的「停止生成」，中断后按钮变「继续生成学生版 PPT」；
 *   ⑨ PptPreview 在没页面 / 有页面两种生成态下都有「停止」，下载钮不再被当成状态牌。
 *
 * 跑法：npm run check:back-cancel
 */
import { readFileSync } from 'node:fs'

const FAIL: string[] = []
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
const bad = (msg: string, detail = ''): void => {
  console.log(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)
  FAIL.push(msg)
}
const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const app = read('src/App.tsx')
const home = read('src/components/Home.tsx')
const result = read('src/components/Result.tsx')
const preview = read('src/components/PptPreview.tsx')
const student = read('src/lib/student.ts')

/* ① 顶栏固定返回键 */
{
  const has = /className="topbar-left"/.test(app) && /← 返回/.test(app)
  const only = /view !== 'home' &&/.test(app)
  if (!has) bad('1 顶栏没有固定返回键')
  else if (!only) bad('1 返回键没有按屏幕决定显隐（首页不该有）')
  else ok('1 顶栏固定「← 返回」', '首页不显示，其余屏同一位置')
}

/* ② 返回的去向 */
{
  const back = /function goBack\(\)[\s\S]{0,260}?settingsFrom === 'result'[\s\S]{0,120}?handleBackHome\(\)/.test(app)
  const clears = /function handleBackHome\(\)[\s\S]{0,220}?clearSession\(\)/.test(app)
  if (!back) bad('2 返回没有按来向回去（设置页应回原屏）')
  else if (!clears) bad('2 结果页返回没清本机存档')
  else ok('2 返回去向', '设置回原屏；结果页回首页并清档')
}

/* ③ 备课包带 signal */
{
  const wired = /const controller = new AbortController\(\)[\s\S]{0,200}?generatePlan\(next, cfg, controller\.signal\)/.test(app)
  if (!wired) bad('3 备课包请求没接 AbortSignal')
  else ok('3 备课包可中断', 'generatePlan 吃 controller.signal')
}

/* ④ 取消不磨兜底稿 */
{
  const iTry = app.indexOf('const result = await generatePlan(next, cfg, controller.signal)')
  const iCatch = app.indexOf('} catch (e) {', iTry)
  const iAbort = app.indexOf('controller.signal.aborted', iCatch)
  const iFallback = app.indexOf('findExample(next.topic)', iCatch)
  if (iTry < 0 || iCatch < 0) bad('4 找不到备课包的 catch')
  else if (iAbort < 0 || iAbort > iFallback) bad('4 取消被当成了失败（会磨出框架稿）')
  else if (!/已停止生成/.test(app)) bad('4 取消后没有一句人话')
  else ok('4 取消不是失败', '先判 aborted 就回一句话，不落框架稿')
}

/* ⑤ 首页「停止」 */
{
  const btn = /loading \? '停止' : '生成'/.test(home) && /onClick=\{loading \? onCancel : submit\}/.test(home)
  const prop = /onCancel: \(\) => void/.test(home) && /onCancel=\{cancelPlan\}/.test(app)
  if (!btn) bad('5 首页按钮生成中不是「停止」')
  else if (!prop) bad('5 首页「停止」没接到 App 的 cancelPlan')
  else ok('5 首页可中断', '同一颗按钮：生成 → 停止')
}

/* ⑥ 学生版暴露 cancel */
{
  const iface = /cancel: \(\) => void/.test(student)
  const impl = /const cancel = useCallback\(\(\) => \{\s*abortRef\.current\?\.abort\(\)[\s\S]{0,160}?genRef\.current \+= 1[\s\S]{0,80}?pendingRef\.current = null/.test(student)
  const wire = /onCancelStudent=\{student\.cancel\}/.test(app)
  if (!iface) bad('6 StudentDeck 没暴露 cancel')
  else if (!impl) bad('6 cancel 没有 abort + 换代号 + 清 pending')
  else if (!wire) bad('6 Result 没把 cancel 接上')
  else ok('6 学生版可中断', 'abort + gen++ + pending 清空，接线到结果页')
}

/* ⑦ 停止后留现场 */
{
  const seg = student.slice(student.indexOf('const cancel = useCallback'), student.indexOf('return {', student.indexOf('const cancel = useCallback')))
  const keeps = !/slides: \[\]/.test(seg)
  const idleOrReady = /status: d\.slides\.length > 0 \? 'ready' : 'idle'/.test(seg) && /interrupted: d\.slides\.length > 0/.test(seg)
  const noError = !/error: (humanError|'[^']+' as string)/.test(seg)
  if (!keeps) bad('7 停止把已上屏的页也清了（用户口径：留现场）')
  else if (!idleOrReady) bad('7 停止后的状态没按有无页面分流')
  else if (!noError) bad('7 停止被写成了失败（挂 error 会弹提示）')
  else ok('7 停止后留现场', '页留着，状态 ready / idle，不报错')
}

/* ⑧ 结果页两颗状态按钮 */
{
  const stop = /停止生成/.test(result) && /onClick=\{onCancelStudent\}/.test(result)
  const resume = /student\.interrupted && student\.slides\.length > 0[\s\S]{0,160}?继续生成学生版 PPT/.test(result)
  if (!stop) bad('8 结果页生成中没有「停止生成」')
  else if (!resume) bad('8 中断后没有「继续生成」的入口')
  else ok('8 结果页可中断', '生成中给停止，中断后给继续生成')
}

/* ⑨ 预览层也有停止 */
{
  const empty = /making && onCancel && \([\s\S]{0,200}?停止/.test(preview)
  const foot = /making && onCancel \? \([\s\S]{0,240}?停止[\s\S]{0,120}?\) : \(/.test(preview)
  if (!empty) bad('9 预览层没页面时没有「停止」')
  else if (!foot) bad('9 预览层有页面时只有灰掉的下载钮，没有「停止」')
  else ok('9 预览层可中断', '两种生成态都给停止')
}

/* ------------------------------ 汇总 ------------------------------ */

console.log('')
if (FAIL.length) {
  console.error(`check:back-cancel 未通过：${FAIL.length} 条`)
  for (const f of FAIL) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ check:back-cancel 九条全过：固定返回 / 来向正确 / 两段都能中断 / 停了不磨兜底稿 / 留现场')