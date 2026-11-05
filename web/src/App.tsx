import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import { DiffWorkerProvider } from './components/diff/DiffWorkerProvider'
import { SessionIndexRedirect } from './components/layout/SessionIndexRedirect'
import { TestRunIndexRedirect } from './components/layout/TestRunIndexRedirect'
import { Toaster } from './components/ui/sonner'
import { EvidencePage } from './pages/EvidencePage'
import { ExtrasPage } from './pages/ExtrasPage'
import { FilesPage } from './pages/FilesPage'
import { JournalPage } from './pages/JournalPage'
import { PendingPrPage } from './pages/PendingPrPage'
import { PrSummaryPage } from './pages/PrSummaryPage'
import { SessionLayout } from './pages/SessionLayout'
import { SessionListPage } from './pages/SessionListPage'
import { SpecPage } from './pages/SpecPage'
import { SubmitPage } from './pages/SubmitPage'
import { WorktreeDetailPage } from './pages/WorktreeDetailPage'
import { WorktreesPage } from './pages/WorktreesPage'
import { TestRunLayout } from './pages/TestRunLayout'
import { DataSetupPage } from './pages/testrun/DataSetupPage'
import { GapsPage } from './pages/testrun/GapsPage'
import { LogsPage } from './pages/testrun/LogsPage'
import { OverviewPage } from './pages/testrun/OverviewPage'
import { ReviewPage } from './pages/testrun/ReviewPage'
import { TestRunSubmitPage } from './pages/testrun/TestRunSubmitPage'

// Web routes from the contract: `/` (worktrees), `/d` (development sessions), `/s/:id/files`, `/s/:id/files/*path`,
// `/s/:id/evidence/*path?`, `/s/:id/spec`, `/s/:id/extras`, `/s/:id/journal`, `/s/:id/submit`.
// A PR review also has `/s/:id/summary`, where it opens.
// `/s/:id` itself redirects to the step the review should open on (lib/landing-section.ts).
// PR reviews: `/pr?tab=assigned|active|archived` (list), `/pr/p/:id` (a not-started review; becomes `/s/:id` once started).
// Test runs: `/t` (list), `/t/:id/{overview,review,review/:scenarioId,gaps,data-setup,logs,submit}`; `/t/:id` redirects like `/s/:id`.
// Worktrees: `/` (list; the old `/w` redirects there), `/w/:id` (detail).
// `/__kit` is the dev-only primitives gallery (web/src/pages/KitPage.tsx).
const router = createBrowserRouter([
  { path: '/', Component: WorktreesPage },
  { path: '/w', element: <Navigate to="/" replace /> },
  { path: '/d', Component: SessionListPage },
  { path: '/w/:id', Component: WorktreeDetailPage },
  { path: '/pr', element: <SessionListPage kind="pr-review" /> },
  { path: '/pr/p/:id', Component: PendingPrPage },
  { path: '/t', element: <SessionListPage kind="test-run" /> },
  ...(import.meta.env.DEV
    ? [{ path: '/__kit', HydrateFallback: () => null, lazy: async () => ({ Component: (await import('./pages/KitPage')).KitPage }) }]
    : []),
  {
    path: '/s/:id',
    Component: SessionLayout,
    children: [
      { index: true, Component: SessionIndexRedirect },
      { path: 'summary', Component: PrSummaryPage },
      { path: 'files', Component: FilesPage },
      { path: 'files/*', Component: FilesPage },
      { path: 'evidence', Component: EvidencePage },
      { path: 'evidence/*', Component: EvidencePage },
      { path: 'spec', Component: SpecPage },
      { path: 'extras', Component: ExtrasPage },
      { path: 'journal', Component: JournalPage },
      { path: 'submit', Component: SubmitPage },
    ],
  },
  {
    path: '/t/:id',
    Component: TestRunLayout,
    children: [
      { index: true, Component: TestRunIndexRedirect },
      { path: 'overview', Component: OverviewPage },
      { path: 'review', Component: ReviewPage },
      { path: 'review/:scenarioId', Component: ReviewPage },
      { path: 'gaps', Component: GapsPage },
      { path: 'data-setup', Component: DataSetupPage },
      { path: 'logs', Component: LogsPage },
      { path: 'submit', Component: TestRunSubmitPage },
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
