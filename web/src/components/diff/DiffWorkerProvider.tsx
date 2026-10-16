import {
  WorkerPoolContextProvider,
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions,
} from '@pierre/diffs/react'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import type { ReactNode } from 'react'

// One pool for the whole app (research/02: the Vite `?worker` import; a bare `new URL()` worker
// broke Shiki imports in dev). The singleton inside @pierre/diffs survives StrictMode remounts.
const poolOptions: WorkerPoolOptions = {
  workerFactory: () => new DiffsWorker(),
  poolSize: 4,
}

const highlighterOptions: WorkerInitializationRenderOptions = {}

export function DiffWorkerProvider({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      {children}
    </WorkerPoolContextProvider>
  )
}
