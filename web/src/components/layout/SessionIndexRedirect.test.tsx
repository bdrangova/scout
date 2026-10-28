import type { SessionDetail } from '@scout/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionLayout } from '@/pages/SessionLayout'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi, urlOf } from '@/test/mock-api'
import { stubEventSource } from '@/test/mock-event-source'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { SessionIndexRedirect } from './SessionIndexRedirect'

function Page({ name }: { name: string }) {
  const { pathname } = useLocation()
  return <p>{`${name} page at ${pathname}`}</p>
}

function renderIndex(review = reviewFixture(), detail: SessionDetail = sessionDetailFixture) {
  stubEventSource()
  const api = mockReviewApi(reviewResponseFixture(review))
  const base = api.fetchMock.getMockImplementation()
  api.fetchMock.mockImplementation(async (input, init) => {
    if ((init?.method ?? 'GET') === 'GET' && urlOf(input).endsWith(`/sessions/${SESSION_ID}`)) {
      return new Response(JSON.stringify(detail), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return base ? base(input, init) : new Response('{}', { status: 404 })
  })
  render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}`]}>
        <Routes>
          <Route path="/s/:id" element={<SessionLayout />}>
            <Route index element={<SessionIndexRedirect />} />
            {['spec', 'extras', 'evidence', 'files', 'submit'].map((name) => (
              <Route key={name} path={name} element={<Page name={name} />} />
            ))}
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('SessionIndexRedirect', () => {
  beforeEach(() => window.localStorage.clear())
  afterAll(() => vi.unstubAllGlobals())

  it('opens an untouched session on its first section with content, replacing the index entry', async () => {
    renderIndex()
    expect(await screen.findByText(`spec page at /s/${SESSION_ID}/spec`)).toBeInTheDocument()
  })

  it('waits for the review before choosing (no other page shows first)', async () => {
    renderIndex(reviewFixture({ comments: [commentFixture('c1', { kind: 'extra', ref: 'architecture.md' }, 'x')], nextCommentId: 2 }))
    expect(screen.queryByText(/ page at /)).not.toBeInTheDocument()
    expect(await screen.findByText(`extras page at /s/${SESSION_ID}/extras`)).toBeInTheDocument()
    expect(screen.queryByText(/^spec page/)).not.toBeInTheDocument()
  })

  it('opens files for a session with no spec, extras or evidence', async () => {
    renderIndex(reviewFixture(), { ...sessionDetailFixture, spec: [], extras: [], evidence: [] })
    expect(await screen.findByText(`files page at /s/${SESSION_ID}/files`)).toBeInTheDocument()
  })
})
