import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor, useProgress } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { HalfFloatType, NoToneMapping, SRGBColorSpace } from 'three'
import { BENCH, PARAMS } from '../config/constants'
import { QUALITY_TIERS, clampTier } from '../config/quality'
import { offscreenScenes, setLoading, useLoading } from '../ui/loadingStore'
import { autoStep, isQualityPanelOpen, setQualityFps, useQualitySettings } from '../ui/qualityStore'
import { AsteroidBelt } from './AsteroidBelt'
import { BarrenWorld } from './BarrenWorld'
import { BlackHole } from './BlackHole'
import { Comet } from './Comet'
import { GasGiant } from './GasGiant'
import { OceanWorld } from './OceanWorld'
import { setMaxAnisotropy, useSceneTextures } from './textures'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

// `?bench&cam=x,y,z&target=x,y,z` pins the camera (profiling / screenshots)
const vec3Param = (key: string) => {
  const v = BENCH ? PARAMS.get(key)?.split(',').map(Number) : undefined
  return v && v.length === 3 && v.every(Number.isFinite) ? (v as [number, number, number]) : undefined
}
const CAMERA_POSITION = vec3Param('cam') ?? [-6, 4.2, 44]
const CAMERA_TARGET = vec3Param('target') ?? [0, 0, 0]

/* ------------------------------------------------------------------ */
/*  Scene content (suspends until every texture is ready)              */
/* ------------------------------------------------------------------ */

function World({ onCompiled }: { onCompiled: () => void }) {
  const textures = useSceneTextures()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const setDpr = useThree((s) => s.setDpr)
  const { stage } = useLoading()
  const { mode, tierIndex, custom } = useQualitySettings()

  const maxDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const tiers = useMemo(() => QUALITY_TIERS.filter((t) => t.dpr <= Math.max(maxDpr, 1)), [maxDpr])
  const safeIndex = clampTier(Math.min(tierIndex, tiers.length - 1))
  const tier = tiers[safeIndex] ?? QUALITY_TIERS[0]
  const effective = custom ?? tier
  const trace = BENCH && PARAMS.has('trace') ? Number(PARAMS.get('trace')) : effective.trace

  useEffect(() => setDpr(effective.dpr), [effective.dpr, setDpr])

  // Compile every shader asynchronously (KHR_parallel_shader_compile) while the
  // preloader is still up, instead of stalling the first frames.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Upload textures to the GPU one per frame so the preloader keeps animating
      const list = Object.values(textures)
      for (let i = 0; i < list.length; i++) {
        if (cancelled) return
        gl.initTexture(list[i])
        setLoading({ stage: 'uploading', progress: 0.82 + 0.06 * ((i + 1) / list.length) })
        await nextFrame()
      }
      setLoading({ stage: 'compiling', progress: 0.88 })
      try {
        await gl.compileAsync(scene, camera)
        for (const s of offscreenScenes) await gl.compileAsync(s, camera)
      } catch {
        /* compileAsync unsupported: shaders compile on first render instead */
      }
      if (!cancelled) {
        setLoading({ stage: 'warming', progress: 0.95 })
        onCompiled()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera, onCompiled, textures])

  return (
    <>
      {stage === 'ready' && !BENCH && mode === 'auto' && !custom && (
        <PerformanceMonitor
          bounds={(refreshRate) => (refreshRate > 90 ? [70, 100] : [45, 58])}
          flipflops={4}
          onIncline={() => autoStep(1)}
          onDecline={() => autoStep(-1)}
          onFallback={() => autoStep('min')}
        />
      )}

      {/* The disk is the only real light source in this system */}
      <pointLight position={[0, 0, 0]} color="#ffd9b8" intensity={3.2} decay={0} />
      <ambientLight intensity={0.015} color="#8aa0ff" />

      <BlackHole textures={textures} resolution={trace} maxSteps={effective.steps} />
      <AsteroidBelt />
      <OceanWorld textures={textures} />
      <BarrenWorld textures={textures} />
      <GasGiant textures={textures} />

      <Comet semiMajor={46} eccentricity={0.82} inclination={0.35} node={0.6} period={140} phase={2.6} />
      <Comet semiMajor={62} eccentricity={0.88} inclination={-0.22} node={2.4} period={210} phase={5.4} />

      <OrbitControls
        target={CAMERA_TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.05}
        minDistance={6}
        maxDistance={260}
        rotateSpeed={0.45}
        zoomSpeed={0.6}
        autoRotate={!BENCH}
        autoRotateSpeed={0.12}
      />

      <EffectComposer multisampling={effective.msaa} frameBufferType={HalfFloatType}>
        <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1.1} luminanceSmoothing={0.3} radius={0.72} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Noise opacity={0.018} premultiply />
        <Vignette offset={0.3} darkness={0.65} />
      </EffectComposer>

      <WarmUp />
      <FpsSampler />
    </>
  )
}

/** Lets a few real frames render under the preloader before revealing. */
function WarmUp() {
  const frames = useRef(0)
  useFrame(() => {
    frames.current++
    if (frames.current === 3) setLoading({ stage: 'ready', progress: 1 })
  })
  return null
}

/** Smooth FPS sampler feeding the quality panel badge (2 Hz, zero scene cost). */
function FpsSampler() {
  const last = useRef(performance.now())
  const ema = useRef(0)
  const lastPush = useRef(0)
  useFrame(() => {
    const now = performance.now()
    const dt = now - last.current
    last.current = now
    if (dt <= 0 || dt > 1000) return
    // Skip all store work unless the panel is actually open — the pre-panel
    // build had zero per-frame JS here, so keep it that way by default.
    if (!isQualityPanelOpen()) {
      ema.current = 0
      return
    }
    const fps = 1000 / dt
    ema.current = ema.current === 0 ? fps : ema.current * 0.92 + fps * 0.08
    // 2 Hz badge refresh: setQualityFps itself also drops <1fps deltas, so
    // <World/> (subscribed to settings only) never re-renders from this.
    if (now - lastPush.current > 500) {
      lastPush.current = now
      setQualityFps(ema.current)
    }
  })
  return null
}

/** Mirrors the texture loader's progress into the preloader store. */
function ProgressBridge() {
  const { loaded, total } = useProgress()
  useEffect(() => {
    if (total > 0) setLoading({ stage: 'textures', progress: 0.1 + 0.72 * (loaded / total) })
  }, [loaded, total])
  return null
}

/* ------------------------------------------------------------------ */
/*  Canvas                                                             */
/* ------------------------------------------------------------------ */

export default function Experience() {
  const [frameloop, setFrameloop] = useState<'never' | 'always'>('never')
  const onCompiled = useMemo(() => () => setFrameloop('always'), [])

  return (
    <>
      <ProgressBridge />
      <Canvas
        frameloop={frameloop}
        dpr={1}
        camera={{ position: CAMERA_POSITION, fov: 38, near: 0.05, far: 4000 }}
        gl={{
          antialias: false, // MSAA is handled by the composer, per quality tier
          powerPreference: 'high-performance',
          toneMapping: NoToneMapping,
          outputColorSpace: SRGBColorSpace,
          stencil: false,
        }}
        onCreated={({ gl }) => {
          setMaxAnisotropy(gl)
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            setLoading({ stage: 'error', error: 'The graphics driver reset. Reload the page to restart the scene.' })
          })
        }}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' }}
      >
        <Suspense fallback={null}>
          <World onCompiled={onCompiled} />
        </Suspense>
      </Canvas>
    </>
  )
}
