import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, Vector3 } from 'three'
import { TIME_SCALE } from '../config/constants'
import { LIGHT_COLOR, orbitPosition } from '../lib/orbit'
import { planetVertex, rockyFragment } from '../shaders/planets'
import type { SceneTextures } from './textures'

const ROCK_ORBIT = 56
const ROCK_START = Math.atan2(-50, 26)

/** Airless cratered world with rough regolith shading. */
export function BarrenWorld({ textures }: { textures: SceneTextures }) {
  const body = useRef<Mesh>(null)
  const uniforms = useMemo(
    () => ({
      uLightColor: { value: LIGHT_COLOR.clone() },
      uTime: { value: 0 },
      uAlbedo: { value: textures.barrenAlbedo },
      uNormal: { value: textures.barrenNormal },
    }),
    [textures.barrenAlbedo, textures.barrenNormal],
  )
  const tmp = useMemo(() => new Vector3(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime * TIME_SCALE
    if (!body.current) return
    orbitPosition(tmp, ROCK_ORBIT, ROCK_START + t * 0.0028, 0.09)
    body.current.position.copy(tmp)
    body.current.rotation.y += delta * 0.02
  })

  return (
    <mesh ref={body}>
      <sphereGeometry args={[1.05, 128, 96]} />
      <shaderMaterial vertexShader={planetVertex} fragmentShader={rockyFragment} uniforms={uniforms} toneMapped={false} />
    </mesh>
  )
}
