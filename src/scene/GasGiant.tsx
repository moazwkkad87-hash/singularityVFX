import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Group, Mesh, Vector3 } from 'three'
import { TIME_SCALE } from '../config/constants'
import { LIGHT_COLOR, orbitPosition } from '../lib/orbit'
import { makeRingTexture } from '../lib/ringTexture'
import { gasGiantFragment, planetVertex, ringFragment, ringVertex, rockyFragment } from '../shaders/planets'
import type { SceneTextures } from './textures'

const GIANT_ORBIT = 74
const GIANT_RADIUS = 5.2
const GIANT_START = Math.atan2(-58, -40)

/** Saturn-like gas giant with a self-shadowing ring system and a tidally locked moon. */
export function GasGiant({ textures }: { textures: SceneTextures }) {
  const system = useRef<Group>(null)
  const body = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const moon = useRef<Mesh>(null)

  const ringInner = GIANT_RADIUS * 1.25
  const ringOuter = GIANT_RADIUS * 2.35

  const ringTexture = useMemo(makeRingTexture, [])
  useEffect(() => () => ringTexture.dispose(), [ringTexture])

  const planetUniforms = useMemo(
    () => ({
      uLightColor: { value: LIGHT_COLOR.clone() },
      uTime: { value: 0 },
      uAlbedo: { value: textures.giant },
      uRingTex: { value: ringTexture },
      uCenter: { value: new Vector3() },
      uRingNormal: { value: new Vector3(0, 1, 0) },
      uRingInner: { value: ringInner },
      uRingOuter: { value: ringOuter },
    }),
    [textures.giant, ringTexture, ringInner, ringOuter],
  )

  const ringUniforms = useMemo(
    () => ({
      uLightColor: { value: LIGHT_COLOR.clone() },
      uRingTex: { value: ringTexture },
      uCenter: { value: new Vector3() },
      uRingNormal: { value: new Vector3(0, 1, 0) },
      uRingInner: { value: ringInner },
      uRingOuter: { value: ringOuter },
      uPlanetRadius: { value: GIANT_RADIUS },
    }),
    [ringTexture, ringInner, ringOuter],
  )

  const moonUniforms = useMemo(
    () => ({
      uLightColor: { value: LIGHT_COLOR.clone() },
      uTime: { value: 0 },
      uAlbedo: { value: textures.moonAlbedo },
      uNormal: { value: textures.moonNormal },
    }),
    [textures.moonAlbedo, textures.moonNormal],
  )

  const tmp = useMemo(() => new Vector3(), [])
  const normal = useMemo(() => new Vector3(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime * TIME_SCALE
    if (!system.current || !body.current || !ring.current || !moon.current) return

    orbitPosition(tmp, GIANT_ORBIT, GIANT_START + t * 0.0018, 0.04)
    system.current.position.copy(tmp)
    body.current.rotation.y += delta * 0.05

    const ma = t * 0.05 + 1.2
    moon.current.position.set(Math.cos(ma) * 19, Math.sin(ma) * 1.6, Math.sin(ma) * 19)
    moon.current.rotation.y = -ma // tidally locked

    system.current.updateMatrixWorld()
    ring.current.getWorldPosition(planetUniforms.uCenter.value)
    ringUniforms.uCenter.value.copy(planetUniforms.uCenter.value)
    normal.set(0, 0, 1).transformDirection(ring.current.matrixWorld)
    planetUniforms.uRingNormal.value.copy(normal)
    ringUniforms.uRingNormal.value.copy(normal)
  })

  return (
    <group ref={system}>
      <group rotation={[0.42, 0, 0.18]}>
        <mesh ref={body}>
          <sphereGeometry args={[GIANT_RADIUS, 128, 96]} />
          <shaderMaterial vertexShader={planetVertex} fragmentShader={gasGiantFragment} uniforms={planetUniforms} toneMapped={false} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[ringInner, ringOuter, 256, 1]} />
          <shaderMaterial
            vertexShader={ringVertex}
            fragmentShader={ringFragment}
            uniforms={ringUniforms}
            transparent
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={moon}>
          <sphereGeometry args={[0.75, 96, 64]} />
          <shaderMaterial vertexShader={planetVertex} fragmentShader={rockyFragment} uniforms={moonUniforms} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
