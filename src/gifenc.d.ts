/**
 * gifenc 没有自带类型（v1.0.3）。只声明这一份场景库真正用到的 API，
 * 字段名与 node_modules/gifenc/README.md 的 writeFrame 选项一一对应。
 */
declare module 'gifenc' {
  export interface WriteFrameOptions {
    palette?: number[][]
    first?: boolean
    transparent?: boolean
    transparentIndex?: number
    delay?: number
    repeat?: number
    dispose?: number
  }

  export interface GifStream {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void
    writeHeader(): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifStream
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors: number, opts?: unknown): number[][]
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: number[][], format?: string): Uint8Array
}

/** scene.ts 实际引的是 ESM 产物（包的 main 是 CJS），类型与上面同源 */
declare module 'gifenc/dist/gifenc.esm.js' {
  export * from 'gifenc'
}