import { limitsFor } from '../src/lib/scale'
import { lessonSlides } from '../src/lib/slides'
import { guihuaYu } from '../src/data/guihua'
import { planForScale } from '../src/data/lesson'
const lim = limitsFor('standard', 'lesson', 2400)
const plan = planForScale(guihuaYu, 2400)
console.log('segments', plan.segments.length, 'lim', lim.pagesMin, lim.pagesMax)
const pages = lessonSlides(plan, lim)
console.log('pages', pages.length)
pages.forEach((s, i) => console.log(`${i+1}. [${s.kind}] ${JSON.stringify(s.title)} line=${JSON.stringify(s.line??'')} items=${JSON.stringify(s.items??[])}`))
