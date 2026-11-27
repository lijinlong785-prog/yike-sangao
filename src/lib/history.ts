import type { LessonPlan } from '../types'

const STORAGE_KEY = 'yike-sangao:history'
const MAX_ITEMS = 8

export interface HistoryItem {
  id: string
  savedAt: number
  plan: LessonPlan
}

function isValidItem(value: unknown): value is HistoryItem {
  const v = value as HistoryItem | null
  return Boolean(
    v &&
      typeof v.id === 'string' &&
      typeof v.savedAt === 'number' &&
      typeof v.plan?.meta?.topic === 'string' &&
      Array.isArray(v.plan?.segments)
  )
}

function read(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    // 旧版本或手改过的数据不能让首页白屏
    return Array.isArray(list) ? list.filter(isValidItem) : []
  } catch {
    return []
  }
}

function write(list: HistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 存储空间不足时静默失败，不影响主流程
  }
}

/** 同一课题（学科 + 年级 + 课时相同）只保留最新一份 */
export function saveHistory(plan: LessonPlan): HistoryItem[] {
  const { topic, subject, grade, period } = plan.meta
  const kept = read().filter(
    (h) =>
      !(
        h.plan.meta.topic === topic &&
        h.plan.meta.subject === subject &&
        h.plan.meta.grade === grade &&
        h.plan.meta.period === period
      )
  )
  const next: HistoryItem[] = [
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now(), plan },
    ...kept,
  ].slice(0, MAX_ITEMS)
  write(next)
  return next
}

export function loadHistory(): HistoryItem[] {
  return read()
}

export function removeHistory(id: string): HistoryItem[] {
  const next = read().filter((h) => h.id !== id)
  write(next)
  return next
}

export function clearHistory(): HistoryItem[] {
  write([])
  return []
}

export function formatSavedAt(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今天 ${hm}`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hm}`
}
