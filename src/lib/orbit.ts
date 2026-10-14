import { Color, Vector3 } from 'three'

/** Colour of the light coming from the accretion disk (a warm, very bright source). */
export const LIGHT_COLOR = new Color(1.0, 0.86, 0.72).multiplyScalar(1.6)

/** Circular orbit around the black hole, tilted by `inclination` about the x axis. */
export function orbitPosition(target: Vector3, radius: number, angle: number, inclination: number) {
  target.set(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * Math.sin(inclination),
    Math.sin(angle) * radius * Math.cos(inclination),
  )
  return target
}
