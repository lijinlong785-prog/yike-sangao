import { useCallback, useEffect, useRef, useState } from 'react'
import { countDeckPages, downloadDeckPptx } from './pptx'
import type { DeckPage } from './deck'
import type { DeckTheme } from './theme'

/**
 * 课件导出的文件名（10 §七「导出的必须是用户看到的那一版」）。
 * 与学生版课堂 PPT 的《课题》-课堂PPT.pptx 分开，一眼能看出是哪一份。
 */
export function coursewarePptxName(topic: string, animated = true): string {
  const clean = String(topic ?? '').replace(/[《》\s]/g, '') || '课件'
  return animated ? `《${clean}》-课件.pptx` : `《${clean}》-课件-静态.pptx`
}

export interface DeckExportState {
  busy: boolean
  done: boolean
  page: number
  total: number
  error: string
}

export interface DeckExport extends DeckExportState {
  /** true = 文件已经下载走；false = 失败原因已经写进 error。animated=false 导纯静态版 */
  run: (pages: DeckPage[], fileName: string, theme?: DeckTheme, animated?: boolean) => Promise<boolean>
  reset: () => void
}

const IDLE: DeckExportState = { busy: false, done: false, page: 0, total: 0, error: '' }

/**
 * 「导出课件 PPT ↓」那颗按钮的三个态：进度 / 成功 / 失败。
 *
 * 与学生版的 usePptxExport 刻意分开：那份走 validateSlides（禁词、密度、问句），
 * 课件本来就会写「教学目标」「设计意图」，不能拿学生版那套尺子量它。
 */
export function useDeckPptxExport(): DeckExport {
  const [state, setState] = useState<DeckExportState>(IDLE)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )

  const run = useCallback(async (pages: DeckPage[], fileName: string, theme?: DeckTheme, animated = true) => {
    const total = countDeckPages(pages)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setState({ ...IDLE, busy: true, total, page: total ? 1 : 0 })
    try {
      await downloadDeckPptx(
        pages,
        (page) => setState((d) => ({ ...d, page })),
        fileName,
        theme,
        { animated }
      )
      setState({ ...IDLE, done: true, total })
      timerRef.current = window.setTimeout(() => setState(IDLE), 2600)
      return true
    } catch (e) {
      const raw = (e instanceof Error ? e.message : String(e ?? '')).replace(/\s+/g, ' ').trim()
      const networkish = /import|fetch|network|Failed to load/i.test(raw)
      setState({
        ...IDLE,
        total,
        error: networkish
          ? '课件引擎没加载成功（可能是网络断了），点重试再来一次。'
          : raw || '课件 PPT 没能生成，请重试。',
      })
      return false
    }
  }, [])

  const reset = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setState(IDLE)
  }, [])

  return { ...state, run, reset }
}