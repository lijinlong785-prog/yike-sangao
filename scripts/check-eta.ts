/**
 * 「大概还要多久」（lib/eta.ts）的离线验收。
 *
 * 不碰网络：直接喂时刻（毫秒时间戳）与阶段，看剩余秒数、进度条、话术对不对。
 *
 *   ① 备课包刚点下去：85 秒整，进度条 0；
 *   ② 备课包等 30 秒：55 秒，话说成「约还需 55 秒」；
 *   ③ 备课包超时（等了 5 分钟）：停在 10 秒，不归零、进度条不满；
 *   ④ 学生版重写起步：65 + 定画 45 + 排版 18 = 128 秒；
 *   ⑤ 进到定画且已等 10 秒：剩（45-10）+ 18 = 53 秒；进度条按整链算（75/128），只往前不倒；
 *   ⑥ 配插画 6 张、插到第 3 张：剩一半图的时间 + 排版 18 秒（按 ILLUS_SECONDS 现算）；
 *   ⑦ 整条链跑满（排版也超时）：10 秒兜底、进度条封顶 92%；
 *   ⑧ 话术：10 秒 / 整分钟 / 分加秒三种写法；同一段翻页不重置起点（由调用方保证，这里查设计常量）。
 *   ⑨ 两张图之间倒计时照走（页事件之间不冻住），翻页进度条不倒。
 *   ⑩ 文字段超预算照走；换阶段拿高水位托住，剩余 / 进度不回跳。
 *   ⑪ 图报满后收尾阶段照走，不冻在排版预算上。
 *
 * 跑法：npm run check:eta
 */
import { ETA_FLOOR, ILLUS_SECONDS, etaOf, etaText } from '../src/lib/eta'

const FAIL: string[] = []
const ok = (msg: string, detail = ''): void => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)
const bad = (msg: string, detail = ''): void => {
  console.log(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)
  FAIL.push(msg)
}
const T0 = 1_700_000_000_000
const at = (seconds: number) => T0 + seconds * 1000

/* ① 备课包刚点下去 */
{
  const e = etaOf({ stage: 'plan', at: T0 }, T0)
  if (e.left !== 85 || e.pct !== 0) bad('1 备课包起步', `left=${e.left} pct=${e.pct}`)
  else ok('1 备课包起步', '整 85 秒，进度条 0')
}

/* ② 备课包等 30 秒 */
{
  const e = etaOf({ stage: 'plan', at: T0 }, at(30))
  if (e.left !== 55 || etaText(e.left) !== '约还需 55 秒') bad('2 备课包走了 30 秒', `left=${e.left}`)
  else ok('2 备课包走了 30 秒', '剩 55 秒，话说得出口')
}

/* ③ 备课包超时：封顶不归零 */
{
  const e = etaOf({ stage: 'plan', at: T0 }, at(300))
  if (e.left !== ETA_FLOOR) bad('3 备课包超时', `left=${e.left} 应停在 ${ETA_FLOOR}`)
  else if (e.pct > 0.92) bad('3 备课包超时进度条', `pct=${e.pct} 超过 92%`)
  else ok('3 备课包超时', '停在 10 秒，进度条不满')
}

/* ④ 学生版重写起步：65 + 45 + 18 = 128 */
{
  const e = etaOf({ stage: 'llm', at: T0 }, T0)
  if (e.left !== 128) bad('4 学生版起步', `left=${e.left} 应为 128`)
  else ok('4 学生版起步', '三段的预算都算进去了，共 128 秒')
}

/* ⑤ 进到定画、已等 10 秒：剩（45-10）+ 18 = 53；进度条按整链走 */
{
  const e = etaOf({ stage: 'direct', at: at(65) }, at(75))
  const tail = etaOf({ stage: 'llm', at: T0 }, at(65)).pct
  if (e.left !== 53) bad('5 定画走了一半', `left=${e.left} 应为 53`)
  else if (e.pct < tail) bad('5 换阶段进度条倒着走', `${tail.toFixed(3)} → ${e.pct.toFixed(3)}`)
  else if (Math.abs(e.pct - 75 / 128) > 1e-6) bad('5 整链进度', `pct=${e.pct} 应为 ${(75 / 128).toFixed(3)}`)
  else ok('5 定画走了一半', '前面那一段按整段扣掉；进度条换阶段只往前')
}

/* ⑥ 配插画 6 张、插到第 3 张：剩一半图 + 排版 18（预算按 ILLUS_SECONDS 现算） */
{
  const e = etaOf({ stage: 'illust', at: at(110), page: 3, total: 6 }, at(146))
  const want = ILLUS_SECONDS * 3 + 18
  if (e.left !== want) bad('6 插图按张算', `left=${e.left} 应为 ${want}`)
  else ok('6 插图按张算', '剩一半图就报一半时间，不拿页数骗人')
}

