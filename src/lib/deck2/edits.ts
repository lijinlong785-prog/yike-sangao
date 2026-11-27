/**
 * 学生版 PPT 的增删改（TASKS/21）。
 *
 * 一句话说明白这里为什么存在：PPT 出来以后老师还要改字、删页、调序，
 * 改完下载的必须是他改过的那一份。应用逻辑只写在这里**一份**，
 * 预览（PptPreview）/ 放映（SlideShow）/ 下载（pptx.ts 的 place() 那条路）
 * 三处都拿 applyEdits 之后的那一叠，谁也不许自己去读原始 slides。
 *
 * 三条规矩：
 * 1. `applyEdits` 是纯函数：同输入同输出，不读 localStorage、不读时间、不改原数组。
 * 2. 编辑状态**不进 StudentSlide 本身**（内容层不许被 UI 污染），它是一个并行的 DeckEdits。
 * 3. 换模板只换版面，edits 原样保留；只有「重新生成」才清空。
 */
import type { StudentSlide } from '../slides'
import type { DensityLimits } from '../density'

/** 能改的字段：页面上印的字 + 老师的口播稿（notes，进 .pptx 备注页）+ 单页配图（illustration）。
 *  meta / byline 是封面上的两行（TASKS/25），老师的班级与教材就在这两行上改。
 *  illustration 支持本地上传替换（data URL）或清空移除（''），进撤销栈、换模板保留、直写 .pptx。 */
export type SlidePatch = Partial<
  Pick<StudentSlide, 'title' | 'line' | 'text' | 'note' | 'notes' | 'items' | 'meta' | 'byline' | 'illustration'>
>

/** 一页的引用：number = 原始下标；string = 老师新插的那一页的 id */
export type PageRef = number | string

export interface DeckEdits {
  /** 页序：存原始下标，可增删可换位；空数组 = 原样（全部页按原顺序显示） */
  order: number[]
  /** 删掉的原始下标 */
  removed: number[]
  /** 改过的字段，按原始下标存 */
  patches: Record<number, SlidePatch>
  /**
   * 老师新插的页（TASKS/21 §二.5「增页」）：id → 页内容。
   * 新页不属于原始 slides，所以它的文字直接存在这里——换模板时 place() 照样按模板排。
   */
  added?: Record<string, StudentSlide>
  /**
   * 页引用序列。一旦老师插过页，它就成了**唯一**的显示序（order 不再参与），
   * 否则「插在中间」这件事没法用纯下标数组表达。没有插过页时不写这个字段，
   * 老的 order / removed 路径一字不动——七条编辑门禁测的就是那条路。
   */
  seq?: PageRef[]
}

export const EMPTY_EDITS: DeckEdits = Object.freeze({
  order: Object.freeze([]) as unknown as number[],
  removed: Object.freeze([]) as unknown as number[],
  patches: Object.freeze({}) as unknown as Record<number, SlidePatch>,
})

