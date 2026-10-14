/**
 * Adaptive quality tiers. The PerformanceMonitor walks up and down this list
 * at runtime based on measured frame rate.
 *
 *  dpr    - canvas pixel ratio
 *  msaa   - multisampling of the post-processing buffer
 *  trace  - internal resolution of the black-hole ray tracer, relative to the
 *           drawing buffer. Stars are re-sampled at full resolution in the
 *           composite pass, so this can be low without losing sharp stars.
 *  steps  - maximum geodesic integration steps per ray
 */
export type Quality = { dpr: number; msaa: number; trace: number; steps: number }

export const QUALITY_TIERS: Quality[] = [
  { dpr: 1, msaa: 2, trace: 1.1,  steps: 220 },
  { dpr: 1.4,  msaa: 4, trace: 1.1, steps: 230 },
  { dpr: 1.6,  msaa: 5, trace: 1.1,  steps: 270 },
  { dpr: 1.7, msaa: 5, trace: 1.0,  steps: 320 },
  { dpr: 1.7,  msaa: 5, trace: 1.0,  steps: 350 },
  { dpr: 2.4,  msaa: 5, trace: 1.0,  steps: 390 },
]
export const DEFAULT_TIER = 4 // start higher

/* ------------------------------------------------------------------ */
/*  Presets + limits for the graphics panel                            */
/* ------------------------------------------------------------------ */

export type PresetId = 'low' | 'balanced' | 'high' | 'cinematic'

export type QualityPreset = {
  id: PresetId
  label: string
  tagline: string
  /** index into QUALITY_TIERS */
  tier: number
  description: string
}

export const QUALITY_PRESETS: QualityPreset[] = [
  {
    id: 'low',
    label: 'Low',
    tagline: 'Potato · 60 fps',
    tier: 0,
    description: 'Sharp enough, fastest photon ring. For integrated GPUs.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    tagline: 'Laptop · recommended',
    tier: 2,
    description: 'Best detail-per-watt. The default for most machines.',
  },
  {
    id: 'high',
    label: 'High',
    tagline: 'Desktop · crisp',
    tier: 4,
    description: 'Full tracer steps, dense disk. For discrete GPUs.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    tagline: 'RTX · max fidelity',
    tier: 5,
    description: '2.4x pixel ratio, 390-step geodesics. Screenshots.',
  },
]

export const QUALITY_LIMITS = {
  dpr: { min: 0.75, max: 2.4, step: 0.05 },
  trace: { min: 0.5, max: 1.1, step: 0.05 },
  steps: { min: 150, max: 400, step: 10 },
  msaaOptions: [0, 2, 4, 5, 8] as const,
} as const

/** Returns the preset that exactly matches a tier index, or null when custom. */
export function presetForTier(tierIndex: number): QualityPreset | null {
  return QUALITY_PRESETS.find((p) => p.tier === tierIndex) ?? null
}

/** True when a quality value does not exactly match any tier. */
export function isCustomQuality(q: Quality | null | undefined): boolean {
  if (!q) return false
  return !QUALITY_TIERS.some(
    (t) => t.dpr === q.dpr && t.msaa === q.msaa && t.trace === q.trace && t.steps === q.steps,
  )
}

export function clampTier(i: number): number {
  return Math.max(0, Math.min(QUALITY_TIERS.length - 1, Math.round(i)))
}

