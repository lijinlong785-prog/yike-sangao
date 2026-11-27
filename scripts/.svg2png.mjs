import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
for (const f of process.argv.slice(2)) {
  const svg = readFileSync(f, 'utf8')
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1600 }, font: { loadSystemFonts: true, defaultFontFamily: 'Songti SC' } })
  const out = f.replace(/\.svg$/, '.png')
  writeFileSync(out, r.render().asPng())
  console.log('✓', out)
}
