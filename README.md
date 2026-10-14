# Gargantua

A real-time, physically based Schwarzschild black hole with a lensed planetary
system, built with React Three Fiber.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

The build uses relative URLs (`base: './'`), so `dist/` works from any static
host or sub-folder.

## Project structure

```
public/textures/
  hd/  sd/              pre-baked WebP textures (sd = half size, used on phones)
src/
  main.tsx              entry: prefetches textures, mounts <App/>
  App.tsx               preloader + lazily loaded 3D experience
  config/
    constants.ts        physical constants, URL flags, device detection
    quality.ts          adaptive quality tiers
    textureList.ts      texture manifest (no three.js imports)
  shaders/
    common.ts           noise, blackbody, equirect helpers, vertex lensing
    blackhole.ts        geodesic ray tracer + composite passes
    planets.ts          runtime planet, ring and atmosphere shaders
    comet.ts            comet particle shaders
    bake.ts             bake-only shaders (never shipped to runtime GPU)
  scene/
    Experience.tsx      <Canvas>, staged startup, post-processing, quality
    BlackHole.tsx       tracer render target + compositing
    GasGiant.tsx  OceanWorld.tsx  BarrenWorld.tsx
    AsteroidBelt.tsx  Comet.tsx
    textures.ts         texture loading hook
  lib/                  CPU noise, ring profile, rock meshes, orbits
  ui/                   preloader + its loading store
  tools/bake.ts         texture bake tool (dev only, see below)
bake.html               bake tool page (served by the dev server only)
scripts/
  bake.mjs              headless bake -> public/textures
  bench.mjs             frame-time benchmark
```

## How it stays fast

- Pre-baked textures. The sky, the disk turbulence and all planet surfaces
  are rendered once offline (3.3 MB of WebP for the HD set), so startup does
  zero procedural work on the GPU.
- Staged startup. The preloader appears instantly while the 3D engine chunk
  downloads, then the textures load, upload to the GPU one per frame, and every
  shader compiles asynchronously (`compileAsync`) before the scene is revealed.
  No half-drawn frames.
- Decoupled ray tracing. The geodesic tracer runs at 50-75% resolution into a
  4-layer half-float target. The composite pass rebuilds each pixel's bent
  direction at full resolution, so stars stay pin-sharp.
- Adaptive anti-aliasing. Only rays skimming the photon sphere (the thin
  photon ring and shadow edge) get 4 samples.
- Ray tracing only where needed. Exact geodesics only inside 16.5 Rs; outside
  that, a closed-form weak-field solution. The step-loop bound is a uniform,
  which avoids slow loop unrolling on Windows/ANGLE.
- GPU-animated asteroids. About 6,000 instanced rocks orbit and tumble in the
  vertex shader, with no per-frame CPU work.
- Adaptive quality. Frame rate is monitored and the pixel ratio, MSAA, tracer
  resolution and step budget move up or down.

## URL flags

| Flag | Effect |
| --- | --- |
| `?textures=sd` / `?textures=hd` | force the light or full texture set |
| `?bench` | fixed quality tier, no auto-rotation |
| `?bench&trace=0.8` | override tracer resolution |
| `?bench&cam=x,y,z&target=x,y,z` | pin the camera |

## Re-baking textures

The bake shaders live in `src/shaders/bake.ts`. After editing them:

```bash
npx playwright install chromium   # once
npm run bake                      # all textures
npm run bake -- giant disk        # only some
```

Or run `npm run dev`, open `/bake.html` and click "Bake all" (files download as
`hd_*.webp` / `sd_*.webp`).
