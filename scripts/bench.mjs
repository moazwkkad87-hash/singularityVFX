/**
 * Frame-time benchmark (needs `npm run build && npm run preview` running).
 *
 *   node scripts/bench.mjs [port=4173] [width=1280] [height=720] [seconds=20]
 *
 * Set BENCH_SOFTWARE=1 to force the CPU renderer (SwiftShader) for
 * reproducible comparisons on machines without a GPU.
 */
import { chromium } from 'playwright'

const [, , port = '4173', w = '1280', h = '720', secs = '20'] = process.argv
const args =
  process.env.BENCH_SOFTWARE === '1'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--ignore-gpu-blocklist', '--enable-gpu']

const browser = await chromium.launch({ args })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const t0 = Date.now()
await page.goto(`http://localhost:${port}/?bench=1`)
await page.waitForFunction(() => !document.querySelector('.preloader'), null, { timeout: 600000 })
console.log('time to first reveal (ms)', Date.now() - t0)

const result = await page.evaluate(async (seconds) => {
  const times = []
  let last = performance.now()
  await new Promise((resolve) => {
    const end = last + seconds * 1000
    const tick = (t) => {
      times.push(t - last)
      last = t
      if (t < end) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  times.sort((a, b) => a - b)
  return { frames: times.length, medianMs: times[times.length >> 1], p90Ms: times[Math.floor(times.length * 0.9)] }
}, +secs)
console.log(JSON.stringify(result))
await browser.close()
