import { mergeComments, progress, type ReviewItem, type Resolutions, type Review, type SessionDetail } from '@review-dash/shared'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { RailSlotProvider } from '@/components/layout/RailSlot'
import { ShellConfigProvider } from '@/components/layout/ShellConfigProvider'
import { SessionBar } from '@/components/layout/SessionBar'
import { SessionRail } from '@/components/layout/SessionRail'
import { SidebarProvider } from '@/components/layout/SidebarProvider'
import type { UnsavedDraft } from '@/lib/comment-drafts'
import { isTestRunDetail } from '@/lib/detail-kind'
import type { SessionKind } from '@/lib/paths'
import { SessionContext } from '@/lib/session-context'
import { ReviewStateContext, type ReviewContextValue, type SaveStatus } from '@/state/review-context'
import { reviewFixture, SESSION_ID, sessionDetailFixture, testRunDetailFixture } from '@/test/fixtures'
import { ThemeProvider } from '@/theme/ThemeProvider'

export interface ShellOptions {
  /** The session kind to render (default: the detail's kind, else a code review). Picks the shell config and the route prefix (`/s/:id` or `/t/:id`). */
  kind?: SessionKind
  /** Defaults to the code-review fixture, or the test-run fixture when `kind` is `test-run`. */
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
 * The session bar and rail around a page, on the given route (`/s/:id/...`, or `/t/:id/...` for a test run), with a fixed review (no provider,
 * no network). The page can render into the rail with `RailSection`.
 */
export function renderShell(path: string, { kind: kindOption, detail: detailOption, review = reviewFixture(), resolutions = null, saveStatus = 'idle', onHelp = vi.fn(), page = null, unsavedDrafts = [] }: ShellOptions = {}) {
  const kind: SessionKind = kindOption ?? (detailOption && isTestRunDetail(detailOption) ? 'test-run' : 'code-review')
  const detail = detailOption ?? (kind === 'test-run' ? testRunDetailFixture : sessionDetailFixture)
  const items: readonly ReviewItem[] = isTestRunDetail(detail) ? detail.scenarios.map((scenario) => ({ path: scenario.id, fingerprint: scenario.fingerprint })) : detail.tree.files
  const value: ReviewContextValue = {
    state: { review, pendingReject: null, atEnd: false },
    items,
    itemKind: kind === 'test-run' ? 'scenario' : 'file',
    dispatch: vi.fn(),
    comments: mergeComments(review, resolutions),
    commentsFor: () => [],
    fileReview: () => null,
    draftFor: () => '',
    setDraft: () => {},
    unsavedDrafts,
    setVerdict: () => false,
    progress: progress(review, items),
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
            <ShellConfigProvider kind={kind}>
              <Routes>
                <Route
                  path={kind === 'test-run' ? '/t/:id' : '/s/:id'}
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
            </ShellConfigProvider>
          </ReviewStateContext.Provider>
        </SessionContext.Provider>
      </MemoryRouter>
    </ThemeProvider>,
  )
  return { bar: screen.getByRole('banner'), onHelp }
}
