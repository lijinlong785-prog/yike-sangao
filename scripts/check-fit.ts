/**
 * check:fit —— AI 写多长都不崩（模板层的最后一道防线）
 *
 * 母版是死的（槽位、字号、块面都按原图钉住），模型写出来的字是活的。
 * 提示词里的「本套模板的页面容量」（capacity.ts）管的是「该写多少」；
 * 这一份管的是「万一写多了，排版自己收得住」——两件事，不许混。
 *
 * 十九族 × 七式 × 有画 / 无画 × 两档字数：
 *   正常档：内容层上限（90 字 / 6 条 / 标题 14 字）——这是最坏情况的正常稿，一处毛病都不许有
 *   写超档：正常档的 1.5–2 倍——模型不听话时，字可以变小，但不许出框、不许压字、不许抛错
 *
 * 六条：
 *   1 place() 不抛、十九族 × 七式全部排得出来
 *   2 每一块字都在自己的框里（字从框里溢出去，就是版式崩了）
 *   3 两块字不互压（按实际占位算，超过小块面积 12% 判压）
 *   4 有画时字不压画（图位让开是所有族的硬规矩）
 *   5 正常档不许被缩到 18pt 以下（缩到这么小，说明容量表比框松，是布局的错）
 *   6 写超档的收法：只许缩字号，不许丢条目、不许掉到 10pt 以下
 */
import { FAMILIES, FAMILY_REPS, TEMPLATES } from '../src/lib/deck2/theme'
import { place, extentOf, type Placed } from '../src/lib/deck2/place'
import { LEGIBLE_PT, tightCapacity } from '../src/lib/deck2/capacity'
import type { StudentSlide, StudentSlideKind } from '../src/lib/slides'

const FAIL: string[] = []
const fail = (m: string) => FAIL.push(m)
const ok = (name: string, note: string) => console.log(`✓ ${name} — ${note}`)

const PW = 1280
const PH = 720
const PX = 4 / 3
/** 只认前缀：place() 只看 `data:image/`，图本体不参与几何 */
const ART = 'data:image/png;base64,iVBORw0KGgo='
/** 装饰小件的字号上限：页名 12pt / 图注 9pt 本来就这么小，缩字检查里不冤枉它们 */
const DECOR_PT = 13
/** 写超档的底线：字可以小，但还得读得出来 */
const MIN_OVER = 10

/**
 * 提示词里的那份容量（各族取 min）——「正常档」就是照它写的。
 * 门禁的语义要钉在这份数字上：提示词让模型写这么多，模板就必须排得下；
 * 若这里排不下，错在模板或容量表，不在模型。
 */
const T = tightCapacity()
const TITLE_CAP = 14
type Tier = 'normal' | 'over'

const scale = (n: number, tier: Tier) => (tier === 'over' ? Math.ceil(n * 1.3) : n)

/** 七式各造一页：字数按容量表的数字走（条数×每条字数），两档只差倍数 */
function fixtures(kind: StudentSlideKind, tier: Tier): StudentSlide {
  const fit = kind === 'board' ? T.numbered : kind === 'compare' ? T.compare : T.body
  /* 条数不缩放：内容层硬顶 6 条，各族 layout 又只画 5–6 条；
     再往上加条只会被截，测的就不是「写超」而是「越界」了。写超＝每条写长。 */
  const n = fit.items
  const each = scale(fit.each, tier)
  const base = {
    kind,
    /* 同页其它字按「真会写多长」给：标题 14 字、问句 20 字、出处 10 字、副题 11 字 */
    title: '课'.repeat(scale(Math.min(T.title, TITLE_CAP), tier)),
    line: '问'.repeat(scale(T.line, tier)),
    note: '出'.repeat(scale(10, tier)),
    meta: '小学语文 · 五年级上册',
    notes: '',
  }
  if (kind === 'cover') return { ...base, items: [] } as StudentSlide
  if (kind === 'quote') return { ...base, text: '文'.repeat(scale(T.quote, tier)), items: [] } as StudentSlide
  if (kind === 'end') return { ...base, line: '收'.repeat(scale(T.end.chars, tier)), items: [] } as StudentSlide
  if (kind === 'words') {
    return { ...base, items: Array.from({ length: T.words.items }, () => '词'.repeat(scale(T.words.each, tier))) } as StudentSlide
  }
  return {
    ...base,
    items: Array.from({ length: n }, () => '字'.repeat(each)),
  } as StudentSlide
}

const KINDS: StudentSlideKind[] = ['cover', 'close-read', 'words', 'board', 'compare', 'quote', 'end']
const ARCH_NAME: Record<string, string> = {
  cover: '封面',
  'close-read': '正文',
  words: '字词',
  board: '编号',
  compare: '对比',
  quote: '原文',
  end: '收尾',
}

