import { render, screen, waitFor } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, resolutionsFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { SessionContext } from './session-context'
import { useOpenCommentCount } from './useOpenCommentCount'

function Probe({ kind, ref }: { kind: 'spec' | 'evidence'; ref?: string }) {
  return <output data-testid={`${kind}:${ref ?? '*'}`}>{useOpenCommentCount(kind, ref)}</output>
}

describe('useOpenCommentCount', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('counts the open comments of a kind, or of one item of that kind', async () => {
    const review = reviewFixture({
      comments: [
        commentFixture('c1', { kind: 'evidence', ref: 'a.png' }, 'one'),
        commentFixture('c2', { kind: 'evidence', ref: 'b.png' }, 'two'),
        commentFixture('c3', { kind: 'evidence', ref: 'a.png' }, 'resolved', { sentAt: '2026-09-21T12:00:00.000Z' }),
        commentFixture('c4', { kind: 'spec', ref: 'plan.md' }, 'spec'),
      ],
      nextCommentId: 5,
    })
    const resolutions = resolutionsFixture({ c3: { status: 'resolved', note: 'done', at: '2026-09-22T12:00:00.000Z', files: [] } })
    mockReviewApi(reviewResponseFixture(review, resolutions))
    render(
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <ReviewProvider>
          <Probe kind="evidence" />
          <Probe kind="evidence" ref="a.png" />
          <Probe kind="spec" />
        </ReviewProvider>
      </SessionContext.Provider>,
    )
    await waitFor(() => expect(screen.getByTestId('evidence:*')).toHaveTextContent('2'))
    expect(screen.getByTestId('evidence:a.png')).toHaveTextContent('1')
    expect(screen.getByTestId('spec:*')).toHaveTextContent('1')
  })
})
