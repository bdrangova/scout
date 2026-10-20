import { RouterProvider, createBrowserRouter } from 'react-router'
import { DiffWorkerProvider } from './components/diff/DiffWorkerProvider'
import { SessionIndexRedirect } from './components/layout/SessionIndexRedirect'
import { Toaster } from './components/ui/sonner'
import { EvidencePage } from './pages/EvidencePage'
import { ExtrasPage } from './pages/ExtrasPage'
import { FilesPage } from './pages/FilesPage'
import { SessionLayout } from './pages/SessionLayout'
import { SessionListPage } from './pages/SessionListPage'
import { SpecPage } from './pages/SpecPage'
import { SubmitPage } from './pages/SubmitPage'

// Web routes from the contract: `/`, `/s/:id/files`, `/s/:id/files/*path`,
// `/s/:id/evidence/*path?`, `/s/:id/spec`, `/s/:id/extras`, `/s/:id/submit`.
// `/s/:id` itself redirects to the step the review should open on (lib/landing-section.ts).
// `/__kit` is the dev-only primitives gallery (web/src/pages/KitPage.tsx).
const router = createBrowserRouter([
  { path: '/', Component: SessionListPage },
  ...(import.meta.env.DEV
    ? [{ path: '/__kit', HydrateFallback: () => null, lazy: async () => ({ Component: (await import('./pages/KitPage')).KitPage }) }]
    : []),
  {
    path: '/s/:id',
    Component: SessionLayout,
    children: [
      { index: true, Component: SessionIndexRedirect },
      { path: 'files', Component: FilesPage },
      { path: 'files/*', Component: FilesPage },
      { path: 'evidence', Component: EvidencePage },
      { path: 'evidence/*', Component: EvidencePage },
      { path: 'spec', Component: SpecPage },
      { path: 'extras', Component: ExtrasPage },
      { path: 'submit', Component: SubmitPage },
    ],
  },
])

export function App() {
  return (
    <DiffWorkerProvider>
      <RouterProvider router={router} />
      <Toaster position="bottom-center" />
    </DiffWorkerProvider>
  )
}
