/**
 * 演示模式的动效数据。图层与路径必须手工定义——这是 04 任务书的硬要求，
 * 不依赖任何模型生成。
 */

/* ---------- 模板 B：长方体的六个面、十二条棱 ---------- */

export interface CubeFace {
  key: string
  name: string
  points: string
  /** 展开方向（屏幕坐标，单位 px）。偏移量按“拆解图”排布算好，保证六个面散开后互不遮挡 */
  dir: [number, number]
  /** 展开后标注的坐标（基线居中） */
  label: [number, number]
  note: string
  /**
   * 零件被点中后浮出的那一行短标签（TASKS/08 §A.2①）：≤12 字（含标点），
   * 人话，不碰 voice.ts 的四类句式与禁词；长 note 保留给右列注释区，两边各用各的。
   */
  noteShort: string
  /** 背面用虚线，视觉上不抢 */
  hidden?: boolean
}

export const CUBE_FACES: CubeFace[] = [
  {
    key: 'front',
    name: '前面',
    points: '170,200 290,200 290,320 170,320',
    dir: [50, 80],
    label: [280, 272],
    note: '正对着你的这一个面，长 5 厘米、宽 3 厘米。',
    noteShort: '前面：长5宽3的面',
  },
  {
    key: 'top',
    name: '上面',
    points: '170,200 290,200 350,160 230,160',
    dir: [20, -70],
    label: [280, 82],
    note: '上面和下面完全一样，都是长 × 宽。',
    noteShort: '上面：和下面一样大',
  },
  {
    key: 'right',
    name: '右面',
    points: '290,200 290,320 350,280 350,160',
    dir: [140, -120],
    label: [460, 32],
    note: '右面和左面完全一样，都是宽 × 高。',
    noteShort: '右面：和左面一样大',
  },
  {
    key: 'left',
    name: '左面',
    points: '170,200 170,320 230,280 230,160',
    dir: [-100, 100],
    label: [100, 252],
    note: '左面被挡住了，它其实和右面一模一样。',
    noteShort: '左面：被挡住的这个',
    hidden: true,
  },
  {
    key: 'bottom',
    name: '下面',
    points: '170,320 290,320 350,280 230,280',
    dir: [200, 40],
    label: [460, 312],
    note: '下面看不见，但它和上面完全相同。',
    noteShort: '下面：和上面一样大',
    hidden: true,
  },
  {
    key: 'back',
    name: '后面',
    points: '230,160 350,160 350,280 230,280',
    dir: [-190, -110],
    label: [100, 42],
    note: '后面和前面完全相同，一共三组相对的面。',
    noteShort: '后面：和前面一样大',
    hidden: true,
  },
]

export const CUBE_VERTS: Record<string, [number, number]> = {
  V1: [170, 200],
  V2: [290, 200],
  V3: [290, 320],
  V4: [170, 320],
  V5: [230, 160],
  V6: [350, 160],
  V7: [350, 280],
  V8: [230, 280],
}

export const CUBE_EDGES: { a: string; b: string; hidden?: boolean }[] = [
  { a: 'V1', b: 'V2' },
  { a: 'V2', b: 'V3' },
  { a: 'V3', b: 'V4' },
  { a: 'V4', b: 'V1' },
  { a: 'V5', b: 'V6' },
  { a: 'V6', b: 'V7' },
  { a: 'V7', b: 'V8', hidden: true },
  { a: 'V8', b: 'V5', hidden: true },
  { a: 'V1', b: 'V5' },
  { a: 'V2', b: 'V6' },
  { a: 'V3', b: 'V7' },
  { a: 'V4', b: 'V8' },
]

/* ---------- 模板 C：路径生长 ---------- */

export interface TrackNode {
  label: string
  caption: string
  x: number
  y: number
  /** 标注相对节点的纵向偏移，默认在点上方；相邻站点错开，名字才不打架 */
  dy?: number
}

export interface Track {
  id: string
  /** SVG 路径，viewBox 640×340 */
  d: string
  nodes: TrackNode[]
}

/** 《七律·长征》：九站，一条自南向北的长线 */
export const CHANGZHENG_TRACK: Track = {
  id: 'changzheng',
  d: 'M 60 300 C 95 295 95 285 120 280 C 155 273 155 258 185 250 C 220 242 220 226 250 214 C 285 202 285 194 315 184 C 350 174 350 160 380 150 C 415 140 415 132 445 125 C 480 118 480 103 510 95 C 545 87 560 72 600 65',
  nodes: [
    { label: '瑞金出发', caption: '1934 年 10 月，中央红军从瑞金出发，长征开始。', x: 60, y: 300, dy: -16 },
    { label: '湘江血战', caption: '突破第四道封锁线，红军从八万六千人减到三万余人。', x: 120, y: 280, dy: 26 },
    { label: '遵义会议', caption: '1935 年 1 月，确立毛泽东的领导地位，是生死攸关的转折点。', x: 185, y: 250, dy: -16 },
    { label: '四渡赤水', caption: '在川黔滇边界四次渡河，把几十万敌军甩在身后。', x: 250, y: 214, dy: 26 },
    { label: '巧渡金沙江', caption: '跳出敌人包围圈，取得战略转移中的决定性胜利。', x: 315, y: 184, dy: -16 },
    { label: '飞夺泸定桥', caption: '二十二名勇士攀着铁索冲过大渡河，打开了北上通道。', x: 380, y: 150, dy: 26 },
    { label: '翻越雪山', caption: '夹金山海拔四千多米，空气稀薄，许多战士再没站起来。', x: 445, y: 125, dy: -16 },
    { label: '穿过草地', caption: '茫茫沼泽，没有粮食，是长征中最艰苦的一段路。', x: 510, y: 95, dy: 26 },
    { label: '吴起镇会师', caption: '1935 年 10 月，中央红军到达陕北，行程二万五千里。', x: 600, y: 65, dy: -16 },
  ],
}

/** 《桂花雨》：三件事一条线 */
export const GUIHUA_TRACK: Track = {
  id: 'guihua',
  d: 'M 70 250 C 170 250 200 150 300 150 C 400 150 430 250 560 250',
  nodes: [
    { label: '爱桂花', caption: '“桂花一开，母亲就开始担心”——写的是香，立的是情。', x: 70, y: 250 },
    { label: '摇桂花', caption: '“抱、摇、喊”三个动作，写出了童年最快乐的一刻。', x: 300, y: 150 },
    { label: '念桂花', caption: '“这里的桂花再香，也比不上家乡院子里的桂花”——比的是故乡。', x: 560, y: 250 },
  ],
}

export type TemplateId = 'A' | 'B' | 'C'

/** 按课题挑动效模板：数学几何走 B，叙事类课文走 A + C，其余默认 A */
export function pickTrack(topic: string): Track | null {
  if (/长征/.test(topic)) return CHANGZHENG_TRACK
  if (/桂花/.test(topic)) return GUIHUA_TRACK
  return null
}

export function hasCube(topic: string): boolean {
  return /长方体|正方体|立方体|面的认识/.test(topic)
}