import { useEffect, useState } from 'react'
import { useLoading, type Stage } from './loadingStore'
import './preloader.css'

const LABELS: Record<Stage, string> = {
  engine: 'Loading engine',
  textures: 'Loading textures',
  uploading: 'Uploading to GPU',
  compiling: 'Compiling shaders',
  warming: 'Bending light',
  ready: 'Ready',
  error: 'Something went wrong',
}

const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function Preloader() {
  const { stage, progress, error } = useLoading()
  const [shown, setShown] = useState(0)
  const [gone, setGone] = useState(false)

  // ease the displayed value towards the real one so the ring never jumps
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setShown((v) => {
        const next = v + (progress - v) * 0.12
        return Math.abs(progress - next) < 0.001 ? progress : next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [progress])

  const ready = stage === 'ready'
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(() => setGone(true), 1400)
    return () => window.clearTimeout(id)
  }, [ready])

  if (gone) return null

  const percent = Math.round(shown * 100)
  return (
    <div className={`preloader${ready ? ' preloader--done' : ''}`} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Loading scene">
      <div className="preloader__core">
        <svg className="preloader__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="preloader__track" cx="50" cy="50" r={RADIUS} />
          <circle
            className="preloader__bar"
            cx="50"
            cy="50"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - shown)}
          />
        </svg>
        <div className="preloader__hole" aria-hidden="true" />
        <span className="preloader__percent">{percent}</span>
      </div>
      <div className="preloader__title">GARGANTUA</div>
      <div className={`preloader__stage${stage === 'error' ? ' preloader__stage--error' : ''}`}>
        {stage === 'error' ? error ?? LABELS.error : LABELS[stage]}
      </div>
    </div>
  )
}
