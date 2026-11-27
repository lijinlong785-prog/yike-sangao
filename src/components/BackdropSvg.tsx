/**
 * 底景的网页那一层（TASKS 10 §九）。
 *
 * 三个渲染器共用 backdrop.ts 里那一份归一化形状表：
 *   · 导出的 .pptx —— pptx 原生形状（x×W、y×H）
 *   · 网页演示 / PPT 预览 —— 这里的 SVG（x×100、y×100）
 * 颜色全部出自同一个 shapeColor()，「预览看到的就是导出的」靠这条保证，
 * 谁都不在组件里另算一遍。
 *
 * viewBox 定死 100×100 且 preserveAspectRatio="none"：横纵各自铺满，
 * 与 pptx 里「归一化值 × 页宽 / 页高」是同一种拉伸，不会多出等比留白。
 * 三角形按 pptx triangle 的语义画：顶点在上、底边在下。
 */
import { backdropShapes, type Backdrop } from '../lib/backdrop'

interface Props {
  bg: Backdrop
  /** 这一页实际的纸色（封面纸或主纸），与页面底色同一个值 */
  paper: string
  ink: string
  accent: string
}

export default function BackdropSvg({ bg, paper, ink, accent }: Props) {
  return (
    <svg className="bd-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {backdropShapes(bg, paper, ink, accent).map((s, i) =>
        s.k === 'tri' ? (
          <polygon
            key={i}
            points={`${s.x + s.w / 2},${s.y} ${s.x + s.w},${s.y + s.h} ${s.x},${s.y + s.h}`}
            fill={s.color}
          />
        ) : s.k === 'ellipse' ? (
          <ellipse key={i} cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} fill={s.color} />
        ) : (
          <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.color} />
        )
      )}
    </svg>
  )
}
