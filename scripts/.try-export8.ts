/** 一次性：把凝练后的 /tmp/yalang8 导出成 pptx（零网络，复用已配好的插画） */
import fs from 'node:fs'
import type { StudentSlide } from '../src/lib/slides'
;(globalThis as unknown as { window: unknown }).window ??= globalThis
const { limitsFor, scaleOf } = await import('../src/lib/scale')
const { templateOf, defaultTemplateId } = await import('../src/lib/deck2/theme')
const { downloadTemplatedPptx } = await import('../src/lib/pptx')
const { validateSlides } = await import('../src/lib/slides')
const slides: StudentSlide[] = JSON.parse(fs.readFileSync('/tmp/yalang8/slides.json','utf8'))
const D = 2400
const limits = limitsFor('auto', scaleOf(D), D)
const check = validateSlides(slides, limits)
console.log('导出校验:', check.ok ? '✓ 过' : `✗ ${check.problems.slice(0,6).join('；')}`)
const tid = defaultTemplateId('语文','狼牙山五壮士','第一课时')
const template = templateOf(tid)
const file = '/tmp/yalang8/《狼牙山五壮士》-课件.pptx'
fs.rmSync(file, { force: true })
await downloadTemplatedPptx(slides, template, undefined, file, { animated: false, limits })
console.log(`✓ ${(fs.statSync(file).size/1024/1024).toFixed(2)}MB · 模板 ${template.name} → ${file}`)
