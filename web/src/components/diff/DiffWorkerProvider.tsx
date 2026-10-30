import {
  useWorkerPool,
  WorkerPoolContextProvider,
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions,
} from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { useEffect, type ReactNode } from 'react'
import { useCodeContrast } from '@/lib/code-prefs'

// One pool for the whole app (research/02: the Vite `?worker` import; a bare `new URL()` worker
// broke Shiki imports in dev). The singleton inside @pierre/diffs survives StrictMode remounts.
const poolOptions: WorkerPoolOptions = {
  workerFactory: () => new DiffsWorker(),
  poolSize: 4,
}

const highlighterOptions: WorkerInitializationRenderOptions = {}

// The pool highlights for every diff, so the syntax theme is set on it, not per diff.
const NORMAL_THEME = { light: 'pierre-light', dark: 'pierre-dark' }
const HIGH_CONTRAST_THEME = { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' }

/** Swaps the pool's syntax colours for GitHub's high-contrast ones while the high-contrast code mode is on. */
function SyntaxTheme() {
  const pool = useWorkerPool()
  const highContrast = useCodeContrast()
  useEffect(() => {
    void pool?.setRenderOptions({ theme: highContrast ? HIGH_CONTRAST_THEME : NORMAL_THEME })
  }, [pool, highContrast])
  return null
}

export function DiffWorkerProvider({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      <SyntaxTheme />
      {children}
    </WorkerPoolContextProvider>
  )
}