const isIndex = (n: unknown, total: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < total

/**
 * 这一叠真正要显示的下标序列。
 * 规则（TASKS/21 §2.1）：
 *   · `removed` 优先于 `order`；
 *   · `order` 非空时，没列进去的下标就是不显示（等同删除）；
 *   · `order` 为空时 = 原始顺序减去 `removed`（没动过的默认态）。
 * 越界 / 重复 / 非整数的脏值在这里就被丢掉，下游不必再防一遍。
 */
export function visibleOrder(edits: DeckEdits, total: number): number[] {
  const n = Math.max(0, Math.floor(total))
  const removed = new Set((edits?.removed ?? []).filter((i) => isIndex(i, n)))
  const raw = (edits?.order ?? []).filter((i) => isIndex(i, n) && !removed.has(i))
  if (raw.length === 0) {
    return Array.from({ length: n }, (_, i) => i).filter((i) => !removed.has(i))
  }
  const seen = new Set<number>()
  return raw.filter((i) => (seen.has(i) ? false : (seen.add(i), true)))
}

/**
 * 这一叠真正要显示的引用序列（插过页之后用这个取显示序）。
 * seq 里被 removed 的原页、already-gone 的新增页都在这里滤掉，下游不必再防。
 */
export function visibleRefs(edits: DeckEdits, total: number): PageRef[] {
  const seq = edits?.seq ?? []
  if (seq.length === 0) return visibleOrder(edits, total)
  const n = Math.max(0, Math.floor(total))
  const gone = new Set((edits?.removed ?? []).filter((i) => isIndex(i, n)))
  const added = edits?.added ?? {}
  return seq.filter((ref) =>
    typeof ref === 'string' ? Boolean(added[ref]) : isIndex(ref, n) && !gone.has(ref)
  )
}

/** 把补丁合进一页；没有有效字段就原样返回（上层能靠引用相等看出「没动」） */
function mergePatch(base: StudentSlide, patch: SlidePatch | undefined): StudentSlide {
  if (!base || !patch) return base
  const fields = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (fields.length === 0) return base
  const next: StudentSlide = { ...base }
  for (const k of fields) {
    const key = k as keyof SlidePatch
    const v = patch[key]
    if (key === 'items') next.items = Array.isArray(v) ? [...(v as string[])] : next.items
    else if (typeof v === 'string') next[key] = v as never
  }
  return next
}

/**
 * 纯函数：把编辑应用到原始 slides 上，返回新数组。原数组不改。
 * - 只返回 `visibleOrder` 里的页；
 * - `patches` 对已删除的页无效（它根本不会进结果的循环）；
 * - 没改过的页原样返回同一个引用，方便上层看出「这页没动」。
 * - 插过页（seq 非空）：按 seq 走，新页从 `added` 里取。
 */
export function applyEdits(slides: StudentSlide[], edits: DeckEdits): StudentSlide[] {
  const list = Array.isArray(slides) ? slides : []
  if (list.length === 0) return []
  const patches = edits?.patches ?? {}
  const added = edits?.added ?? {}
  return visibleRefs(edits, list.length).map((ref) =>
    typeof ref === 'string' ? added[ref] : mergePatch(list[ref], patches[ref])
  )
}

/** 调过序 / 删过页 / 改过字，任一成立就算动过 */
export function isEdited(edits: DeckEdits): boolean {
  return editCount(edits) > 0
}

/**
 * 导出的页数闸门跟着这一叠的**实际页数**走（TASKS/21）。
 * 老师删过、插过页之后，生成时那一段「16–26 页」已经不代表这一叠；
 * 字体 / 字数 / items 的上限一个字也不动——只放开页数两端。
 */
export function stackLimits(limits: DensityLimits, length: number): DensityLimits {
  const n = Math.max(0, Math.floor(length))
  return {
    ...limits,
    pagesMin: Math.min(limits.pagesMin, n),
    pagesMax: Math.max(limits.pagesMax, n),
  }
}

/**
 * 「改过 N 处」里的那个 N：
 * 每个改过的字段算一处、每删一页算一处、每一处顺序变动算一处。
 * 注意删页会把手写的 order 物化（见 removeOriginal），所以顺序变动要跟
 * 「删完之后应有的顺序」比，不能跟 0..n-1 比，否则删一页会被数成几十处。
 */
export function editCount(edits: DeckEdits): number {
  const patches = edits?.patches ?? {}
  const patched = Object.values(patches).reduce(
    (n, p) => n + Object.keys(p ?? {}).filter((k) => (p as Record<string, unknown>)[k] !== undefined).length,
    0
  )
  const removed = (edits?.removed ?? []).filter((i) => Number.isInteger(i) && i >= 0)
  const seq = edits?.seq ?? []
  /* 插过页：每插一页算一处；调序看「原始下标那一段」还是不是原来的相对顺序；
     新页里改字不再单独计数（一页算一处，不虚高） */
  if (seq.length > 0) {
    const adds = seq.filter((r) => typeof r === 'string').length
    const nums = seq.filter((r): r is number => typeof r === 'number')
    const top = Math.max(-1, ...nums, ...removed)
    const gone = new Set(removed)
    const expected = Array.from({ length: top + 1 }, (_, i) => i).filter((i) => !gone.has(i))
    const moved = nums.length === expected.length && expected.every((v, i) => v === nums[i]) ? 0 : 1
    return patched + adds + removed.length + moved
  }
  const order = edits?.order ?? []
  let moved = 0
  if (order.length > 0) {
    const gone = new Set(removed)
    const total = Math.max(order.length, ...order, ...removed) + 1
    const expected = Array.from({ length: total }, (_, i) => i).filter((i) => !gone.has(i))
    const sameLength = expected.length === order.length
    const identity = sameLength && expected.every((v, i) => v === order[i])
    if (!identity) moved = 1
  }
  return patched + removed.length + moved
}

/* ------------------------- 三个改法（都返回新对象） ------------------------- */

/** 改这一页的字：按原始下标存，后改的覆盖先改的 */
export function patchOriginal(edits: DeckEdits, total: number, orig: number, patch: SlidePatch): DeckEdits {
  if (!isIndex(orig, total)) return edits
  const prev = edits?.patches?.[orig] ?? {}
  const next: SlidePatch = { ...prev, ...patch }
  // 空字符串 / 空数组也算改过（老师就是要清掉那一行），只有 undefined 才视为没改
  const kept = Object.fromEntries(
    Object.entries(next).filter(([, v]) => v !== undefined)
  ) as SlidePatch
  return { ...edits, patches: { ...edits.patches, [orig]: kept } }
}

/** 删这一页：order 先物化，再把原始下标拉进 removed（两处口径一致） */
export function removeOriginal(edits: DeckEdits, total: number, orig: number): DeckEdits {
  if (!isIndex(orig, total)) return edits
  const order = visibleOrder(edits, total).filter((i) => i !== orig)
  if (order.length === 0) return edits
  const removed = [...new Set([...(edits?.removed ?? []), orig])].sort((a, b) => a - b)
  return { ...edits, order, removed }
}

/** 调序：orig 往前/往后挪 delta 位（-1 = 上移） */
export function moveOriginal(edits: DeckEdits, total: number, orig: number, delta: number): DeckEdits {
  if (!isIndex(orig, total) || !Number.isInteger(delta) || delta === 0) return edits
  const order = [...visibleOrder(edits, total)]
  const at = order.indexOf(orig)
  if (at < 0) return edits
  const to = at + delta
  if (to < 0 || to >= order.length) return edits
  order.splice(at, 1)
  order.splice(to, 0, orig)
  return { ...edits, order }
}

/* ------------------ 插过页之后：按显示位置改（TASKS/21 §二.5「增页」） ------------------ */

/**
 * 插页把 `seq` 激活之后，「第 3 页」不再等于「原始下标 3」——
 * 上面那三个函数按原始下标改，这一组按**显示位置**改。
 * 显示序只有 `visibleRefs` 一个出口，所有动作都以它为起点，不各算一遍。
 */

/** 插在显示位置 atPos 之后（-1 = 插到最前）：新页内容进 `added`，换模板时 place() 照样排 */
export function addAfter(
  edits: DeckEdits,
  total: number,
  atPos: number,
  id: string,
  slide: StudentSlide
): DeckEdits {
  if (!id || !slide) return edits
  const seq = visibleRefs(edits, total)
  const at = Math.max(-1, Math.min(Math.floor(atPos), seq.length - 1))
  const next = [...seq]
  next.splice(at + 1, 0, id)
  return { ...edits, seq: next, added: { ...(edits?.added ?? {}), [id]: { ...slide } } }
}

/** 删显示位置上的那一页：原始页进 `removed`，新页从 `seq` 与 `added` 一起摘掉 */
export function removeAt(edits: DeckEdits, total: number, atPos: number): DeckEdits {
  const seq = visibleRefs(edits, total)
  const at = Math.floor(atPos)
  /* 一页都不剩就不删：跟 removeOriginal 同一条底线，空课件没有意义 */
  if (at < 0 || at >= seq.length || seq.length <= 1) return edits
  const ref = seq[at]
  const next = seq.filter((_, i) => i !== at)
  if (typeof ref === 'string') {
    const added = { ...(edits?.added ?? {}) }
    delete added[ref]
    return { ...edits, seq: next, added }
  }
  const removed = [...new Set([...(edits?.removed ?? []), ref])].sort((a, b) => a - b)
  return { ...edits, seq: next, removed }
}

/** 把显示位置 atPos 上的页往前/往后挪 delta 位 */
export function moveAt(edits: DeckEdits, total: number, atPos: number, delta: number): DeckEdits {
  if (!Number.isInteger(delta) || delta === 0) return edits
  const seq = visibleRefs(edits, total)
  const at = Math.floor(atPos)
  const to = at + delta
  if (at < 0 || at >= seq.length || to < 0 || to >= seq.length) return edits
  const next = [...seq]
  const [ref] = next.splice(at, 1)
  next.splice(to, 0, ref)
  return { ...edits, seq: next }
}

/** 改一页：原始页走 patchOriginal，新页直接改 `added` 里那一份（undefined = 这一格没改） */
export function patchRef(edits: DeckEdits, total: number, ref: PageRef, patch: SlidePatch): DeckEdits {
  if (typeof ref === 'number') return patchOriginal(edits, total, ref, patch)
  const base = edits?.added?.[ref]
  if (!base) return edits
  return { ...edits, added: { ...edits.added, [ref]: mergePatch(base, patch) } }
}
