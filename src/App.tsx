import { lazy, Suspense } from 'react'
import { Preloader } from './ui/Preloader'
import { QualityPanel } from './ui/QualityPanel'

// The 3D engine (three, fiber, drei, postprocessing) is a separate chunk, so the
// preloader paints instantly while it downloads.
const Experience = lazy(() => import('./scene/Experience'))

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
      <Preloader />
      <QualityPanel />
    </>
  )
}
