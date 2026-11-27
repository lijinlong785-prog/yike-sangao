/**
 * 模板墙的离线验收（TASKS/21 §二.7）：把模板摆出来挑，而不是只给一排色签。
 *
 * 六条硬断言（套数 / 族数一律从 TEMPLATES / FAMILY_IDS 现数，加族时不必回来改这里）：
 *   1. 套数与 id 表对得上、每族至少 1 套、名字不重、每族都有「适合 / 一句说明」
 *   2. 每一套缩略图都画得出来：place() 非空、零越界、纸与墨不为空
 *   3. 同族只换纸：族内几何逐字节相同，配色（纸 / 墨 / 强调色）两两不同
 *   4. 零网络：墙只读 place()，不 import 模型 / 生图 / 生成链路，不 fetch、不用 <img>
 *   5. 接线：Result 挂 <TemplateWall>、传当前模板 + 推荐 + 点即换；套数出自同一张表
 *   6. 纸墨规矩：缩略图不写渐变、不用 backdrop-filter、圆角 2px（与全站一条线）
 *
 * 跑法：npm run check:wall
 */
import { readFileSync } from 'node:fs'
import { place, type Placed } from '../src/lib/deck2/place'
import {
  FAMILIES,
  FAMILY_IDS,
  FAMILY_REPS,
  TEMPLATE_IDS,
  TEMPLATES,
  defaultTemplateId,
  familyTemplates,
  labelOf,
  type DeckTheme,
} from '../src/lib/deck2/theme'
import { sampleSlide } from '../src/components/TemplateWall'

const FAIL: string[] = []
const fail = (msg: string) => FAIL.push(msg)
const ok = (msg: string, detail = '') => console.log(`✓ ${msg}${detail ? ` — ${detail}` : ''}`)

const ALL = Object.values(TEMPLATES)
const slide = sampleSlide('桂花雨')

/* ------------------------------ 1 · 清单 ------------------------------ */

console.log(`\n=== 1. ${ALL.length} 套 / ${FAMILY_IDS.length} 族：清单齐、名字不重、每族有说明 ===`)
if (ALL.length !== TEMPLATE_IDS.length) fail(`模板总数是 ${ALL.length}，id 表里是 ${TEMPLATE_IDS.length}`)
else ok('1 全部摆出来', `${ALL.length} 套`)
if (FAMILY_IDS.length === 0) fail('族数是 0')
else ok('1 排法清单', `${FAMILY_IDS.length} 族：${FAMILY_IDS.join(' / ')}`)

const perFamily = FAMILY_IDS.map((f) => ({ f, list: familyTemplates(f) }))
/* 每族至少一套：照抄开源母版的那几族一套就是一套母版的配色，不为了凑「≥3 套」硬拆 */
const thin = perFamily.filter((x) => x.list.length < 1)
if (thin.length) fail(`这些族一套都没有：${thin.map((x) => x.f).join(' / ')}`)
else ok('1 每族至少 1 套', perFamily.map((x) => `${x.f}:${x.list.length}`).join(' '))
const counted = perFamily.reduce((n, x) => n + x.list.length, 0)
if (counted !== ALL.length) fail(`按族加起来 ${counted} 套，与总表 ${ALL.length} 套对不上（有套子没归族）`)
else ok('1 族 × 配色 = 总数', `${counted} 套逐一对上`)
if (perFamily.some((x) => !FAMILY_REPS[x.f] || !TEMPLATES[FAMILY_REPS[x.f]])) {
  fail('1 有族取不到代表模板（FAMILY_REPS 漏了）')
} else ok('1 每族都有代表', FAMILY_IDS.map((f) => FAMILY_REPS[f]).join(' / '))

const labels = ALL.map((t) => labelOf(t))
if (new Set(labels).size !== labels.length) {
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i)
  fail(`1 墙上有重名模板：${[...new Set(dup)].join(' / ')}`)
} else ok('1 全部名字不重', `${labels.length} 个`)
const noNote = FAMILY_IDS.filter((f) => {
  const fam = FAMILIES[f]
  return !fam || !fam.name || !fam.note || !fam.fits || fam.fits.length === 0
})
if (noNote.length) fail(`1 这些族缺名字 / 说明 / 适合：${noNote.join(' / ')}`)
else ok('1 每族都有名字 + 一句说明 + 适合', '墙上不留空壳分组')

