import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Group, Mesh, Vector3 } from 'three'
import { TIME_SCALE } from '../config/constants'
import { LIGHT_COLOR, orbitPosition } from '../lib/orbit'
import { atmosphereFragment, oceanWorldFragment, planetVertex } from '../shaders/planets'
import type { SceneTextures } from './textures'

const OCEAN_ORBIT = 40
const OCEAN_RADIUS = 1.7
const OCEAN_START = Math.atan2(-30, 24)

/** Earth-like ocean world: sun glint, drifting clouds with shadows, Rayleigh limb. */
export function OceanWorld({ textures }: { textures: SceneTextures }) {
  const system = useRef<Group>(null)
  const body = useRef<Mesh>(null)

  const surfaceUniforms = useMemo(
    () => ({
      uLightColor: { value: LIGHT_COLOR.clone() },
      uTime: { value: 0 },
      uAlbedo: { value: textures.oceanAlbedo },
      uNormal: { value: textures.oceanNormal },
      uClouds: { value: textures.oceanClouds },
      uWater: { value: textures.oceanWater },
    }),
    [textures],
  )
  const atmosphereUniforms = useMemo(
    () => ({
      uLightColor: { value: LIGHT_COLOR.clone() },
      uTime: { value: 0 },
      uTint: { value: new Color(0.25, 0.5, 1.0) },
      uStrength: { value: 1.6 },
    }),
    [],
  )
  const tmp = useMemo(() => new Vector3(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime * TIME_SCALE
    if (!system.current || !body.current) return
    orbitPosition(tmp, OCEAN_ORBIT, OCEAN_START + t * 0.004, -0.06)
    system.current.position.copy(tmp)
    body.current.rotation.y += delta * 0.03
    surfaceUniforms.uTime.value = t
  })

  return (
    <group ref={system}>
      <group rotation={[0.41, 0, 0]}>
        <mesh ref={body}>
          <sphereGeometry args={[OCEAN_RADIUS, 128, 96]} />
          <shaderMaterial vertexShader={planetVertex} fragmentShader={oceanWorldFragment} uniforms={surfaceUniforms} toneMapped={false} />
        </mesh>
      </group>
      <mesh renderOrder={3}>
        <sphereGeometry args={[OCEAN_RADIUS * 1.022, 96, 64]} />
        <shaderMaterial
          vertexShader={planetVertex}
          fragmentShader={atmosphereFragment}
          uniforms={atmosphereUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
