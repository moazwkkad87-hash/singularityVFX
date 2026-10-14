/**
 * Scene-wide constants.
 * Units: the event horizon (Schwarzschild radius, Rs) is exactly 1.0.
 */
export const DISK_INNER = 2.6 // just inside the ISCO (3 Rs) for a hot inner edge
export const DISK_OUTER = 15.0
export const PLUNGE_INNER = 1.3 // gas spiralling in below the ISCO
export const LENS_RADIUS = 16.5 // exact geodesic marching only inside this sphere
export const TIME_SCALE = 1.0

/** Encoding range for the baked HDR sky (stored as gamma-encoded 8-bit). */
export const SKY_RANGE = 0.5

export const PARAMS = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')

export const IS_MOBILE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

/** `?textures=sd` forces the light texture set; phones use it automatically. */
export const TEXTURE_SET: 'hd' | 'sd' =
  (PARAMS.get('textures') as 'hd' | 'sd' | null) ?? (IS_MOBILE ? 'sd' : 'hd')

/** `?bench` locks a fixed quality tier and disables auto-rotation (for profiling). */
export const BENCH = PARAMS.has('bench')