/* ---------------------------- 2 · 缩略图 ---------------------------- */

console.log(`\n=== 2. ${ALL.length} 套缩略图都画得出来：非空、零越界 ===`)
const EPS = 1e-6
let cells = 0
const empty: string[] = []
const out: string[] = []
for (const t of ALL) {
  const placed = place(slide, t)
  cells += placed.length
  if (placed.length === 0) empty.push(t.id)
  for (const p of placed) {
    if (p.x < -EPS || p.y < -EPS || p.x + p.w > 1 + EPS || p.y + p.h > 1 + EPS) out.push(t.id)
  }
}
if (empty.length) fail(`2 ${empty.length} 套缩略图排出来是空的：${empty.slice(0, 6).join(' / ')}`)
else ok('2 每一套都排得出块子', `共 ${cells} 块`)
if (out.length) fail(`2 ${[...new Set(out)].length} 套越出纸面`)
else ok('2 每套零越界', '坐标全部落在 0–1')

const badInk = ALL.filter((t) => !t.paper || !t.ink || !t.accent)
if (badInk.length) fail(`2 ${badInk.length} 套纸 / 墨 / 强调色不全`)
else ok('2 纸墨齐', `${ALL.length} 套 paper / ink / accent 都有值`)

/* --------------------------- 3 · 同族只换纸 --------------------------- */

console.log('\n=== 3. 同族只换纸：族内几何逐字节相同，配色两两不同 ===')
/** 几何 = 只说「摆在哪、多大、什么字号」；颜色 / 纸 / 字色不算几何 */
const geo = (placed: Placed[]): string =>
  placed
    .map((p) =>
      [
        p.kind,
        p.x,
        p.y,
        p.w,
        p.h,
        p.size ?? '',
        p.align ?? '',
        p.valign ?? '',
        p.bold ? 1 : 0,
        p.lineHeight ?? '',
      ].join(':')
    )
    .join('|')

for (const { f, list } of perFamily) {
  const first = geo(place(slide, list[0]))
  const diff = list.filter((t) => geo(place(slide, t)) !== first)
  if (diff.length) fail(`3 ${f}：族内几何不一致（${diff.map((t) => t.id).join(' / ')}），墙上会看到假差异`)
}
ok('3 每一族族内几何逐字节相同', '同族只换纸，用户看见的差别就是真的')

const suit = perFamily.map(({ f, list }) => {
  const inks = new Set(list.map((t) => `${t.paper}|${t.ink}|${t.accent}`))
  return { f, n: list.length, real: inks.size }
})
const fake = suit.filter((s) => s.real !== s.n)
if (fake.length) fail(`3 这些族里有「同纸同墨」的两套：${fake.map((s) => s.f).join(' / ')}`)
else ok('3 族内配色两两不同', suit.map((s) => `${s.f}:${s.real}`).join(' '))

/* ----------------------------- 4 · 零网络 ----------------------------- */

