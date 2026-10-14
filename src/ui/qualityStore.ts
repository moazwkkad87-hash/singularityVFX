import { useSyncExternalStore } from 'react'
import { BENCH, IS_MOBILE } from '../config/constants'
import { DEFAULT_TIER, QUALITY_TIERS, clampTier, type Quality } from '../config/quality'

/**
 * Shared graphics-quality state between the DOM panel and the R3F canvas.
 * Same tiny external-store pattern as loadingStore.ts (no extra deps).
 *
 *  mode 'auto'   -> PerformanceMonitor walks tierIndex up/down, custom=null
 *  mode 'manual' -> tierIndex pinned by preset click, custom=null
 *  custom!=null  -> advanced sliders override the tier entirely
 *
 * PERF: settings / ui / fps are three independent slices so the
 * per-frame FPS sampler never re-renders <World/> (the 3D scene).
 */

export type QualityMode = 'auto' | 'manual'

type SettingsState = {
  mode: QualityMode
  tierIndex: number
  custom: Quality | null
}

type UiState = { open: boolean; advancedOpen: boolean }

const STORAGE_KEY = 'gargantua:quality:v1'

type Persisted = { mode: QualityMode; tierIndex: number; custom: Quality | null }

function initialTier(): number {
  const start = BENCH ? DEFAULT_TIER : IS_MOBILE ? 1 : DEFAULT_TIER
  return clampTier(Math.min(start, QUALITY_TIERS.length - 1))
}

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Persisted>
    if (typeof p.tierIndex !== 'number') return null
    if (p.custom) {
      const c = p.custom
      if (![c.dpr, c.msaa, c.trace, c.steps].every((v) => typeof v === 'number' && Number.isFinite(v)))
        return null
    }
    const mode = p.mode === 'manual' ? 'manual' : 'auto'
    return {
      mode,
      // Original behavior always booted at initialTier in auto mode.
      // Only restore the saved tier for explicit manual/custom choices,
      // otherwise a previous auto incline to tier 5 makes every reload
      // permanently heavier than before the panel existed.
      tierIndex: mode === 'manual' || p.custom ? clampTier(p.tierIndex) : initialTier(),
      custom: p.custom ?? null,
    }
  } catch {
    return null
  }
}

const persisted = !BENCH ? loadPersisted() : null

let settings: SettingsState = {
  mode: persisted?.mode ?? 'auto',
  tierIndex: persisted?.tierIndex ?? initialTier(),
  custom: persisted?.custom ?? null,
}

let ui: UiState = {
  open: false,
  advancedOpen: Boolean(persisted?.custom),
}

let fps = 0

const settingsListeners = new Set<() => void>()
const uiListeners = new Set<() => void>()
const fpsListeners = new Set<() => void>()

function emit(set: Set<() => void>) {
  set.forEach((l) => l())
}

function persist() {
  if (BENCH) return
  try {
    // Persist explicit user choices only — never the transient auto tier,
    // so reloads behave exactly like the pre-panel build.
    if (settings.mode === 'auto' && !settings.custom) return
    const p: Persisted = { mode: settings.mode, tierIndex: settings.tierIndex, custom: settings.custom }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* private mode etc. — quality simply won't persist */
  }
}

export function setQuality(patch: Partial<SettingsState & UiState>) {
  let settingsChanged = false
  let uiChanged = false
  const nextSettings: SettingsState = { ...settings }
  const nextUi: UiState = { ...ui }

  if (patch.mode !== undefined && patch.mode !== settings.mode) {
    nextSettings.mode = patch.mode
    settingsChanged = true
  }
  if (patch.tierIndex !== undefined && clampTier(patch.tierIndex) !== settings.tierIndex) {
    nextSettings.tierIndex = clampTier(patch.tierIndex)
    settingsChanged = true
  }
  if ('custom' in patch && patch.custom !== settings.custom) {
    nextSettings.custom = patch.custom ?? null
    settingsChanged = true
  }
  // touching a preset/tier/mode clears any custom slider override
  if ((patch.tierIndex !== undefined || patch.mode !== undefined) && !('custom' in patch)) {
    if (nextSettings.custom !== null) {
      nextSettings.custom = null
      settingsChanged = true
    }
  }
  if (patch.open !== undefined && patch.open !== ui.open) {
    nextUi.open = patch.open
    uiChanged = true
  }
  if (patch.advancedOpen !== undefined && patch.advancedOpen !== ui.advancedOpen) {
    nextUi.advancedOpen = patch.advancedOpen
    uiChanged = true
  }

  if (settingsChanged) {
    settings = nextSettings
    persist()
    emit(settingsListeners)
  }
  if (uiChanged) {
    ui = nextUi
    emit(uiListeners)
  }
}

/** Throttled by the caller — notifies the badge only, never <World/>. */
export function setQualityFps(next: number) {
  if (Math.abs(next - fps) < 1) return
  fps = next
  emit(fpsListeners)
}

/** Read by the canvas sampler to skip all work while the panel is closed. */
export function isQualityPanelOpen(): boolean {
  return ui.open
}

/** Called by PerformanceMonitor — ignored unless auto + no custom override + not bench. */
export function autoStep(delta: 1 | -1 | 'min') {
  if (BENCH || settings.mode !== 'auto' || settings.custom) return
  const next = delta === 'min' ? 0 : clampTier(settings.tierIndex + delta)
  if (next === settings.tierIndex) return
  settings = { ...settings, tierIndex: next }
  // NOTE: intentionally NOT persisted (see persist()) and only settings
  // listeners fire, so the DOM badge updates without touching UI state.
  emit(settingsListeners)
}

/** <World/> subscribes to this — fps + open/close never re-render the scene. */
export function useQualitySettings(): SettingsState {
  return useSyncExternalStore(
    (l) => {
      settingsListeners.add(l)
      return () => settingsListeners.delete(l)
    },
    () => settings,
  )
}

/** Panel chrome only (open / advanced collapsed). */
export function useQualityUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      uiListeners.add(l)
      return () => uiListeners.delete(l)
    },
    () => ui,
  )
}

/** Badge number only — isolated so 2Hz updates can't touch the canvas. */
export function useQualityFps(): number {
  return useSyncExternalStore(
    (l) => {
      fpsListeners.add(l)
      return () => fpsListeners.delete(l)
    },
    () => fps,
  )
}

/** Back-compat for components that need everything (panel only, never canvas). */
export function useQuality() {
  const s = useQualitySettings()
  const u = useQualityUi()
  const f = useQualityFps()
  return { ...s, ...u, fps: f }
}

/** Effective tier index clamped to tiers the device can actually use (maxDpr). */
export function visibleTierCount(maxDpr: number): number {
  return Math.max(1, QUALITY_TIERS.filter((t) => t.dpr <= Math.max(maxDpr, 1)).length)
}
