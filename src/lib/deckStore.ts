import type { DeckPage, DeckKind } from './deck'
import { layoutOfDeck, type DeckLayout } from './deck'
import type { DirectPlan, DirectorCache, TypesetPlan } from './director'

/**
 * 课件编辑态的持久化（09 §E「改完即存」的落盘那一半）。
 *
 * 四条规矩：
 *   1. 只存「当前这一课」的一份：换新课必须清干净，不能把上一课的改动带过去；
 *   2. 只认课题 + 课时（topic|period）同一份的存档，标题对不上就当没存过；
 *   3. 读坏了不能让首页白屏：校验不过一律当没存过；
 *   4. 存档里记一份原稿指纹：指纹一样 = 这就是刷新，原样还给你（连删掉的页、
 *      调过的页序一起还）；指纹不一样 = 原稿重新生成了，只能合页保改过的页；
 *   5. 另存一份 layout（删页墓碑 + 页序）：合页重建时靠它把删掉的页锯掉、
 *      把用户拖过的顺序摆回去（10 §十三 第 3、4 件）。
 */
const STORAGE_KEY = 'yike-sangao:deck'

const KINDS: DeckKind[] = [
  'cover',
  'objectives',
  'keypoints',
  'design',
  'hardpoint',
  'segment',
  'segmentPoint',
  'pause',
  'activity',
  'assessment',
  'board',
  'prep',
  'homework',
]

export interface StoredDeck {
  /** 课题 + 课时，用来判断是不是同一课 */
  topic: string
  savedAt: number
  /** 存这份时的原稿指纹（见 deckFingerprint） */
  base: string
  pages: DeckPage[]
  /** 删页墓碑 + 页序：重建时用 */
  layout?: DeckLayout
}

export interface LoadedDeck {
  pages: DeckPage[]
  /** 存档对应的原稿与眼下这一版完全一样：可以原样用，不必合页 */
  sameBase: boolean
  /** 删了哪些页、按什么顺序：合页重建时要吃的 */
  layout: DeckLayout
}

function isPage(value: unknown): value is DeckPage {
  const p = value as DeckPage | null
  return Boolean(
    p &&
      typeof p === 'object' &&
      typeof p.kind === 'string' &&
      KINDS.includes(p.kind as DeckKind) &&
      typeof p.title === 'string' &&
      typeof p.label === 'string'
  )
}

/** 课件存档的键：与 App 里认页用的是同一个口径（课题 + 课时） */
export function deckStoreTopic(topic: string, period: string): string {
  return `${topic}|${period}`
}

