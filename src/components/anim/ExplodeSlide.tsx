/**
 * 模板 B：结构拆解（数学几何、生字结构）
 * 六个面是六个独立图层，点一下沿各自方向散开并浮现标注，再点一次收回。
 * 图层数据在 src/data/anim.ts 里手工定义，不依赖模型生成。
 * 这一页同时要把学生版那几句字（条目 + 问句）投在图上，不能只剩一个教具图。
 *
 * TASKS/08 §A.2① 真交互：键盘主线仍是 step 1/2/3（收拢→散开→收回）；
 * 鼠标岔路另走——「拆开/合上」只拨 opened，零件点选只拨 activePart，
 * 两者都不碰 step。散开 = 键盘走到第 2 步 或 鼠标按下拆开（展示层 OR 合并）。
 */
import { CUBE_EDGES, CUBE_FACES, CUBE_VERTS } from '../../data/anim'
import { RichLine } from './RevealSlide'

interface Props {
  label: string
  title: string
  /** 这一页学生抬头要看的那几行 */
  items?: string[]
  /** 问句：朱红，答案只在备注里 */
  question?: string
  step: number
  /** 鼠标的「拆开」按下了没有（岔路 state，与 step 无关） */
  opened: boolean
  /** 展示层的散开判定 = step === 2 || opened，由 SlideShow 合并 */
  exploded: boolean
  /** 被点中的零件下标，-1 = 没选 */
  activePart: number
  /** 六个零件的短标签（≤12 字，data/anim.ts 的 noteShort），点中谁浮出谁 */
  noteShorts: string[]
  onToggleOpen: (e: React.MouseEvent) => void
  onPickPart: (i: number) => (e: React.MouseEvent) => void
}

export default function ExplodeSlide({
  label,
  title,
  items,
  question,
  step,
  opened,
  exploded,
  activePart,
  noteShorts,
  onToggleOpen,
  onPickPart,
}: Props) {
  const collapsedAgain = step >= 3 && !opened
  const activeFace = activePart >= 0 ? CUBE_FACES[activePart] : undefined

  return (
    <div className="ss-slide ss-slide-b">
      <p className="ss-label">{label}</p>
      <h2 className="ss-title">{title}</h2>

      {(items?.length || question) && (
        <div className="ss-trail">
          {(items ?? []).map((t, i) => (
            <p className="ss-trail-line" key={i}>
              <RichLine text={t} />
            </p>
          ))}
          {question && (
            <p className="ss-trail-q">
              <RichLine text={question} />
            </p>
          )}
        </div>
      )}

      <div className="cube-wrap">
        <svg className="cube" viewBox="10 10 570 430" role="img" aria-label="长方体结构拆解">
          {/* 收拢时整个场景放大 1.45 倍；一展开就退回 1 倍，像是镜头拉远 */}
          <g className={exploded ? 'cube-scene out' : 'cube-scene'}>
            {/* 十二条棱；背面两条用虚线 */}
            <g className={exploded ? 'cube-edges dim' : 'cube-edges'}>
              {CUBE_EDGES.map(({ a, b, hidden }, i) => {
                const [x1, y1] = CUBE_VERTS[a]
                const [x2, y2] = CUBE_VERTS[b]
                return (
                  <line
                    key={i}
                    className={hidden ? 'is-hidden' : undefined}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                  />
                )
              })}
            </g>

            {/* 六个面：各自一个图层；散开后每个零件可点（岔路：只写 activePart） */}
            {CUBE_FACES.map((face, i) => (
              <polygon
                key={face.key}
                className={`cube-face${face.hidden ? ' hidden' : ''}${exploded ? ' out' : ''}${
                  exploded && activePart === i ? ' peak' : ''
                }`}
                points={face.points}
                style={{
                  transform: exploded
                    ? `translate(${face.dir[0]}px, ${face.dir[1]}px)`
                    : 'translate(0px, 0px)',
                }}
                onClick={exploded ? onPickPart(i) : undefined}
              />
            ))}

            {/* 展开后的名称标注 */}
            {CUBE_FACES.map((face) => (
              <text
                key={face.key}
                className={exploded ? 'cube-tag on' : 'cube-tag'}
                x={face.label[0]}
                y={face.label[1]}
                textAnchor="middle"
              >
                {face.name}
              </text>
            ))}

            {/* 被点零件旁边浮出的那行小字（noteShort ≤12 字，数据契约由 slides.ts 校验器把关）。
                加了 exploded 门槛：合拢后不再把零件说明压在立方体上成重影。 */}
            {exploded && activeFace && (
              <text
                className="cube-part-note"
                x={activeFace.label[0]}
                y={activeFace.label[1] + 22}
                textAnchor="middle"
              >
                {noteShorts[activePart] ?? activeFace.noteShort}
              </text>
            )}
          </g>
        </svg>

        <div className="cube-side">
          <div className="cube-count">
            <span>
              <b>6</b> 个面
            </span>
            <span>
              <b>12</b> 条棱
            </span>
            <span>
              <b>8</b> 个顶点
            </span>
          </div>
          <div className={exploded ? 'cube-notes on' : 'cube-notes'}>
            {CUBE_FACES.map((f) => (
              <p key={f.key} className="cube-note">
                <em>{f.name}</em>
                {f.note}
              </p>
            ))}
          </div>
        </div>
      </div>

      <p className="ss-hint">
        {exploded
          ? '六个面都摊开了——相对的两个面，形状完全一样。'
          : collapsedAgain
            ? '已经收回 · 再点一下进入下一页'
            : '点一下，六个面会散开；再点一下，收回原样。'}
      </p>

      {/* 右下角的拆开/合上：岔路唯一的按钮，中性纸墨，不占用那一支强调色 */}
      <button className="show-cta" onClick={onToggleOpen}>
        {opened ? '合上' : '拆开'}
      </button>
    </div>
  )
}