/* ⑦ 整条链跑满：10 秒兜底、进度条封顶 */
{
  const e = etaOf({ stage: 'typeset', at: at(128) }, at(400))
  if (e.left !== ETA_FLOOR) bad('7 整链超时', `left=${e.left}`)
  else if (e.pct > 0.92) bad('7 整链超时进度条', `pct=${e.pct}`)
  else ok('7 整链超时', '10 秒兜底、92% 封顶——不装走到头')
}

/* ⑧ 话术三种写法 */
{
  const cases: [number, string][] = [
    [ETA_FLOOR, '约还需 10 秒'],
    [60, '约还需 1 分钟'],
    [125, '约还需 2 分 5 秒'],
  ]
  const wrong = cases.filter(([n, want]) => etaText(n) !== want)
  if (wrong.length) bad('8 话术', wrong.map(([n, want]) => `${n}→${etaText(n)}（应 ${want}）`).join('；'))
  else ok('8 话术', '10 秒 / 整分钟 / 分加秒三种都写对')
}

/* ⑨ 两张图之间倒计时不许冻住（2026-11-23 真机：用户盯着「1 分 3 秒」不动以为卡死） */
{
  const a = etaOf({ stage: 'illust', at: at(110), page: 2, total: 6, sincePage: 20 }, at(230))
  const b = etaOf({ stage: 'illust', at: at(110), page: 2, total: 6, sincePage: 40 }, at(250))
  const c = etaOf({ stage: 'illust', at: at(110), page: 3, total: 6, sincePage: 0 }, at(251))
  if (b.left >= a.left) bad('9 页事件之间倒计时冻住', `${a.left} → ${b.left} 没往下走`)
  else if (c.pct < b.pct) bad('9 翻页进度条倒着走', `${b.pct.toFixed(3)} → ${c.pct.toFixed(3)}`)
  else ok('9 等图时倒计时照走', `同是第 2 张：${a.left}s → ${b.left}s；翻页进度只往前`)
}

/* ⑩ 文字段超预算也不冻（2026-11-23 真机「1 分 3 秒」）：配插画开着，
   llm 段等超 65 秒后倒计时照走；换阶段拿高水位托住，不许往回跳 */
{
  const a = etaOf({ stage: 'llm', at: T0, illust: true }, at(70))
  const b = etaOf({ stage: 'llm', at: T0, illust: true }, at(90))
  const c = etaOf({ stage: 'direct', at: at(90), illust: true, usedFloor: b.used }, at(91))
  if (b.left >= a.left) bad('10 文字段超预算冻住', `${a.left} → ${b.left}`)
  else if (c.left > b.left) bad('10 换阶段剩余往回跳', `${b.left} → ${c.left}`)
  else if (c.pct < b.pct) bad('10 换阶段进度倒着走', `${b.pct.toFixed(3)} → ${c.pct.toFixed(3)}`)
  else ok('10 超预算照走、换阶段不回跳', `llm 70s→90s：${a.left}s→${b.left}s；接 direct 停在 ${c.left}s`)
}

/* ⑪ 6 张图报满但还在收尾（2026-11-23 真机「18 秒」）：倒计时不许停在排版预算上 */
{
  const a = etaOf({ stage: 'illust', at: at(110), page: 6, total: 6, illust: true, sincePage: 0 }, at(400))
  const b = etaOf({ stage: 'illust', at: at(110), page: 6, total: 6, illust: true, sincePage: 5 }, at(415))
  if (b.left >= a.left) bad('11 图报满后冻住', `${a.left} → ${b.left}`)
  else ok('11 图报满后照走', `${a.left}s → ${b.left}s，一路减到 10 秒底线`)
}

/* ⑫ 真机「1 分 53 秒」场景复现：第 4 张报完、等第 5 张的 50 秒里，每秒都必须往下走 */
{
  const seq = [0, 10, 20, 30, 40, 49].map((sp) =>
    etaOf({ stage: 'illust', at: at(110), page: 4, total: 6, illust: true, sincePage: sp }, at(200 + sp)).left
  )
  const flat = seq.some((v, i) => i > 0 && v >= seq[i - 1])
  if (flat) bad('12 等下一张时出现平台', seq.join(' → '))
  else ok('12 等图全程无平台', seq.join(' → '))
}

/* ------------------------------ 汇总 ------------------------------ */

console.log('')
if (FAIL.length) {
  console.error(`check:eta 未通过：${FAIL.length} 条`)
  for (const f of FAIL) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ check:eta 十二条全过：起步 / 递减 / 超时兜底 / 按张算 / 封顶不归零 / 话术 / 等图不冻 / 超预算不冻 / 收尾不冻')