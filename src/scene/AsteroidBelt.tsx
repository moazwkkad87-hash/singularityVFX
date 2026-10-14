/*
 * Asteroid belt: GPU-animated instanced rocks. Orbit and tumble are computed
 * in the vertex shader, so the CPU does zero work per frame. Two detail
 * levels: a few big hero rocks with dense meshes, thousands of low-poly pebbles.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Vector3 } from 'three'
import { TIME_SCALE } from '../config/constants'
import { hash3 } from '../lib/noise'
import { makeRockGeometry } from '../lib/rockGeometry'
import { GLSL_LENS } from '../shaders/common'

const ROCK_SHAPES = 4
const HERO_ROCKS_PER_SHAPE = 45
const PEBBLES_PER_SHAPE = 1500

function useRockMaterial(time: { value: number }) {
  return useMemo(() => {
    const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOrbit; // radius, phase, height, angular speed
          attribute vec4 aSpin;  // axis xyz, tumble rate
          attribute float aSize;
          uniform float uTime;
          ${GLSL_LENS}
          mat3 rotAxis(vec3 a, float ang) {
            float s = sin(ang), c = cos(ang), oc = 1.0 - c;
            return mat3(
              oc * a.x * a.x + c,       oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
              oc * a.x * a.y - a.z * s, oc * a.y * a.y + c,       oc * a.y * a.z + a.x * s,
              oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
          }`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `mat3 rockRot = rotAxis(aSpin.xyz, uTime * aSpin.w + aOrbit.y * 7.0);
          vec3 objectNormal = rockRot * normal;
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `float orbitAngle = aOrbit.y + uTime * aOrbit.w;
          vec3 transformed = rockRot * position * aSize
            + vec3(cos(orbitAngle) * aOrbit.x, aOrbit.z, sin(orbitAngle) * aOrbit.x);`,
        )
        .replace(
          '#include <project_vertex>',
          `vec4 lensedWorld = vec4(lensWarp((modelMatrix * vec4(transformed, 1.0)).xyz), 1.0);
          vec4 mvPosition = viewMatrix * lensedWorld;
          gl_Position = projectionMatrix * mvPosition;`,
        )
    }
    return material
  }, [time])
}

function AsteroidField({ shape, hero, time }: { shape: number; hero: boolean; time: { value: number } }) {
  const count = hero ? HERO_ROCKS_PER_SHAPE : PEBBLES_PER_SHAPE
  const material = useRockMaterial(time)

  const geometry = useMemo(() => {
    const g = makeRockGeometry(shape * 7.31 + (hero ? 1.3 : 5.9), hero ? 3 : 2)
    const orbit = new Float32Array(count * 4)
    const spin = new Float32Array(count * 4)
    const size = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const axis = new Vector3()
    for (let i = 0; i < count; i++) {
      const seed = shape * 10000 + i + (hero ? 5000 : 0)
      const rnd = (k: number) => hash3(seed, k, k * 1.7)
      const radius = 21 + Math.pow(rnd(1), 0.9) * 9 + (rnd(2) - 0.5) * 1.5
      orbit[i * 4] = radius
      orbit[i * 4 + 1] = rnd(4) * Math.PI * 2
      orbit[i * 4 + 2] = (rnd(5) - 0.5) * 0.9 * (0.5 + (radius - 21) / 9)
      orbit[i * 4 + 3] = 0.9 / Math.pow(radius, 1.5) // Kepler: omega ~ r^-1.5
      axis.set(rnd(6) - 0.5, rnd(7) - 0.5, rnd(8) - 0.5).normalize()
      spin[i * 4] = axis.x
      spin[i * 4 + 1] = axis.y
      spin[i * 4 + 2] = axis.z
      spin[i * 4 + 3] = (rnd(9) - 0.5) * (hero ? 0.25 : 0.9)
      size[i] = hero ? 0.14 + Math.pow(rnd(3), 2) * 0.32 : 0.012 + Math.pow(rnd(3), 4) * 0.12
      // carbonaceous (dark), silicate (grey-brown) and metallic (bright) types
      const type = rnd(10)
      const tint = 0.8 + rnd(11) * 0.4
      const base = type < 0.6 ? [0.20, 0.18, 0.16] : type < 0.92 ? [0.38, 0.32, 0.26] : [0.48, 0.46, 0.44]
      colors[i * 3] = base[0] * tint
      colors[i * 3 + 1] = base[1] * tint
      colors[i * 3 + 2] = base[2] * tint
    }
    g.setAttribute('aOrbit', new InstancedBufferAttribute(orbit, 4))
    g.setAttribute('aSpin', new InstancedBufferAttribute(spin, 4))
    g.setAttribute('aSize', new InstancedBufferAttribute(size, 1))
    return { g, colors }
  }, [shape, hero, count])

  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    m.instanceColor = new InstancedBufferAttribute(geometry.colors, 3)
  }, [geometry])
  useEffect(() => () => geometry.g.dispose(), [geometry])

  return <instancedMesh ref={mesh} args={[geometry.g, material, count]} frustumCulled={false} />
}

export function AsteroidBelt() {
  const time = useMemo(() => ({ value: 0 }), [])
  useFrame((state) => {
    time.value = state.clock.elapsedTime * TIME_SCALE
  })
  return (
    <group rotation={[0.035, 0, 0.02]}>
      {Array.from({ length: ROCK_SHAPES }, (_, i) => (
        <group key={i}>
          <AsteroidField shape={i} hero time={time} />
          <AsteroidField shape={i} hero={false} time={time} />
        </group>
      ))}
    </group>
  )
}
