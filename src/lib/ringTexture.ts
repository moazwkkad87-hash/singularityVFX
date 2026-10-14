/* 1D ring density/tint profile with Cassini, Encke and Maxwell gaps */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three'
import { fbm1 } from './noise'

export function makeRingTexture() {
  const width = 4096
  const data = new Uint8Array(width * 4)
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  for (let i = 0; i < width; i++) {
    const x = (i + 0.5) / width
    const n = fbm1(x * 70, 7)
    const fine = fbm1(x * 260 + 9, 5)
    const ultra = fbm1(x * 1100 + 4, 3)
    let d = 0.25 + 0.75 * smooth(0.25, 0.75, n)
    d *= 0.72 + 0.2 * fine + 0.08 * ultra
    d *= smooth(0, 0.04, x) * (1 - smooth(0.95, 1, x))
    if (x < 0.22) d *= 0.22 // faint C ring
    d *= 1 - (1 - smooth(0, 0.012, Math.abs(x - 0.66))) * 0.96 // Cassini division
    d *= 1 - (1 - smooth(0, 0.004, Math.abs(x - 0.88))) * 0.8 // Encke gap
    d *= 1 - (1 - smooth(0, 0.0025, Math.abs(x - 0.31))) * 0.5 // Maxwell gap
    const tint = fbm1(x * 160 + 2, 4)
    data[i * 4] = Math.round(Math.min(1, Math.max(0, d)) * 255)
    data[i * 4 + 1] = Math.round(tint * 255)
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 255
  }
  const texture = new DataTexture(data, width, 1, RGBAFormat, UnsignedByteType)
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}
