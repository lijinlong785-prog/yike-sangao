import type { LessonPlan } from '../types'
import { guihuaYu } from './guihua'
import { biDaXiao } from './bidaxiao'
import { changFangTi } from './changfangti'
import { qiLvChangZheng } from './changzheng'
import { heTangYueSe } from './hetang'
import { chun } from './chun'
import { beiYing } from './beiying'
import { fenShu } from './fenshu'
import { yuanMianJi } from './yuanmianji'
import { caoChuanJieJian } from './caochuan'

export interface ExampleEntry {
  id: string
  label: string
  desc: string
  plan: LessonPlan
}

export const EXAMPLES: ExampleEntry[] = [
  {
    id: 'hetang',
    label: '荷塘月色',
    desc: '高中高一 · 语文 · 借景安放',
    plan: heTangYueSe,
  },
  {
    id: 'guihua',
    label: '桂花雨',
    desc: '小学五年级 · 语文 · 借物抒情',
    plan: guihuaYu,
  },
  {
    id: 'caochuan',
    label: '草船借箭',
    desc: '小学五年级 · 语文 · 神机妙算',
    plan: caoChuanJieJian,
  },
  {
    id: 'yuanmianji',
    label: '圆的面积',
    desc: '小学六年级 · 数学 · 剪拼转化',
    plan: yuanMianJi,
  },
  {
    id: 'changfangti',
    label: '长方体的认识',
    desc: '小学五年级 · 数学 · 空间观念',
    plan: changFangTi,
  },
  {
    id: 'beiying',
    label: '背影',
    desc: '初中八年级 · 语文 · 写背不写脸',
    plan: beiYing,
  },
  {
    id: 'changzheng',
    label: '七律·长征',
    desc: '小学六年级 · 语文 · 革命文化',
    plan: qiLvChangZheng,
  },
  {
    id: 'chun',
    label: '春',
    desc: '初中七年级 · 语文 · 一个动词',
    plan: chun,
  },
  {
    id: 'fenshu',
    label: '分数的初步认识',
    desc: '小学三年级 · 数学 · 平均分',
    plan: fenShu,
  },
  {
    id: 'bidaxiao',
    label: '比大小',
    desc: '小学一年级 · 数学 · 符号启蒙',
    plan: biDaXiao,
  },
]

/** 用户输入的课题正好是内置示例时，直接返回，省掉一次 API 调用 */
export function findExample(topic: string): ExampleEntry | undefined {
  const t = topic.trim()
  if (!t) return undefined
  return EXAMPLES.find(
    (e) => e.plan.meta.topic === t || e.plan.meta.topic === t.replace(/《|》/g, '')
  )
}
