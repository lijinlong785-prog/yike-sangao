/**
 * 模板 A：逐层揭示（默认，全学科通用）
 * 文字块按 step 逐条淡入上移，关键词用朱红短线从左向右描出；
 * 问句压最后一步出场，答案永远只在备注里（页面上不写答案）。
 * 纯 CSS transition，回退时反向播放。
 *
 * TASKS/08 §A.2② 对比页岔路：下面三个新 props 只给 compare 两栏页传；
 * 其余页 props 缺省，渲染结果与改前逐字节一致（版式与揭示逻辑没动）。
 * 点条目只写父组件的 pairIndex，不碰 step：揭示照旧跟 step，描边高亮跟 activePair。
 */
import type { ComparePair } from '../../lib/show'

interface Props {
  /** 左上角分类小字，取自 SLIDE_LABELS，和 .pptx 同一张表 */
  label: string
  title: string
  /** 条目（不含问句），一行一条 */
  items: string[]
  /** 这一页的问句：朱红宋体，排在条目之后揭示 */
  question?: string
  /** 图位检索词：虚线占位框里的灰字，课前换真图 */
  figure?: string
  /** 字词页：一行一词的大字（对应 .pptx 的 54pt 下限） */
  big?: boolean
  /** 对比页：左右两栏，一件事对一件事 */
  columns?: boolean
  step: number
  /** 对比页岔路：条目可点（仅鼠标，不影响揭示） */
  pickable?: boolean
  /** 当前联动的一对（左右同描边）+ 中间浮出的「哪儿不一样」 */
  activePair?: ComparePair | null
  onPickItem?: (i: number) => (e: React.MouseEvent) => void
}

/** 用 **关键词** 描朱红下线；路径页、拆解页也复用这一套 */
export function RichLine({ text }: { text: string }) {
  const parts = String(text ?? '').split('**')
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span className="ss-key" key={i}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export default function RevealSlide({
  label,
  title,
  items,
  question,
  figure,
  big,
  columns,
  step,
  pickable,
  activePair,
  onPickItem,
}: Props) {
  const questionAt = items.length + 1
  const listClass = ['ss-list', big ? 'words' : '', columns ? 'cols' : '']
    .filter(Boolean)
    .join(' ')
  const peaked = (i: number) =>
    !!activePair && (i === activePair.left || (activePair.right >= 0 && i === activePair.right))

  const itemsList = (
    <ul className={listClass}>
      {items.map((item, i) => {
        // 岔路入口只给「已揭示」的行：未揭示的 .ss-item 仍占版收 click，
        // 若让它挂上 onPickItem（内部 stopPropagation），刚进对比页时整块栏就成死区，
        // 掐断唯一的点击翻页。门槛 i < step 保证未揭示行不拦截、click 照常冒泡到 advance。
        const canPick = !!pickable && !!onPickItem && i < step
        return (
          <li
            key={i}
            className={`${i < step ? 'ss-item on' : 'ss-item'}${peaked(i) ? ' peak' : ''}${
              canPick ? ' pickable' : ''
            }`}
            onClick={canPick && onPickItem ? onPickItem(i) : undefined}
          >
            {big ? null : <span className="ss-no">{String(i + 1).padStart(2, '0')}</span>}
            <span className="ss-text">
              <RichLine text={item} />
            </span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="ss-slide">
      <p className="ss-label">{label}</p>
      <h2 className="ss-title">{title}</h2>

      {figure && (
        <div className="ss-figure">
          <span className="ss-figure-tag">图位</span>
          <span className="ss-figure-hint">{figure}</span>
        </div>
      )}

      {/* 定位宿主：只在两栏对比页需要——绝对定位的浮出提示挂在这里就不占版，
          选中/清除时下半页（问句、条目）不再上下抖版。普通揭示页不套这层。 */}
      {columns ? (
        <div className="ss-list-host">
          {itemsList}
          {/* 两栏中间浮出的那行「哪儿不一样」：只在选中一对时存在，绝对居中，不参与揭示节拍 */}
          {activePair && activePair.hint && <p className="ss-compare-hint">{activePair.hint}</p>}
        </div>
      ) : (
        itemsList
      )}

      {question && (
        <p className={step >= questionAt ? 'ss-question on' : 'ss-question'}>
          <RichLine text={question} />
        </p>
      )}
    </div>
  )
}
