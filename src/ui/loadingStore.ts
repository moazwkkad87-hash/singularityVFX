import { useSyncExternalStore } from 'react'
import type { Scene } from 'three'

/**
 * Tiny external store shared by the preloader (DOM) and the 3D scene (canvas).
 * Stages: engine -> textures -> uploading -> compiling -> warming -> ready
 */
export type Stage = 'engine' | 'textures' | 'uploading' | 'compiling' | 'warming' | 'ready' | 'error'

type State = { stage: Stage; progress: number; error?: string }

let state: State = { stage: 'engine', progress: 0 }
const listeners = new Set<() => void>()

export function setLoading(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useLoading() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Off-screen scenes (e.g. the ray tracer) that must be compiled before reveal. */
export const offscreenScenes = new Set<Scene>()
