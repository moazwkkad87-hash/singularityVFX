/**
 * Texture bake tool (development only).
 *
 *   npm run dev  ->  open http://localhost:5173/bake.html  ->  "Bake all"
 *
 * Renders every procedural texture on the GPU in tiles, then encodes HD and
 * SD (half-size) WebP files. In a normal browser they are downloaded; the
 * headless script (scripts/bake.mjs) receives them through window.__save and
 * writes them straight into public/textures.
 */
import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
  type IUniform,
} from 'three'
import { bakeVertex, diskBakeFragment, gasGiantBake, oceanBake, rockyBake, skyBakeFragment } from '../shaders/bake'

type Spec = {
  name: string
  fragment: string
  width: number
  height: number
  uniforms?: Record<string, IUniform>
  quality?: number
}

const rocky = (seed: number, a: Color, b: Color, pass: number) => ({
  uSeed: { value: seed },
  uPass: { value: pass },
  uAlbedoA: { value: a },
  uAlbedoB: { value: b },
})
const BARREN_A = new Color(0.16, 0.12, 0.1)
const BARREN_B = new Color(0.42, 0.32, 0.25)
const MOON_A = new Color(0.3, 0.3, 0.31)
const MOON_B = new Color(0.58, 0.58, 0.6)

export const SPECS: Spec[] = [
  { name: 'moon_albedo', fragment: rockyBake, width: 1024, height: 512, uniforms: rocky(3.7, MOON_A, MOON_B, 0) },
  { name: 'moon_normal', fragment: rockyBake, width: 1024, height: 512, uniforms: rocky(3.7, MOON_A, MOON_B, 1), quality: 0.95 },
  { name: 'barren_albedo', fragment: rockyBake, width: 2048, height: 1024, uniforms: rocky(11.3, BARREN_A, BARREN_B, 0) },
  { name: 'barren_normal', fragment: rockyBake, width: 2048, height: 1024, uniforms: rocky(11.3, BARREN_A, BARREN_B, 1), quality: 0.95 },
  { name: 'disk', fragment: diskBakeFragment, width: 4096, height: 1024 },
  { name: 'giant', fragment: gasGiantBake, width: 4096, height: 2048 },
  { name: 'ocean_albedo', fragment: oceanBake, width: 4096, height: 2048, uniforms: { uPass: { value: 0 } } },
  { name: 'ocean_normal', fragment: oceanBake, width: 4096, height: 2048, uniforms: { uPass: { value: 1 } }, quality: 0.95 },
  { name: 'ocean_clouds', fragment: oceanBake, width: 4096, height: 2048, uniforms: { uPass: { value: 2 } } },
  { name: 'ocean_water', fragment: oceanBake, width: 2048, height: 1024, uniforms: { uPass: { value: 3 } } },
  { name: 'sky_dust', fragment: skyBakeFragment, width: 2048, height: 1024, uniforms: { uPass: { value: 1 } } },
  { name: 'sky_color', fragment: skyBakeFragment, width: 4096, height: 2048, uniforms: { uPass: { value: 0 } } },
]

const TILE = 512

declare global {
  interface Window {
    __save?: (name: string, dataUrl: string) => Promise<void>
    __bakeAll?: (only?: string[]) => Promise<void>
    __bakeLog?: string[]
  }
}

const log = (msg: string) => {
  ;(window.__bakeLog ??= []).push(msg)
  const el = document.getElementById('log')
  if (el) el.textContent += msg + '\n'
  console.log(msg)
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

function toBlobUrl(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<string>((resolve) => {
    canvas.toBlob(
      (blob) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob!)
      },
      'image/webp',
      quality,
    )
  })
}

async function emit(name: string, dataUrl: string) {
  if (window.__save) return window.__save(name, dataUrl)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name.replace('/', '_') + '.webp'
  a.click()
}

async function bakeOne(renderer: WebGLRenderer, spec: Spec) {
  const { width, height } = spec
  const target = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false })
  const material = new ShaderMaterial({
    vertexShader: bakeVertex,
    fragmentShader: spec.fragment,
    uniforms: spec.uniforms ?? {},
    depthTest: false,
    depthWrite: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  const camera = new OrthographicCamera()

  renderer.setRenderTarget(target)
  target.scissorTest = true
  for (let y = 0; y < height; y += TILE) {
    for (let x = 0; x < width; x += TILE) {
      const w = Math.min(TILE, width - x)
      const h = Math.min(TILE, height - y)
      target.viewport.set(0, 0, width, height)
      target.scissor.set(x, y, w, h)
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      await frame()
    }
  }

  const pixels = new Uint8Array(width * height * 4)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
  renderer.setRenderTarget(null)
  target.dispose()
  material.dispose()
  quad.geometry.dispose()

  // GL rows are bottom-up; images are top-down (TextureLoader flips them back)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(width, height)
  const row = width * 4
  for (let j = 0; j < height; j++) {
    image.data.set(pixels.subarray((height - 1 - j) * row, (height - j) * row), j * row)
  }
  ctx.putImageData(image, 0, 0)

  const quality = spec.quality ?? 0.92
  await emit(`hd/${spec.name}`, await toBlobUrl(canvas, quality))

  const half = document.createElement('canvas')
  half.width = width / 2
  half.height = height / 2
  const hctx = half.getContext('2d')!
  hctx.imageSmoothingEnabled = true
  hctx.imageSmoothingQuality = 'high'
  hctx.drawImage(canvas, 0, 0, half.width, half.height)
  await emit(`sd/${spec.name}`, await toBlobUrl(half, quality))
}

async function bakeAll(only?: string[]) {
  const renderer = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: false })
  renderer.setSize(64, 64, false)
  for (const spec of SPECS) {
    if (only && !only.includes(spec.name)) continue
    const t0 = performance.now()
    await bakeOne(renderer, spec)
    log(`${spec.name} ${spec.width}x${spec.height} ${((performance.now() - t0) / 1000).toFixed(1)}s`)
  }
  renderer.dispose()
  log('done')
}

window.__bakeAll = bakeAll
document.getElementById('bake')?.addEventListener('click', () => bakeAll())