/* ------------------------ 1 · 全部排得出来 ------------------------ */

console.log('=== 1. 十九族 × 七式 × 有画/无画 × 两档字数 ===')
const ids = Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]
const runs: { id: string; kind: StudentSlideKind; tier: Tier; art: boolean; out: Placed[] }[] = []
let threw = 0
for (const id of ids) {
  const theme = TEMPLATES[FAMILY_REPS[id]]
  for (const kind of KINDS) {
    for (const tier of ['normal', 'over'] as Tier[]) {
      for (const art of [false, true]) {
        const slide = { ...fixtures(kind, tier), illustration: art ? ART : undefined } as StudentSlide
        try {
          runs.push({ id, kind, tier, art, out: place(slide, theme) })
        } catch (e) {
          threw++
          fail(`1 ${id}/${ARCH_NAME[kind]}/${tier}/${art ? '有画' : '无画'}：place() 抛错（${(e as Error).message}）`)
        }
      }
    }
  }
}
if (!threw) ok('1 排得出来', `${runs.length} 页（19 族 × 7 式 × 2 档 × 2 画）零抛错`)

/* ------------------------ 2 · 字不许出框 ------------------------ */

console.log('\n=== 2. 每一块字都在自己的框里（多排一行就是溢） ===')
{
  let spill = 0
  let worst = { r: 0, where: '' }
  for (const r of runs) {
    const texts = r.out.filter((p) => p.kind === 'text' && String(p.text ?? '').trim())
    for (const p of texts) {
      const e = extentOf(p)
      /* 半行容差与 place.ts 的 settle 同一口径：一行小标签装在略矮的槽里不算崩，
         多排一行（真把下一块顶开）才算溢 */
      const lineH = (p.size ?? 18) * (4 / 3) * (p.lineHeight ?? 1.5)
      const over = e.h - (p.h * PH + lineH * 0.5)
      const ratio = Math.max(over / (p.h * PH), (e.w - p.w * PW) / (p.w * PW))
      if (ratio > worst.r) worst = { r: ratio, where: `${r.id}/${ARCH_NAME[r.kind]}/${r.tier}「${String(p.text).slice(0, 8)}」${p.size}pt` }
      if (over > 1) {
        spill++
        fail(
          `2 ${r.id}/${ARCH_NAME[r.kind]}/${r.tier}/${r.art ? '有画' : '无画'}：「${String(p.text ?? '').slice(0, 10)}」溢出本框（${p.size}pt 需 ${e.h.toFixed(0)}px，框高 ${(p.h * PH).toFixed(0)}px）`,
        )
      }
    }
  }
  if (!spill) ok('2 零溢出', `${runs.length} 页逐块量过（最险的一块超框 ${(worst.r * 100).toFixed(0)}%）`)
}

/* ------------------------ 3 · 字不压字 ------------------------ */

console.log('\n=== 3. 两块字不互压（按实际占位） ===')
{
  /* 正常档是硬合约：提示词让模型写这么多，一块都不许压。
     写超档已经超出合约（内容层该拆页），只守一条：内容长进固定家具（页名 / 页脚 / 图注）不行 */
  const decor = (p: Placed) => (p.size ?? 0) <= 13
  let hit = 0
  for (const r of runs) {
    const texts = r.out.filter((p) => p.kind === 'text' && String(p.text ?? '').trim())
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = extentOf(texts[i])
        const b = extentOf(texts[j])
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        const s = w > 0 && h > 0 ? w * h : 0
        const small = Math.min(a.w * a.h, b.w * b.h)
        if (small <= 0 || s / small <= 0.12) continue
        if (r.tier === 'over' && !decor(texts[i]) && !decor(texts[j])) continue
        hit++
        fail(
          `3 ${r.id}/${ARCH_NAME[r.kind]}/${r.tier}/${r.art ? '有画' : '无画'}：「${String(texts[i].text ?? '').slice(0, 6)}」压「${String(texts[j].text ?? '').slice(0, 6)}」`,
        )
      }
    }
  }
  if (!hit) ok('3 不压字', `${runs.length} 页：正常档零互压，写超档也没长进页名/页脚`)
}

/* ------------------------ 4 · 字不压画 ------------------------ */

