import { GUIHUA_STUDENT_SLIDES } from '../src/data/guihua'
import { BIDAXIAO_STUDENT_SLIDES } from '../src/data/bidaxiao'
import { CHANGFANGTI_STUDENT_SLIDES } from '../src/data/changfangti'
import { CHANGZHENG_STUDENT_SLIDES } from '../src/data/changzheng'
import { BEIYING_STUDENT_SLIDES } from '../src/data/beiying'
import { CHUN_STUDENT_SLIDES } from '../src/data/chun'
import { HETANG_STUDENT_SLIDES } from '../src/data/hetang'
import { YUANMIANJI_STUDENT_SLIDES } from '../src/data/yuanmianji'
import { FENSHU_STUDENT_SLIDES } from '../src/data/fenshu'
import { materialProblems } from '../src/lib/slides'
const sets: [string, any[]][] = [
  ['桂花雨', GUIHUA_STUDENT_SLIDES],
  ['比大小', BIDAXIAO_STUDENT_SLIDES],
  ['长方体', CHANGFANGTI_STUDENT_SLIDES],
  ['长征', CHANGZHENG_STUDENT_SLIDES],
  ['背影', BEIYING_STUDENT_SLIDES],
  ['春', CHUN_STUDENT_SLIDES],
  ['荷塘', HETANG_STUDENT_SLIDES],
  ['原面积', YUANMIANJI_STUDENT_SLIDES],
  ['分数', FENSHU_STUDENT_SLIDES],
]
for (const [name, slides] of sets) {
  const probs = materialProblems(slides)
  console.log(`${name}: ${probs.length === 0 ? 'PASS' : probs.length + ' 问题'}`)
  probs.forEach(p => console.log('  ' + p))
  const badPages = new Set(probs.map(p => Number(/第 (\d+) 页/.exec(p)?.[1] ?? 0)))
  for (const n of badPages) {
    const s = slides[n - 1]
    if (!s) continue
    console.log(`    P${n} [${s.kind}] ${s.title} | line=${s.line ?? ''} | items=${JSON.stringify(s.items ?? [])}`)
  }
}