/* Procedural asteroid shapes: fBm-displaced, stretched icosahedra with impact dents */
import { BufferGeometry, IcosahedronGeometry, Vector3 } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash3, noise3 } from './noise'

export function makeRockGeometry(seed: number, detail: number) {
  let geometry: BufferGeometry = new IcosahedronGeometry(1, detail)
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  geometry = mergeVertices(geometry) // indexed -> smooth normals, fewer vertices
  const position = geometry.getAttribute('position')
  const p = new Vector3()
  const stretch = new Vector3(
    0.7 + hash3(seed, 1, 2) * 0.6,
    0.55 + hash3(seed, 3, 4) * 0.4,
    0.8 + hash3(seed, 5, 6) * 0.7,
  )
  const dents = Array.from({ length: 4 }, (_, k) =>
    new Vector3(hash3(seed, k, 9) - 0.5, hash3(seed, 9, k) - 0.5, hash3(k, seed, 9) - 0.5).normalize(),
  )
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize()
    let n = 0
    let amp = 0.5
    let f = 1.3
    for (let o = 0; o < 6; o++) {
      n += amp * (noise3(p.x * f + seed, p.y * f + seed * 2, p.z * f - seed) - 0.5)
      amp *= 0.5
      f *= 2.1
    }
    let dent = 0
    for (let k = 0; k < dents.length; k++) {
      const d = Math.max(0, 1 - p.distanceTo(dents[k]) * (2 + k))
      dent += d * d * (0.25 / (k + 1))
    }
    const r = 1 + n * 0.9 - dent
    p.multiplyScalar(r).multiply(stretch)
    position.setXYZ(i, p.x, p.y, p.z)
  }
  geometry.computeVertexNormals()
  return geometry
}
