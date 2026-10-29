import { buildPrCommentsResponse } from '@scout/shared'
import { makePrComment, makePrComments } from '@scout/shared/testing/fixtures'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockEventSource, stubEventSource } from '@/test/mock-event-source'
import { SESSION_ID } from '@/test/fixtures'
import { PrCommentsProvider } from './PrCommentsProvider'
import { PrCommentCard } from '@/components/prcomments/PrCommentCard'
import { usePrComments } from './pr-comments-context'

function Probe() {
  const { threads, counts, fileCounts } = usePrComments()
  return (
    <p>
      threads {threads.length} open {counts?.open ?? 'none'} a.tsx {fileCounts.get('src/a.tsx')?.total ?? 0}
    </p>
  )
}

function response(count: number): Response {
  const comments = Array.from({ length: count }, (_, index) => makePrComment({ githubId: index + 1 }))
  return new Response(JSON.stringify(buildPrCommentsResponse(makePrComments(comments), null, null)), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('PrCommentsProvider', () => {
  beforeEach(() => stubEventSource())
  afterEach(() => vi.unstubAllGlobals())

  it('loads the route and refetches on this session\'s pr-comments.updated', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(1)).mockResolvedValueOnce(response(2))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <PrCommentsProvider sessionId={SESSION_ID}>
        <Probe />
      </PrCommentsProvider>,
    )
    expect(await screen.findByText('threads 1 open 1 a.tsx 1')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/sessions/${SESSION_ID}/pr-comments`)

    act(() => MockEventSource.latest('/api/events')?.emit('message', { type: 'pr-comments.updated', sessionId: 'other-session' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => MockEventSource.latest('/api/events')?.emit('message', { type: 'pr-comments.updated', sessionId: SESSION_ID }))
    await waitFor(() => expect(screen.getByText('threads 2 open 2 a.tsx 2')).toBeInTheDocument())
  })

  it('stays empty when the load fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })))
    render(
      <PrCommentsProvider sessionId={SESSION_ID}>
        <Probe />
      </PrCommentsProvider>,
    )
    expect(await screen.findByText('threads 0 open none a.tsx 0')).toBeInTheDocument()
  })

  it('saves a reply typed a moment ago when Submit flushes the boxes, before the debounce fires', async () => {
    const user = userEvent.setup()
    const puts: { url: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          puts.push({ url, body: JSON.parse(String(init.body)) })
          return new Response(JSON.stringify({ commentId: 'rc1', draft: null, updatedAt: '2026-10-05T10:00:00.000Z' }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        return response(1)
      }),
    )
    function Submit() {
      const { threads, flushReplies } = usePrComments()
      const [thread] = threads
      return (
        <>
          <ul>{thread && <PrCommentCard thread={thread} />}</ul>
          <button onClick={() => void flushReplies()}>flush</button>
        </>
      )
    }
    render(
      <PrCommentsProvider sessionId={SESSION_ID}>
        <Submit />
      </PrCommentsProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /^Reply to/ }))
    // No blur: the text is still in the 250 ms debounce when Submit asks every box to save.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Do it' } })
    expect(puts).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'flush' }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ url: `/api/sessions/${SESSION_ID}/pr-replies/rc1`, body: { body: 'Do it' } })
    // The pending debounce was cancelled: no second PUT.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(puts).toHaveLength(1)
  })
})