function digest(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`
}

/**
 * 原稿指纹：页型、首版标题、当前标题、要点、口播全算进去。
 * 只要课件内容真的换了（重新备课 / 换规模），指纹就会变。
 */
export function deckFingerprint(pages: DeckPage[]): string {
  const body = pages
    .map((p) =>
      [p.kind, p.baseTitle ?? p.title, p.title, (p.bullets ?? []).join('\u0002'), p.notes].join(
        '\u0001'
      )
    )
    .join('\u0003')
  return digest(body)
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function read(): StoredDeck | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as StoredDeck | null
    if (!data || typeof data.topic !== 'string' || !Array.isArray(data.pages)) return null
    const pages = data.pages.filter(isPage)
    // 一页都不剩（存档被写坏）：当没存过，别让界面拿到空课件
    if (pages.length === 0) return null
    return {
      topic: data.topic,
      savedAt: Number(data.savedAt) || 0,
      base: typeof data.base === 'string' ? data.base : '',
      pages,
      layout: { deleted: ids(data.layout?.deleted), order: ids(data.layout?.order) },
    }
  } catch {
    return null
  }
}

function write(data: StoredDeck) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // 存储写不进去（隐私模式 / 配额满）时静默失败：本次编辑仍在内存里可用
  }
}

/**
 * 存一份。只有一个槽位：新的一课会把上一课那份顶掉，
 * 所以「换新课清干净」与「同一课刷新能恢复」用的是同一个动作。
 */
export function saveDeck(topic: string, pages: DeckPage[], base: DeckPage[]): void {
  if (!topic || !Array.isArray(pages) || pages.length === 0) return
  write({
    topic,
    savedAt: Date.now(),
    base: deckFingerprint(base),
    pages,
    layout: layoutOfDeck(pages, base),
  })
}

/**
 * 取同一课的存档；课题对不上就返回 null（不去猜、不跨课恢复）。
 * sameBase 为真时 pages 就是用户上次看到的那一叠（删页、页序都保住了），
 * 为假时调用方应改用 mergeDeck 合页，只保打过 userEdited 的页。
 */
export function loadDeck(topic: string, base: DeckPage[]): LoadedDeck | null {
  const data = read()
  if (!data || !topic || data.topic !== topic) return null
  return {
    pages: data.pages,
    sameBase: data.base === deckFingerprint(base),
    layout: data.layout ?? { deleted: [], order: [] },
  }
}

/** 主动清掉（「恢复原稿」按钮 / 换到别的课） */
export function clearDeck(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 清不掉也不该阻塞界面
  }
}

/* ================================================================== *
 * 插画缓存（TASKS/11 §五③）                                           *
 *                                                                    *
 * 一次生图 0.2 元，同一份课件重出、翻页、二次导出都不许再打接口。        *
 * 键是「课件指纹 + 页下标」：指纹变了（换课 / 重新生成 / 改锁档）就    *
 * 当没缓存，重新配图。                                                *
 *                                                                    *
 * 为什么不上 localStorage：一张 1024×576 的 PNG 转 base64 约 1.1MB，   *
 * 6 张就 6.9MB，5MB 的配额根本装不下。所以落 IndexedDB，再用一张     *
 * 模块级 Map 做 L1——Node 侧（导出脚本）没有 indexedDB，L1 就是全部， *
 * 同一进程里「再导一次」自然 0 调用。                                  *
 * ================================================================== */

const ILLUST_DB = 'yike-sangao:illust'
const ILLUST_STORE = 'pages'
/** 导演计划（两遍的产出）放同一个库里，版式一变就要跟着清，放一起最省事 */
const PLAN_STORE = 'plans'
const ILLUST_DB_VERSION = 2

/** L1：进程内缓存。key = `${指纹}:${页下标}` */
const ILLUST_L1 = new Map<string, string>()

function illustKey(fp: string, index: number): string {
  return `${fp}:${index}`
}

/** 学生版这一叠的指纹：页型、标题、正文、条目都算进去；illustration 本身不算 */
export function slidesFingerprint(
  slides: readonly { kind: string; title: string; line?: string; items?: string[] }[]
): string {
  return digest(
    slides
      .map((s) => [s.kind, s.title, s.line ?? '', (s.items ?? []).join('\u0002')].join('\u0001'))
      .join('\u0003')
  )
}

interface IllustRow {
  key: string
  fp: string
  index: number
  dataUrl: string
}

let dbPromise: Promise<IDBDatabase | null> | null = null

/** 打开插画库；隐私模式 / 不支持 / 被拒一律返回 null，只剩 L1 也能工作 */
function openIllustDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(ILLUST_DB, ILLUST_DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(ILLUST_STORE)) db.createObjectStore(ILLUST_STORE, { keyPath: 'key' })
        if (!db.objectStoreNames.contains(PLAN_STORE)) db.createObjectStore(PLAN_STORE, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

/** 插画缓存：与 illustrate.ts 的 IllustCache 接口一致 */
export const illustCache = {
  /** 取这一份课件已经配过的全部插画（页下标 → dataURL） */
  async load(fp: string): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const prefix = `${fp}:`
    for (const [k, v] of ILLUST_L1) {
      if (k.startsWith(prefix)) out.set(Number(k.slice(prefix.length)), v)
    }
    const db = await openIllustDb()
    if (!db) return out
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(ILLUST_STORE, 'readonly')
        const req = tx.objectStore(ILLUST_STORE).openCursor()
        req.onsuccess = () => {
          const cur = req.result
          if (!cur) {
            resolve()
            return
          }
          const row = cur.value as IllustRow
          if (row && row.fp === fp && typeof row.dataUrl === 'string') {
            out.set(row.index, row.dataUrl)
            ILLUST_L1.set(illustKey(fp, row.index), row.dataUrl)
          }
          cur.continue()
        }
        req.onerror = () => resolve()
        tx.onabort = () => resolve()
      } catch {
        resolve()
      }
    })
    return out
  },

  /** 记一张：先落 L1（必定成功），再尽量落 IndexedDB */
  async save(fp: string, index: number, dataUrl: string): Promise<void> {
    ILLUST_L1.set(illustKey(fp, index), dataUrl)
    const db = await openIllustDb()
    if (!db) return
    try {
      const tx = db.transaction(ILLUST_STORE, 'readwrite')
      tx.objectStore(ILLUST_STORE).put({ key: illustKey(fp, index), fp, index, dataUrl } satisfies IllustRow)
    } catch {
      // 配额满 / 库被关掉：这一份只剩内存缓存，下次重新生成页面会重画，不影响这次导出
    }
  },
}

/* ================================================================== *
 * 导演计划缓存（TASKS/12 §四）                                          *
 *                                                                    *
 * 第一遍（定画法）与第二遍（按图排版）都是真金白银的调用。同一份教案   *
 * 第二次导出必须 0 调用：键是「课题指纹」（课题 + 学段 + 学科 + 课时 + *
 * 张数 + 整叠页面内容），换教案立刻失效；图片另用「课题指纹 + 导演输出 *
 * 哈希」做键（见 director.ts），换了画法就重画，不会被旧图冒充。       *
 * ================================================================== */

interface PlanRow {
  key: string
  direct: DirectPlan
  typeset: TypesetPlan
}

/** L1：进程内。Node 侧（导出脚本）没有 indexedDB，这一层就是全部 */
const PLAN_L1 = new Map<string, PlanRow>()

export const directorCache: DirectorCache = {
  async load(key: string): Promise<{ direct: DirectPlan; typeset: TypesetPlan } | null> {
    const hit = PLAN_L1.get(key)
    if (hit) return { direct: hit.direct, typeset: hit.typeset }
    const db = await openIllustDb()
    if (!db) return null
    return new Promise((resolve) => {
      try {
        const req = db.transaction(PLAN_STORE, 'readonly').objectStore(PLAN_STORE).get(key)
        req.onsuccess = () => {
          const row = req.result as PlanRow | undefined
          if (!row || !Array.isArray(row.direct?.pages) || !Array.isArray(row.typeset?.pages)) {
            resolve(null)
            return
          }
          PLAN_L1.set(key, row)
          resolve({ direct: row.direct, typeset: row.typeset })
        }
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  },

  async save(key: string, value: { direct: DirectPlan; typeset: TypesetPlan }): Promise<void> {
    const row: PlanRow = { key, direct: value.direct, typeset: value.typeset }
    PLAN_L1.set(key, row)
    const db = await openIllustDb()
    if (!db) return
    try {
      db.transaction(PLAN_STORE, 'readwrite').objectStore(PLAN_STORE).put(row)
    } catch {
      // 写失败只影响「下次少一次调用」，不影响这次导出
    }
  },
}