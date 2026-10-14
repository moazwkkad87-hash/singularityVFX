/* Comets on Keplerian ellipses with an ion tail and a curved dust tail */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3 } from 'three'
import { TIME_SCALE } from '../config/constants'
import { hash3 } from '../lib/noise'
import { LIGHT_COLOR } from '../lib/orbit'
import { cometFragment, cometVertex } from '../shaders/comet'

const COMET_PARTICLES = 2400

type CometProps = {
  semiMajor: number
  eccentricity: number
  inclination: number
  node: number
  period: number
  phase: number
}

export function Comet({ semiMajor, eccentricity, inclination, node, period, phase }: CometProps) {
  const nucleus = useRef<Mesh>(null)

  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const positions = new Float32Array(COMET_PARTICLES * 3)
    const seeds = new Float32Array(COMET_PARTICLES * 4)
    for (let i = 0; i < COMET_PARTICLES; i++) {
      const kind = i < 300 ? 0 : i < 1300 ? 1 : 2
      seeds[i * 4] = hash3(i, 1, phase)
      seeds[i * 4 + 1] = hash3(i, 2, phase)
      seeds[i * 4 + 2] = hash3(i, 3, phase)
      seeds[i * 4 + 3] = kind
    }
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4))
    return g
  }, [phase])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uNucleus: { value: new Vector3() },
      uAntiLight: { value: new Vector3(1, 0, 0) },
      uVelocity: { value: new Vector3(0, 0, 1) },
      uActivity: { value: 1 },
      uPointScale: { value: 400 },
      uLightColor: { value: LIGHT_COLOR.clone() },
    }),
    [],
  )

  const basis = useMemo(() => {
    const m = new Matrix4().makeRotationY(node)
    m.multiply(new Matrix4().makeRotationX(inclination))
    return m
  }, [node, inclination])

  const current = useMemo(() => new Vector3(), [])
  const ahead = useMemo(() => new Vector3(), [])

  const solve = (time: number, target: Vector3) => {
    const M = ((time / period) * Math.PI * 2 + phase) % (Math.PI * 2)
    let E = M
    for (let k = 0; k < 8; k++) {
      E -= (E - eccentricity * Math.sin(E) - M) / (1 - eccentricity * Math.cos(E))
    }
    const x = semiMajor * (Math.cos(E) - eccentricity)
    const z = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E)
    return target.set(x, 0, z).applyMatrix4(basis)
  }

  useFrame((state) => {
    const t = state.clock.elapsedTime * TIME_SCALE
    solve(t, current)
    solve(t + 0.5, ahead)
    const r = current.length()

    uniforms.uTime.value = t
    uniforms.uNucleus.value.copy(current)
    uniforms.uAntiLight.value.copy(current).normalize()
    uniforms.uVelocity.value.subVectors(ahead, current).normalize()
    // sublimation ramps up sharply near periapsis
    uniforms.uActivity.value = Math.min(1.6, Math.pow(30 / r, 1.4))
    uniforms.uPointScale.value = state.size.height * state.viewport.dpr * 0.9
    nucleus.current?.position.copy(current)
  })

  return (
    <>
      <points geometry={geometry} frustumCulled={false} renderOrder={5}>
        <shaderMaterial
          vertexShader={cometVertex}
          fragmentShader={cometFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <mesh ref={nucleus}>
        <sphereGeometry args={[0.035, 12, 8]} />
        <meshBasicMaterial color="#cfe6ff" />
      </mesh>
    </>
  )
}
