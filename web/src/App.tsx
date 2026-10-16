import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import { DiffWorkerProvider } from './components/diff/DiffWorkerProvider'
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
const router = createBrowserRouter([
  { path: '/', Component: SessionListPage },
  {
    path: '/s/:id',
    Component: SessionLayout,
    children: [
      { index: true, element: <Navigate to="files" replace /> },
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
      <Toaster position="bottom-right" />
    </DiffWorkerProvider>
  )
}
