import { mergeComments, progress, type Resolutions, type Review, type SessionDetail } from '@review-dash/shared'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { RailSlotProvider } from '@/components/layout/RailSlot'
import { SessionBar } from '@/components/layout/SessionBar'
import { SessionRail } from '@/components/layout/SessionRail'
import { SidebarProvider } from '@/components/layout/SidebarProvider'
import type { UnsavedDraft } from '@/lib/comment-drafts'
import { SessionContext } from '@/lib/session-context'
import { ReviewStateContext, type ReviewContextValue, type SaveStatus } from '@/state/review-context'
import { reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { ThemeProvider } from '@/theme/ThemeProvider'

export interface ShellOptions {
  detail?: SessionDetail
  review?: Review
  resolutions?: Resolutions | null
  saveStatus?: SaveStatus
  onHelp?: () => void
  /** Composers holding text that was not added. */
  unsavedDrafts?: UnsavedDraft[]
  /** The page rendered in the content column (default: nothing). */
  page?: ReactNode
}

/**
 * The session bar and rail around a page, on the given route, with a fixed review (no provider,
 * no network). The page can render into the rail with `RailSection`.
 */
export function renderShell(path: string, { detail = sessionDetailFixture, review = reviewFixture(), resolutions = null, saveStatus = 'idle', onHelp = vi.fn(), page = null, unsavedDrafts = [] }: ShellOptions = {}) {
  const value: ReviewContextValue = {
    state: { review, pendingReject: null, atEnd: false },
    dispatch: vi.fn(),
    comments: mergeComments(review, resolutions),
    commentsFor: () => [],
    fileReview: () => null,
    draftFor: () => '',
    setDraft: () => {},
    unsavedDrafts,
    setVerdict: () => false,
    progress: progress(review, detail.tree),
    resolutions,
    saveStatus,
    flushSave: () => Promise.resolve(true),
    reload: () => {},
  }
  render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[path]}>
        <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
          <ReviewStateContext.Provider value={value}>
            <Routes>
              <Route
                path="/s/:id"
                element={
                  <SidebarProvider>
                    <RailSlotProvider>
                      <SessionBar onHelp={onHelp} />
                      <SessionRail />
                      <main>
                        <Outlet />
                      </main>
                    </RailSlotProvider>
                  </SidebarProvider>
                }
              >
                <Route path="*" element={page} />
              </Route>
            </Routes>
          </ReviewStateContext.Provider>
        </SessionContext.Provider>
      </MemoryRouter>
    </ThemeProvider>,
  )
  return { bar: screen.getByRole('banner'), onHelp }
}
