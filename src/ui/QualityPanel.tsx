import { useEffect, useId } from 'react'
import { BENCH, IS_MOBILE, TEXTURE_SET } from '../config/constants'
import {
  DEFAULT_TIER,
  QUALITY_LIMITS,
  QUALITY_PRESETS,
  QUALITY_TIERS,
  clampTier,
  isCustomQuality,
  presetForTier,
} from '../config/quality'
import { setQuality, useQualityFps, useQualitySettings, useQualityUi } from './qualityStore'
import './quality-panel.css'

function fpsClass(fps: number): string {
  if (fps <= 0) return 'qp-fps--idle'
  if (fps >= 50) return 'qp-fps--good'
  if (fps >= 30) return 'qp-fps--warn'
  return 'qp-fps--bad'
}

function loadLabel(): string {
  if (BENCH) return 'Bench locked'
  return IS_MOBILE ? `${TEXTURE_SET} textures · mobile` : `${TEXTURE_SET} textures · desktop`
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function SliderRow(props: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const { label, hint, value, min, max, step, format, disabled, onChange } = props
  const id = useId()
  const pct = ((value - min) / Math.max(1e-6, max - min)) * 100
  return (
    <div className="qp-row">
      <div className="qp-row__text">
        <label className="qp-row__label" htmlFor={id}>
          {label}
        </label>
        <div className="qp-row__hint">{hint}</div>
      </div>
      <div className="qp-slider">
        <input
          id={id}
          type="range"
          className="qp-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={format(value)}
          style={{ ['--qp-fill' as string]: `${pct.toFixed(1)}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="qp-slider__val">{format(value)}</span>
      </div>
    </div>
  )
}
export function QualityPanel() {
  const { mode, tierIndex, custom } = useQualitySettings()
  const { open, advancedOpen } = useQualityUi()
  const fps = useQualityFps()
  const auto = mode === 'auto' && !custom
  const effective = custom ?? QUALITY_TIERS[clampTier(tierIndex)]
  const activePreset = custom ? null : presetForTier(clampTier(tierIndex))
  const customBadge = isCustomQuality(custom)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuality({ open: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function applyCustom(patch: Partial<{ dpr: number; msaa: number; trace: number; steps: number }>) {
    if (auto || BENCH) return
    const base = custom ?? QUALITY_TIERS[clampTier(tierIndex)]
    setQuality({
      mode: 'manual',
      custom: {
        dpr: clamp(patch.dpr ?? base.dpr, QUALITY_LIMITS.dpr.min, QUALITY_LIMITS.dpr.max),
        msaa: patch.msaa ?? base.msaa,
        trace: clamp(patch.trace ?? base.trace, QUALITY_LIMITS.trace.min, QUALITY_LIMITS.trace.max),
        steps: Math.round(clamp(patch.steps ?? base.steps, QUALITY_LIMITS.steps.min, QUALITY_LIMITS.steps.max)),
      },
    })
  }

  if (!open) {
    return (
      <div className="qp-root">
        <button
          type="button"
          className={`qp-fab${customBadge ? ' qp-fab--custom' : ''}`}
          onClick={() => setQuality({ open: true })}
          aria-label="Open graphics settings"
          title="Graphics settings"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm0 5.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"
            />
            <path
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
              opacity="0.92"
              d="M20.6 13.2a7.9 7.9 0 0 0 0-2.4l2-1.5a.6.6 0 0 0 .14-.78l-1.9-3.3a.6.6 0 0 0-.73-.27l-2.35.95a8 8 0 0 0-2.08-1.2L15.3 2.2a.6.6 0 0 0-.59-.45H9.29a.6.6 0 0 0-.59.45l-.36 2.5a8 8 0 0 0-2.08 1.2l-2.35-.95a.6.6 0 0 0-.73.27l-1.9 3.3a.6.6 0 0 0 .14.78l2 1.5a7.9 7.9 0 0 0 0 2.4l-2 1.5a.6.6 0 0 0-.14.78l1.9 3.3c.13.23.4.33.73.27l2.35-.95a8 8 0 0 0 2.08 1.2l.36 2.5c.05.28.29.45.59.45h5.42c.3 0 .54-.17.59-.45l.36-2.5a8 8 0 0 0 2.08-1.2l2.35.95c.33.06.6-.04.73-.27l1.9-3.3a.6.6 0 0 0-.14-.78l-2-1.5Zm-7.1 3.1a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6Z"
            />
          </svg>
          {(customBadge || mode === 'manual') && <span className="qp-fab__dot" aria-hidden="true" />}
        </button>
      </div>
    )
  }
  return (
    <div className="qp-root">
      <section
        className="qp-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${panelId}-title`}
      >
        <header className="qp-head">
          <div className="qp-head__titles">
            <div id={`${panelId}-title`} className="qp-title">Graphics</div>
            <div className="qp-sub">Gargantua quality</div>
          </div>
          <div className={`qp-fps ${fpsClass(fps)}`}>
            <span className="qp-fps__dot" aria-hidden="true" />
            {fps > 0 ? `${Math.round(fps)} fps` : '— fps'}
            <span className="qp-fps__sep" aria-hidden="true">·</span>
            Tier {clampTier(tierIndex) + 1}/{QUALITY_TIERS.length}
            {customBadge ? ' · custom' : ''}
          </div>
          <button
            type="button"
            className="qp-close"
            onClick={() => setQuality({ open: false })}
            aria-label="Close graphics settings"
          >
            ×
          </button>
        </header>

        <div className="qp-row qp-row--auto">
          <div className="qp-row__text">
            <div className="qp-row__label">Auto quality</div>
            <div className="qp-row__hint">
              {BENCH ? 'Disabled — ?bench pins the tier.' : 'Adaptive via frame-rate monitor'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            disabled={BENCH}
            className={`qp-switch${auto ? ' qp-switch--on' : ''}`}
            onClick={() => setQuality({ mode: auto ? 'manual' : 'auto', custom: null })}
          >
            <span className="qp-switch__thumb" aria-hidden="true" />
            <span className="qp-sr">{auto ? 'Turn auto off' : 'Turn auto on'}</span>
          </button>
        </div>

        <div className="qp-section-label">Preset</div>
        <div className={`qp-presets${auto || BENCH ? ' is-disabled' : ''}`} role="group" aria-label="Quality presets">
          {QUALITY_PRESETS.map((p) => {
            const active = activePreset?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                disabled={auto || BENCH}
                onClick={() => setQuality({ mode: 'manual', tierIndex: p.tier, custom: null })}
                className={`qp-preset${active ? ' qp-preset--active' : ''}`}
                aria-pressed={active}
                title={p.description}
              >
                <span className="qp-preset__name">{p.label}</span>
                <span className="qp-preset__tag">{p.tagline}</span>
                <span className="qp-preset__meta">
                  {QUALITY_TIERS[p.tier].dpr.toFixed(1)}x · {QUALITY_TIERS[p.tier].steps} steps
                </span>
              </button>
            )
          })}
        </div>
        {!auto && !BENCH && (
          <div className="qp-active-desc" aria-live="polite">
            {customBadge ? 'Custom mix — sliders below override the preset.' : (activePreset?.description ?? '')}
          </div>
        )}

        <button
          type="button"
          className="qp-adv-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setQuality({ advancedOpen: !advancedOpen })}
        >
          <span>Advanced tuning</span>
          <span className={`qp-adv-chev${advancedOpen ? ' qp-adv-chev--open' : ''}`} aria-hidden="true">▾</span>
        </button>

        {advancedOpen && (
          <div className={`qp-advanced${auto || BENCH ? ' is-disabled' : ''}`}>
            <SliderRow
              label="Pixel ratio"
              hint="Canvas sharpness vs GPU fill cost"
              value={effective.dpr}
              min={QUALITY_LIMITS.dpr.min}
              max={QUALITY_LIMITS.dpr.max}
              step={QUALITY_LIMITS.dpr.step}
              format={(v) => `${v.toFixed(2)}x`}
              disabled={auto || BENCH}
              onChange={(v) => applyCustom({ dpr: v })}
            />
            <div className="qp-row">
              <div className="qp-row__text">
                <div className="qp-row__label">Anti-aliasing</div>
                <div className="qp-row__hint">MSAA of the post buffer</div>
              </div>
              <div className="qp-seg" role="group" aria-label="MSAA level">
                {QUALITY_LIMITS.msaaOptions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={auto || BENCH}
                    aria-pressed={effective.msaa === m}
                    className={`qp-seg__btn${effective.msaa === m ? ' qp-seg__btn--active' : ''}`}
                    onClick={() => applyCustom({ msaa: m })}
                  >
                    {m === 0 ? 'Off' : `${m}x`}
                  </button>
                ))}
              </div>
            </div>
            <SliderRow
              label="Tracer resolution"
              hint="Ray tracer scale — stars stay sharp"
              value={effective.trace}
              min={QUALITY_LIMITS.trace.min}
              max={QUALITY_LIMITS.trace.max}
              step={QUALITY_LIMITS.trace.step}
              format={(v) => `${v.toFixed(2)}x`}
              disabled={auto || BENCH}
              onChange={(v) => applyCustom({ trace: v })}
            />
            <SliderRow
              label="Geodesic steps"
              hint="Max integration per ray"
              value={effective.steps}
              min={QUALITY_LIMITS.steps.min}
              max={QUALITY_LIMITS.steps.max}
              step={QUALITY_LIMITS.steps.step}
              format={(v) => `${Math.round(v)}`}
              disabled={auto || BENCH}
              onChange={(v) => applyCustom({ steps: Math.round(v) })}
            />
            <div className="qp-advanced__foot">
              <button
                type="button"
                className="qp-link"
                disabled={auto || BENCH}
                onClick={() => setQuality({ mode: 'manual', tierIndex: DEFAULT_TIER, custom: null })}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        <footer className="qp-foot">
          <span>{loadLabel()}</span>
          <span aria-hidden="true">·</span>
          <span>dpr ≤ 2</span>
          {BENCH && (<><span aria-hidden="true">·</span><span className="qp-foot__bench">bench</span></>)}
        </footer>
      </section>
    </div>
  )
}