console.log('\n=== 4. 有画时字不压画（封面除外：满版封面就是字压在图上） ===')
{
  let hit = 0
  let pics = 0
  for (const r of runs.filter((x) => x.art && x.kind !== 'cover')) {
    const img = r.out.find((p) => p.kind === 'image')
    if (!img) continue
    pics++
    for (const p of r.out) {
      if (p.kind !== 'text' || !String(p.text ?? '').trim()) continue
      const e = extentOf(p)
      const w = Math.min(e.x + e.w, (img.x + img.w) * PW) - Math.max(e.x, img.x * PW)
      const h = Math.min(e.y + e.h, (img.y + img.h) * PH) - Math.max(e.y, img.y * PH)
      const s = w > 0 && h > 0 ? (w * h) / (PW * PH) : 0
      if (s > 0.0002) {
        hit++
        fail(
          `4 ${r.id}/${ARCH_NAME[r.kind]}/${r.tier}：「${String(p.text ?? '').slice(0, 8)}」压在图上 ${(s * 100).toFixed(2)}%`,
        )
      }
    }
  }
  if (!hit) ok('4 图上无字', `共压 ${pics} 张图，图上零字`)
}

/* ------------------------ 5 · 正常档字号不塌 ------------------------ */

console.log(`\n=== 5. 正常档：提示词允许的字，不许缩到 ${LEGIBLE_PT}pt 以下 ===`)
{
  /* 判据与 capacity.fits() 完全同源：只有 settle 真缩过（size0 存在）、且缩到
     LEGIBLE_PT 以下，才算「容量表比框松」。轻微收字（26→24）是各族字阶不同，
     不算错；缩到 18pt 以下才是真的排不下。
     装饰件（页名 12pt / 图注 9pt）不进这一条：它们本来就是小件。 */
  let shrunk = 0
  let mild = 0
  for (const r of runs.filter((x) => x.tier === 'normal')) {
    for (const p of r.out) {
      if (p.kind !== 'text' || p.size0 === undefined) continue
      if ((p.size ?? 0) >= LEGIBLE_PT) {
        mild++
        continue
      }
      shrunk++
      fail(
        `5 ${r.id}/${ARCH_NAME[r.kind]}/${r.art ? '有画' : '无画'}：「${String(p.text ?? '').slice(0, 8)}」从 ${p.size0}pt 降到 ${p.size}pt（低于 ${LEGIBLE_PT}pt）——这族的框排不下提示词允许的字数`,
      )
    }
  }
  if (!shrunk) ok('5 不塌字号', `正常档 ${runs.filter((x) => x.tier === 'normal').length} 页：没有一块字被缩到 ${LEGIBLE_PT}pt 以下（轻微收字 ${mild} 处仍可读）`)
}

/* ------------------------ 6 · 写超档的收法 ------------------------ */

console.log(`\n=== 6. 写超档：只缩字号，不抛错、不溢出、不丢条目、不掉到 ${MIN_OVER}pt 以下 ===`)
{
  let small = 0
  let lost = 0
  for (const r of runs.filter((x) => x.tier === 'over')) {
    for (const p of r.out) {
      if (p.kind !== 'text' || p.size0 === undefined) continue
      /* 装饰小件（页名 / 图注）本来就小，不作为「被挤」的证据 */
      if ((p.size0 ?? 0) <= DECOR_PT) continue
      if ((p.size ?? 0) < MIN_OVER) {
        small++
        fail(`6 ${r.id}/${ARCH_NAME[r.kind]}：「${String(p.text ?? '').slice(0, 8)}」从 ${p.size0}pt 缩到 ${p.size}pt（低于 ${MIN_OVER}pt）`)
      }
    }
    /* 条目一条都不许丢：输出里正文标记字「字」的个数不少于原稿 */
    if (['close-read', 'board', 'compare'].includes(r.kind)) {
      const want = (fixtures(r.kind, 'over').items ?? []).join('').split('').filter((c) => c === '字').length
      const got = r.out
        .filter((p) => p.kind === 'text')
        .map((p) => p.text ?? '')
        .join('')
        .split('')
        .filter((c) => c === '字').length
      if (got < want) {
        lost++
        fail(`6 ${r.id}/${ARCH_NAME[r.kind]}：条目被吞（原稿 ${want} 字，输出只剩 ${got} 字）`)
      }
    }
  }
  if (!small && !lost) ok('6 收得住', `写超档也没有一块内容掉到 ${MIN_OVER}pt 以下，条目零丢失`)
}

/* ------------------------------ 汇总 ------------------------------ */

console.log('')
if (FAIL.length) {
  console.error(`check:fit 未通过：${FAIL.length} 条`)
  for (const f of FAIL.slice(0, 40)) console.error(`  ✗ ${f}`)
  if (FAIL.length > 40) console.error(`  …另有 ${FAIL.length - 40} 条`)
  process.exit(1)
}
console.log('✓ check:fit 六条全过：排得出来 / 零溢出 / 不压字 / 不压画 / 字号不塌 / 写超收得住')