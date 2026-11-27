import fs from 'node:fs'
import { condenseSlides, type StudentSlide } from '../src/lib/slides'
import { place } from '../src/lib/deck2/place'
import { FAMILY_REPS, TEMPLATES } from '../src/lib/deck2/theme'
const raw = JSON.parse(fs.readFileSync('/tmp/yalang7/slides.json','utf8'))
const slides: StudentSlide[] = Array.isArray(raw)?raw:raw.slides
const out = condenseSlides(slides)
console.log(`${slides.length} 页 → ${out.length} 页`)
const kept = new Set(out.map(s=>s.title+'|'+(s.text??'')))
slides.forEach((s,i)=>{ if(!kept.has(s.title+'|'+(s.text??''))) console.log(`  删/并 p${i+1} [${s.kind}] ${s.title}`) })
const again = condenseSlides(out)
console.log('幂等:', again.length===out.length && JSON.stringify(again)===JSON.stringify(out) ? '✓' : '✗')
fs.mkdirSync('/tmp/yalang8',{recursive:true})
fs.writeFileSync('/tmp/yalang8/slides.json', JSON.stringify(out,null,1))
// 大块检查
const tpl = TEMPLATES[FAMILY_REPS.lindi]
let emptyBig=0
out.forEach((s,i)=>{
  const s2 = s // 无图无pull
  const o=place(s2,tpl)
  const big=o.filter(p=>p.kind==='rect'&&p.w*p.h>0.08)
  const texts=o.filter(p=>p.kind==='text'&&p.text)
  for(const r of big){
    const onTop=texts.some(t=>{const w=Math.min(t.x+t.w,r.x+r.w)-Math.max(t.x,r.x);const h=Math.min(t.y+t.h,r.y+r.h)-Math.max(t.y,r.y);return w>0&&h>0&&w*h>0.004})
    if(!onTop && !s.illustration){ emptyBig++; console.log(`  仍空 p${i+1} [${s.kind}] ${s.title} ${(r.w*r.h*100).toFixed(0)}%`) }
  }
})
console.log('无图页空大块:', emptyBig)
out.forEach((s,i)=>console.log(`p${String(i+1).padStart(2,'0')} [${s.kind}] ${s.title} | items=${(s.items??[]).length} 图${s.illustration?'有':'无'}`))
