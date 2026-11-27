import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
const zip = await JSZip.loadAsync(readFileSync('《小蝌蚪找妈妈》-课件.pptx'))
const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a,b)=>parseInt(a.match(/slide(\d+)/)[1])-parseInt(b.match(/slide(\d+)/)[1]))
console.log('slides:', names.length)
const expect = [
  ['小蝌蚪找妈妈','部编版 · 二年级上册 · 第 1 课'],
  ['池塘里有一群小蝌蚪','大大的脑袋','黑灰色的身子','长长的尾巴','快活地游来游去'],
  ['找妈妈路线图','鲤鱼阿姨','乌龟','青蛙妈妈','长出了两条后腿','长出了两条前腿','尾巴变短了'],
  ['迎上去','鲤鱼阿姨，我们的妈妈在哪里？','你们的妈妈四条腿，宽嘴巴。你们到那边去找吧！'],
  ['追上去','妈妈，妈妈！','我不是你们的妈妈。你们的妈妈头顶上有两只大眼睛，披着绿衣裳。你们到那边去找吧！'],
  ['游过去','好孩子，你们已经长成青蛙了，快跳上来吧！','披着','雪白的肚皮','后腿一蹬，向前一跳，蹦到了荷叶上。'],
  ['小蝌蚪变青蛙','长后腿','长前腿','尾巴变短','尾巴不见了'],
  ['不知什么时候，小青蛙的尾巴已经不见了。他们跟着妈妈，天天去捉害虫。','保护青蛙'],
  ['生字乐园','liǎng','kuān','tiào','宽嘴巴','跳上来'],
  ['迎上去','追上去','游过去','面对面游过去','从后面赶上去'],
  ['池塘里的邻居','鸭妈妈','金鱼','螃蟹','不是妈妈'],
  ['想一想，说一说','小蝌蚪为什么会把乌龟当成妈妈？','谢谢观看'],
]
let bad = 0
for (let i=0;i<names.length;i++){
  const xml = await zip.file(names[i]).async('string')
  const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]).join('|')
  const imgs = (xml.match(/<a:blip /g)||[]).length
  const rels = await zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`).async('string')
  const media = [...rels.matchAll(/media\/([^"]+)/g)].map(m=>m[1])
  const notes = zip.file(`ppt/notesSlides/notesSlide${i+1}.xml`) ? 1 : 0
  const miss = (expect[i]||[]).filter(k=>!texts.includes(k))
  if (miss.length) { bad++; console.log(`P${i+1} MISS:`, miss.join(' / ')) }
  console.log(`P${i+1} imgs=${imgs} notes=${notes} chars=${texts.length} media=${media.join(',')}`)
}
// 全文禁词：不得出现旧版错序动物对话、AI 水印字样
const all = (await Promise.all(names.map(n=>zip.file(n).async('string')))).join('')
for (const w of ['鸭妈妈说','金鱼说','螃蟹说','AI 生成','环节','说课']) if (all.includes(w)) { bad++; console.log('FORBIDDEN:', w) }
console.log(bad ? `FAIL ${bad}` : 'ALL PASS')
