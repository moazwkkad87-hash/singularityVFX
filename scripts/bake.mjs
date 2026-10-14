/**
 * Headless texture bake: starts Vite, opens bake.html in Chromium and writes
 * the WebP files into public/textures/{hd,sd}.
 *
 *   npm run bake                    # all textures (uses your GPU if available)
 *   npm run bake -- giant disk      # only some
 *
 * Requires the optional dev dependency `playwright` (npx playwright install chromium).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.slice(2)
const software = process.env.BAKE_SOFTWARE === '1'

const server = await createServer({ root, server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()

const args = software
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--ignore-gpu-blocklist', '--enable-gpu']
const browser = await chromium.launch({ args })
const page = await browser.newPage()
page.on('console', (m) => console.log(m.text()))
await page.exposeFunction('__save', async (name, dataUrl) => {
  const file = resolve(root, 'public/textures', name + '.webp')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
})
await page.goto('http://localhost:5199/bake.html')
await page.evaluate((list) => window.__bakeAll(list.length ? list : undefined), only)
await browser.close()
await server.close()
