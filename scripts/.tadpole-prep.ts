import { readFileSync, writeFileSync } from 'node:fs'
import { decodePng, encodePng } from '../src/lib/watermark'
const SRC: Record<string, string> = {
  cover: '/Users/rui/.qoder-cn/vibe_images/tadpole-cover_1795325609.png',
  tadpoles: '/Users/rui/.qoder-cn/vibe_images/tadpole-tadpoles_1795325603.png',
  duck: '/Users/rui/.qoder-cn/vibe_images/tadpole-duck_1795325636.png',
  goldfish: '/Users/rui/.qoder-cn/vibe_images/tadpole-goldfish_1795325603.png',
  crab: '/Users/rui/.qoder-cn/vibe_images/tadpole-crab_1795325636.png',
  turtle: '/Users/rui/.qoder-cn/vibe_images/tadpole-turtle_1795325635.png',
  frog: '/Users/rui/.qoder-cn/vibe_images/tadpole-frog_1795325658.png',
  ending: '/Users/rui/.qoder-cn/vibe_images/tadpole-ending_1795325664.png',
  metamorphosis: '/Users/rui/.qoder-cn/vibe_images/tadpole-metamorphosis_1795325919.png',
  carp: '/Users/rui/.qoder-cn/vibe_images/tadpole-carp_1795326123.png',
}
// 水印在右下角最底下一行：裁掉底部 8%，不留补丁死块、不伤主体
const KEEP = 0.92
for (const [name, path] of Object.entries(SRC)) {
  const img = await decodePng(new Uint8Array(readFileSync(path)))
  if (!img) { console.log('decode fail', name); continue }
  const newH = Math.floor(img.height * KEEP)
  const pixels = img.pixels.slice(0, newH * img.width * 4)
  const out = await encodePng({ width: img.width, height: newH, pixels })
  writeFileSync(`.tadpole/${name}.png`, Buffer.from(out))
  console.log('crop', name, img.width, img.height, '->', img.width, newH)
}