console.log('\n=== 4. 零网络：墙只读 place()，不碰模型 / 生图 ===')
const wallSrc = readFileSync('src/components/TemplateWall.tsx', 'utf8')
if (/\bfetch\s*\(/.test(wallSrc)) fail('4 模板墙里有 fetch：换模板不该发请求')
if (/<img\b/.test(wallSrc)) fail('4 模板墙用了 <img>：缩略图必须是 place() 现画的')
const banned = ['../lib/llm', '../lib/student', '../lib/illustrate', '../lib/director', '../lib/scheme']
const hits = banned.filter((m) => new RegExp(`from '${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(wallSrc))
if (hits.length) fail(`4 模板墙引了生成链路：${hits.join(' / ')}`)
if (!/from '\.\.\/lib\/deck2\/place'/.test(wallSrc)) fail('4 模板墙没用 place() 画缩略图（另起了一套示意版式）')
else ok('4 缩略图与成品同一份 place()', '换模板 0 网络、0 模型')

/* ------------------------------ 5 · 接线 ------------------------------ */

console.log('\n=== 5. 接线：Result 挂墙、传当前 + 推荐、点即换 ===')
const resultSrc = readFileSync('src/components/Result.tsx', 'utf8')
const wallAt = resultSrc.indexOf('<TemplateWall')
if (wallAt < 0) fail('5 Result 里找不到 <TemplateWall>：墙没挂上')
else {
  const tag = resultSrc.slice(wallAt, wallAt + 700)
  if (!/\bcurrent=\{template\}/.test(tag)) fail('5 墙没拿到当前模板（「当前」徽标就没了）')
  if (!/\brecommendedId=\{recommendedId\}/.test(tag)) fail('5 墙没拿到按学科推荐的那一套（「推荐」徽标就没了）')
  if (!/\bonPick=\{/.test(tag)) fail('5 墙没接「点一套就换」')
  if (!/\bonClose=\{/.test(tag)) fail('5 墙没接关闭')
  else ok('5 墙挂在结果页上', 'current / recommendedId / onPick / onClose 四件齐')
}
if (!/onPick=\{\(id\)\s*=>\s*setTemplateId\(id\)\}/.test(resultSrc)) fail('5 点一套没有真的换模板（onPick 没写回 templateId）')
else ok('5 点即换', 'setTemplateId(id)，不调模型、不重生成')
if (!/useState\(false\)[\s\S]{0,80}?wallOpen/.test(resultSrc) && !/const \[wallOpen, setWallOpen\] = useState\(false\)/.test(resultSrc)) {
  fail('5 墙的开合状态不是默认关着的')
}
if (!/换模板（\{\s*TEMPLATE_ORDER\.length\s*\}\s*套）/.test(resultSrc)) {
  fail('5 入口按钮上的套数没从 TEMPLATE_ORDER 取（写死了就会和墙上对不上）')
} else ok('5 入口套数出自同一张表', '换模板（{TEMPLATE_ORDER.length} 套）')

/* 推荐必须落在总表之内，且随学科 / 文体变化 */
const recA = defaultTemplateId('语文', '桂花雨', '第一课时')
const recB = defaultTemplateId('数学', '长方体的认识', '第一课时')
const recC = defaultTemplateId('语文', '古诗二首', '第一课时')
for (const [label, id] of [['语文', recA], ['数学', recB], ['古诗文', recC]] as const) {
  if (!TEMPLATES[id]) fail(`5 ${label} 推荐了不存在的模板 ${id}`)
}
if (FAMILIES[TEMPLATES[recA].family].name === FAMILIES[TEMPLATES[recB].family].name) {
  fail('5 语文与数学推荐到了同一族（按学科推荐等于没做）')
} else if (recC === recA) {
  fail('5 古诗文与普通课文推荐到了同一套（文体判断没生效）')
} else {
  ok('5 推荐落在总表内且按学科分', `语文→${recA} / 数学→${recB} / 古诗文→${recC}`)
}

/* ---------------------------- 6 · 纸墨规矩 ---------------------------- */

console.log('\n=== 6. 纸墨规矩：缩略图不渐变、不毛玻璃、圆角 2px ===')
const css = readFileSync('src/styles.css', 'utf8')
const need = ['.tw-backdrop', '.tw-panel', '.tw-grid', '.tw-canvas', '.tw-card', '.tw-peek']
const miss = need.filter((c) => !css.includes(c))
if (miss.length) fail(`6 样式表里缺：${miss.join(' / ')}`)
else ok('6 墙的样式齐', need.join(' / '))

/** 取一条规则的全部声明；选择器与 { 之间允许空格（本项目写法是 `.x {`） */
const pick = (selector: string): string => {
  const at = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`).exec(css)
  if (!at) return ''
  const end = css.indexOf('}', at.index)
  return end < 0 ? '' : css.slice(at.index, end)
}
const picked = ['.tpl-current', '.tw-backdrop', '.tw-panel', '.tw-card', '.tw-canvas'].map((s) => ({ s, block: pick(s) }))
const blank = picked.filter((p) => !p.block).map((p) => p.s)
if (blank.length) fail(`6 这几条规则取不到内容（门禁自己没生效）：${blank.join(' / ')}`)
const blocks = picked.map((p) => p.block).join('\n')
if (/gradient/i.test(blocks)) fail('6 墙上有渐变（DESIGN.md 明令禁止）')
if (/backdrop-filter/i.test(blocks)) fail('6 墙上用了 backdrop-filter')
/* 全站圆角走 var(--radius)，先把它解成实际值再判，避免「变量名合规、值不合规」漏过 */
const radiusVar = /--radius:\s*([^;]+);/.exec(css)?.[1].trim() ?? ''
const radius = [...blocks.matchAll(/border-radius:\s*([^;]+);/g)].map((m) =>
  m[1].trim().replace(/var\(--radius\)/g, radiusVar)
)
if (!/^(2px|0)$/.test(radiusVar)) fail(`--radius 是 ${radiusVar || '(取不到)'}，全站应为 2px`)
const odd = radius.filter((r) => !/^(2px|0|50%)$/.test(r))
if (odd.length) fail(`6 墙上的圆角不是 2px：${[...new Set(odd)].join(' / ')}`)
else ok('6 圆角 2px / 无渐变 / 无毛玻璃', '与全站同一条线')

/* 缩略图字号换算：1pt = 4/3 px（纸宽 1280 → 960pt），乘以 100 是 cqw */
const cqw = /const CQW_PER_PT = \(4 \/ 3 \/ 1280\) \* 100/.test(wallSrc)
if (!cqw) fail('6 缩略图字号换算与纸宽对不上（与成品会两个样）')
else ok('6 缩略图字号按纸宽换算', '1pt = 4/3px → cqw')

/* 版式不许被压扁（真机 684px 宽时发现：大图预览被 flex 压成 2px） */
const canvasBlock = pick('.tw-canvas')
const bodyBlock = pick('.tw-body')
if (!/flex:\s*none/.test(canvasBlock)) fail('6 .tw-canvas 没有 flex:none——列向 flex 里 aspect-ratio 会被压成一条线')
else if (!/flex:\s*1/.test(bodyBlock)) fail('6 .tw-body 没有吃满剩余高度（列表只剩一条缝）')
else ok('6 抽屉高度链完整', '.tw-canvas flex:none · .tw-body flex:1 · .tw-list 自己滚')

/* 窄屏（684×407 实测过一次）：两行 grid 会让预览占满整块、列表被顶到面板外，
   所以窄屏必须退成一列内滚，且预览排到列表前面、列表跟着整体滚。 */
/* 同一个断点在样式表里有好几处（别的组件也用），把所有块拼起来再找墙那几条 */
const media = (query: string): string => {
  const out: string[] = []
  for (let at = css.indexOf(query); at >= 0; at = css.indexOf(query, at + query.length)) {
    const open = css.indexOf('{', at)
    let depth = 0
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') {
        depth -= 1
        if (depth === 0) {
          out.push(css.slice(open + 1, i))
          break
        }
      }
    }
  }
  return out.join('\n')
}
const narrow = media('@media (max-width: 820px)')
if (!narrow) fail('6 窄屏断点不见了（手机 / IDE 小窗会退回桌面两栏）')
else if (!/\.tw-body\s*\{[^}]*overflow-y:\s*auto/.test(narrow)) {
  fail('6 窄屏抽屉没改成整体滚动：预览一高，列表就被挤到面板外')
} else if (!/\.tw-list\s*\{[^}]*overflow:\s*visible/.test(narrow)) {
  fail('6 窄屏列表还在自己滚（会被上面的预览挤成一条缝）')
} else if (!/\.tw-peek\s*\{[^}]*order:\s*-1/.test(narrow)) {
  fail('6 窄屏预览没排到列表前面（大图会掉到整墙缩略图下面，谁也找不到）')
} else ok('6 窄屏一列滚动', '预览在上 · 列表在下 · 谁都不会被裁')

/* -------------------------------- 收尾 -------------------------------- */

console.log('')
if (FAIL.length) {
  for (const f of FAIL) console.log(`✗ ${f}`)
  console.log(`\n模板墙门禁：${FAIL.length} 条未通过`)
  process.exit(1)
}
console.log('模板墙门禁：六组全过（清单 / 缩略图 / 同族只换纸 / 零网络 / 接线 / 纸墨规矩）')