import { render, screen, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SessionShell } from '@/components/layout/SessionShell'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import {
  reviewResponseFixture,
  SESSION_ID,
  sessionDetailFixture,
} from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { stubEventSource } from '@/test/mock-event-source'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { FilesPage } from './FilesPage'

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

// happy-dom has no layout: render every row instead of measuring the scroller.
vi.mock('@tanstack/react-virtual', async () => (await import('@/test/mock-virtualizer')).virtualizerModuleMock())

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname + loc.search}</span>
}

function renderFiles(initialPath: string, response = reviewResponseFixture()) {
  stubEventSource()
  const api = mockReviewApi(response)
  // StrictMode double-invokes effects on mount, like the dev build does. The page sits in the real shell (bar and rail).
  render(
    <StrictMode>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={[initialPath]}>
          <LocationProbe />
          <Routes>
            <Route
              path="/s/:id"
              element={
                <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
                  <ReviewProvider>
                    <SessionShell />
                  </ReviewProvider>
                </SessionContext.Provider>
              }
            >
              <Route path="files" element={<FilesPage />} />
              <Route path="files/*" element={<FilesPage />} />
              <Route path="submit" element={<h2>Submit page</h2>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </StrictMode>,
  )
  return api
}

function currentUrl(): string {
  return screen.getByTestId('loc').textContent ?? ''
}

describe('FilesPage with a leftover ?bp=', () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('ignores the old Blueprint stop: every file, the filter bar and the timeline stay, and the link is left alone', async () => {
    renderFiles(`/s/${SESSION_ID}/files?mode=grid&bp=pkg%3Asrc%2Fa&sel=k1`)
    expect(within(await screen.findByRole('list', { name: 'All files' })).getAllByRole('listitem')).toHaveLength(sessionDetailFixture.tree.files.length)
    expect(screen.queryByRole('region', { name: 'Blueprint scope' })).not.toBeInTheDocument()
    expect(currentUrl()).toContain('bp=')
  })
})
