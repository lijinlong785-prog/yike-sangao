/**
 * 学生版数据层对账（TASKS/07 §4.3 / 验收第 1、2、4、5、7、8 条）。
 *
 * 只看纯数据，不生成任何文件：页数三列对账（课件 / 演示 / 导出）、每页正文不超该例生效档的上限
 * （按档取值，唯一真源 src/lib/density.ts）、每页含问句、页面禁词零命中、备注非空、无 Key 路径不发请求。
 * 真出片与 .pptx 内部的字号取证在 check-pptx.ts，那一份才碰磁盘与 unzip。
 * 两者的判断标准都取自 scripts/check-lib.ts，不各写一套。
 *
 * 跑法（esbuild 打包成一次性脚本，pptxgenjs 留作 external 不实际加载）：
 *   npm run check:slides
 */
import { CASES, checkNoKeyDeterminism, collectDataChecks, collectDensityChecks, collectInteractionChecks, collectThemeChecks } from './check-lib'

const { reports, failures } = collectDataChecks()

for (const r of reports) {
  console.log(
    `${r.name.padEnd(16)} 课件 ${String(r.deckPages).padStart(2)} 页 | ` +
      `演示 ${String(r.demoPages).padStart(2)} 页 | pptx ${String(r.pptxPages).padStart(2)} 页 | ` +
      `slides.length ${String(r.slidePages).padStart(2)} | ${r.ok ? '一致 ✓' : '分叉 ✗'} | ` +
      `正文最长 ${r.longestBody}/${r.bodyCap} 字（第 ${r.longestBodyPage} 页，${r.bodyCapTier} 档上限）| ` +
      `缺问句 ${r.missingQuestion} | 空备注 ${r.emptyNotes} | 禁词 ${r.forbiddenHits.length}`
  )
  console.log('  ' + r.sceneLine)
  if (r.problems.length) console.log('  不合格：' + r.problems.join(' / '))
  if (r.warnings.length) console.log('  警告：' + r.warnings.join(' / '))
}

const noKey = await checkNoKeyDeterminism()
console.log('\n-- 无 Key 确定性（fetch 打桩成不可达，验代理挂了也不影响交付）--')
for (const line of noKey.lines) console.log('  ' + line)
failures.push(...noKey.failures)

const caseCount = CASES.length
console.log(
  `\n${failures.length === 0 ? `✓ ${caseCount} 例数据层全部通过（页数在 10–14 且三列一致、正文不超当前档上限、含问句、无禁词、备注非空、网络不可达时仍合格）` : ''}`
)

// 纸面方案（TASKS/09 第 9 件）：判定标准与 check-pptx.ts 共用 check-lib 那一份
const theme = collectThemeChecks()
console.log('\n-- 纸面方案（明度/彩度/对比度/色差四条硬约束 + 学科红线 + 洗数据）--')
for (const line of theme.lines) console.log('  ' + line)
failures.push(...theme.failures)
if (theme.failures.length) console.log(`  ✗ 纸面 ${theme.failures.length} 处不合格`)

// 三页真交互（TASKS/08 §A.4）：键盘主线快照 + 交互页分布 + 浮出文本字数 + 反向用例
const inter = collectInteractionChecks()
console.log('\n-- 交互纯函数（主线快照 / 交互页分布 / 浮出文本 ≤12・≤20 / 跳站与提示状态机）--')
for (const line of inter.lines) console.log('  ' + line)
failures.push(...inter.failures)
if (inter.failures.length) console.log(`  ✗ 交互 ${inter.failures.length} 处不合格`)

// 三档密度（TASKS/08 §B）：字数/items/页数上限、字词页恒 ≤4、默认档 standard、页数区间 10–14、
// 档位指纹进缓存钥匙（§B 补漏：切档必须重算，不然验收 1 在旧 plan 上复现不出来）
const density = collectDensityChecks()
console.log('\n-- 三档密度（lean/standard/rich 上限 / 默认档 / 字词页恒 ≤4 / 页数区间 / limitsOf / validate 边界 / 档位指纹进钥匙）--')
for (const line of density.lines) console.log('  ' + line)
failures.push(...density.failures)
if (density.failures.length) console.log(`  ✗ 密度 ${density.failures.length} 处不合格`)
if (failures.length) {
  console.error(`✗ 数据层 ${failures.length} 处不合格：`)
  failures.forEach((f) => console.error('  - ' + f))
  process.exit(1)
}
