import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AddEquation,
  AlwaysDepth,
  CustomBlending,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  NearestFilter,
  OneFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  WebGLRenderTarget,
  ZeroFactor,
} from 'three'
import { compositeBackFragment, compositeFrontFragment, fullscreenVertex, tracerFragment } from '../shaders/blackhole'
import { offscreenScenes } from '../ui/loadingStore'
import type { SceneTextures } from './textures'

type Props = {
  textures: SceneTextures
  /** tracer resolution relative to the drawing buffer */
  resolution: number
  /** maximum geodesic integration steps */
  maxSteps: number
}

/**
 * Gargantua: Schwarzschild ray tracer rendered at reduced resolution into a
 * 4-layer target, then composited at full resolution into the main scene:
 *   - back layer  (renderOrder -1000): sky + crisp stars + far disk images, writes hide depth
 *   - front layer (renderOrder 10000): the near disk, blended over anything behind it
 */
export function BlackHole({ textures, resolution, maxSteps }: Props) {
  const gl = useThree((s) => s.gl)

  const target = useMemo(() => {
    const rt = new WebGLRenderTarget(16, 16, {
      count: 4,
      type: HalfFloatType,
      depthBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    })
    // depth must not be interpolated across silhouettes
    rt.textures[3].minFilter = NearestFilter
    rt.textures[3].magFilter = NearestFilter
    return rt
  }, [])
  useEffect(() => () => target.dispose(), [target])

  const tracer = useMemo(() => {
    const disk = textures.disk
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: fullscreenVertex,
      fragmentShader: tracerFragment,
      uniforms: {
        uTime: { value: 0 },
        uCamWorld: { value: new Matrix4() },
        uInvProj: { value: new Matrix4() },
        uPixel: { value: 0.001 },
        uStepScale: { value: 1 },
        uMaxSteps: { value: 260 },
        uTexel: { value: new Vector2(0.01, 0.01) },
        uDisk: { value: disk },
        uDiskSize: { value: [(disk.image as HTMLImageElement)?.width ?? 4096, (disk.image as HTMLImageElement)?.height ?? 1024] },
      },
      depthTest: false,
      depthWrite: false,
    })
    const quad = new Mesh(new PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const scene = new Scene()
    scene.add(quad)
    return { scene, material, quad }
  }, [textures.disk])

  useEffect(() => {
    offscreenScenes.add(tracer.scene)
    return () => {
      offscreenScenes.delete(tracer.scene)
      tracer.material.dispose()
      tracer.quad.geometry.dispose()
    }
  }, [tracer])

  const compositeUniforms = useMemo(
    () => ({
      uBehind: { value: target.textures[0] },
      uDeflect: { value: target.textures[1] },
      uFront: { value: target.textures[2] },
      uDepth: { value: target.textures[3] },
      uSkyColor: { value: textures.skyColor },
      uSkyDust: { value: textures.skyDust },
      uProj: { value: new Matrix4() },
      uCamWorld: { value: new Matrix4() },
      uInvProj: { value: new Matrix4() },
      uPixel: { value: 0.001 },
    }),
    [target, textures.skyColor, textures.skyDust],
  )

  const size = useMemo(() => new Vector2(), [])

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera
    camera.updateMatrixWorld()

    gl.getDrawingBufferSize(size)
    const w = Math.max(1, Math.round(size.x * resolution))
    const h = Math.max(1, Math.round(size.y * resolution))
    if (target.width !== w || target.height !== h) target.setSize(w, h)

    const fov = (camera.fov * Math.PI) / 180
    const u = tracer.material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uInvProj.value.copy(camera.projectionMatrixInverse)
    u.uPixel.value = fov / h
    u.uMaxSteps.value = maxSteps
    u.uTexel.value.set(2 / w, 2 / h)
    // fewer steps -> proportionally longer steps so rays still reach the far side
    u.uStepScale.value = Math.min(1.8, Math.max(1, 260 / maxSteps))

    compositeUniforms.uProj.value.copy(camera.projectionMatrix)
    compositeUniforms.uCamWorld.value.copy(camera.matrixWorld)
    compositeUniforms.uInvProj.value.copy(camera.projectionMatrixInverse)
    compositeUniforms.uPixel.value = fov / size.y // stars at full resolution

    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.render(tracer.scene, camera)
    gl.setRenderTarget(previous)
  })

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1000}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={fullscreenVertex}
          fragmentShader={compositeBackFragment}
          uniforms={compositeUniforms}
          depthTest
          depthWrite
          depthFunc={AlwaysDepth}
          toneMapped={false}
        />
      </mesh>
      <mesh frustumCulled={false} renderOrder={10000}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={fullscreenVertex}
          fragmentShader={compositeFrontFragment}
          uniforms={compositeUniforms}
          transparent
          depthTest
          depthWrite={false}
          blending={CustomBlending}
          blendEquation={AddEquation}
          blendSrc={OneFactor}
          blendDst={SrcAlphaFactor}
          blendSrcAlpha={ZeroFactor}
          blendDstAlpha={OneFactor}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
