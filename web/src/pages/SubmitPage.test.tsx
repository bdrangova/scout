import type { AgentRun, SendResponse } from '@review-dash/shared'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { MockEventSource, runEventFactory, stubEventSource } from '@/test/mock-event-source'
import { SubmitPage } from './SubmitPage'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const FILE = sessionDetailFixture.tree.files[0]?.path ?? ''
const SENT_AT = '2026-09-26T18:10:00.000Z'

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-20260926181000-ab12',
    sessionId: SESSION_ID,
    sentAt: SENT_AT,
    adapter: 'fake',
    status: 'running',
    pid: null,
    argv: ['fake-agent'],
    startedAt: SENT_AT,
    endedAt: null,
    exitCode: null,
    agentSessionId: null,
    numTurns: null,
    costUsd: null,
    resultText: null,
    error: null,
    resolvedComments: [],
    ...overrides,
  }
}

type Posted = { url: string; body: unknown }

interface Options {
  send?: () => Response
  runs?: AgentRun[]
  startRun?: () => Response
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function sendResponse(overrides: Partial<SendResponse>): SendResponse {
  return {
    sent: {
      schemaVersion: 2,
      sessionId: SESSION_ID,
      sentAt: SENT_AT,
      decision: 'request-changes',
      tree: { baseSha: sessionDetailFixture.tree.baseSha, headSha: sessionDetailFixture.tree.headSha, branch: sessionDetailFixture.tree.branch },
      patchPath: 'review/sent/2026-09-26T18-10-00.000Z.patch',
      files: [],
      comments: [],
      counts: { files: 6, approved: 0, rejected: 0, commented: 0, unreviewed: 6, openComments: 1 },
    },
    run: null,
    pending: null,
    ...overrides,
  }
}

function renderSubmit(response = reviewResponseFixture(), options: Options = {}) {
  stubEventSource()
  const api = mockReviewApi(response)
  const posts: Posted[] = []
  const base = api.fetchMock.getMockImplementation()
  api.fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    if (method === 'GET' && /\/runs$/.test(url)) return json(200, options.runs ?? [])
    if (method === 'POST') {
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (/\/review\/send$/.test(url)) return options.send?.() ?? json(400, { error: 'nothing to send' })
      if (/\/runs$/.test(url)) return options.startRun?.() ?? json(200, run({ id: 'run-20260926182000-cd34' }))
      if (/\/cancel$/.test(url)) return json(200, { ok: true })
    }
    if (!base) return json(404, { error: 'unmocked' })
    return base(input, init)
  })
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}/submit`]}>
        <Routes>
          <Route
            path="/s/:id"
            element={
              <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
                <ReviewProvider>
                  <Outlet />
                </ReviewProvider>
              </SessionContext.Provider>
            }
          >
            <Route path="submit" element={<SubmitPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
  return { ...api, posts }
}

const withComment = () =>
  reviewResponseFixture(
    reviewFixture({
      comments: [commentFixture('c1', { kind: 'file', ref: FILE }, 'Day count is off by one.')],
      nextCommentId: 2,
    }),
  )

async function submitButton() {
  return screen.findByRole('button', { name: /Submit & send to Claude Code/ })
}

let event = runEventFactory(SENT_AT)

describe('SubmitPage', () => {
  beforeEach(() => {
    event = runEventFactory(SENT_AT)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('disables Submit while there is nothing to send and enables it after a decision', async () => {
    const api = renderSubmit()
    expect(await submitButton()).toBeDisabled()
    // The footer says why the button is off, and stays quiet about an idle agent or the autosave.
    expect(screen.getByText('Pick a decision or leave a comment first')).toBeInTheDocument()
    expect(screen.queryByText(/Claude Code is/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Draft saved/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reviewed/)).not.toBeInTheDocument()
    const pr = screen.getByRole('region', { name: 'PR description' })
    expect(within(pr).getByText('pr-description.md')).toBeInTheDocument()
    expect(within(pr).getByRole('heading', { level: 1, name: 'Trial countdown bar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Request changes/ }))
    expect(screen.getByRole('radio', { name: /Request changes/ })).toHaveAttribute('aria-checked', 'true')
    expect(await submitButton()).toBeEnabled()
    expect(screen.queryByText('Pick a decision or leave a comment first')).not.toBeInTheDocument()
    await waitFor(() => expect(api.puts.at(-1)?.review.overall.decision).toBe('request-changes'))
  })

  it('creates the overall comment from the textarea', async () => {
    const api = renderSubmit()
    const box = await screen.findByRole('textbox', { name: 'Overall feedback' })
    fireEvent.change(box, { target: { value: 'Matches the plan.' } })
    fireEvent.blur(box)
    await waitFor(() => expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({ target: { kind: 'overall' }, body: 'Matches the plan.' }))
    expect(await screen.findByText('1 open')).toBeInTheDocument()
  })

  it('confirms, sends with dispatch, then streams the run and cancels it', async () => {
    const started = run()
    const api = renderSubmit(withComment(), { send: () => json(200, sendResponse({ run: started })) })
    fireEvent.click(await screen.findByRole('radio', { name: /Request changes/ }))
    fireEvent.click(await submitButton())
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Send 1 open comment and request changes to Claude Code?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(api.posts.find((post) => post.url.endsWith('/review/send'))?.body).toEqual({ decision: 'request-changes', dispatch: true }),
    )
    expect(await screen.findByText('Claude Code is working on your comments')).toBeInTheDocument()
    expect(screen.getByText('Claude Code is working')).toBeInTheDocument()
    const source = await waitFor(() => {
      const found = MockEventSource.latest(`/api/runs/${started.id}/events`)
      expect(found).toBeDefined()
      return found as MockEventSource
    })

    source.emit('run', event({ type: 'status', status: 'running' }))
    source.emit('run', event({ type: 'partial', text: 'Six comm' }))
    expect(await screen.findByText('Six comm')).toBeInTheDocument()
    source.emit('run', event({ type: 'partial', text: 'ents.' }))
    expect(await screen.findByText('Six comments.')).toBeInTheDocument()
    source.emit('run', event({ type: 'assistant_text', text: 'Six comments. Starting with the day count.' }))
    expect(await screen.findByText('Six comments. Starting with the day count.')).toBeInTheDocument()
    expect(screen.queryByText('Six comments.')).not.toBeInTheDocument()

    source.emit('run', event({ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'git commit -am "x"' } }))
    const tool = await screen.findByLabelText('Tool Bash')
    expect(within(tool).getByText('git commit -am "x"')).toBeInTheDocument()
    expect(within(tool).getByText('running')).toBeInTheDocument()
    source.emit('run', event({ type: 'tool_result', toolUseId: 'toolu_1', text: 'Permission to use Bash was denied', isError: true }))
    expect(await within(tool).findByText('denied')).toBeInTheDocument()
    fireEvent.click(within(tool).getByRole('button', { expanded: false }))
    expect(within(tool).getByText('Permission to use Bash was denied')).toBeInTheDocument()

    source.emit('run', event({ type: 'stderr', line: 'warning: slow' }))
    expect(await screen.findByText('warning: slow')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(api.posts.some((post) => post.url.endsWith(`/runs/${started.id}/cancel`))).toBe(true))

    source.emit('run', event({ type: 'result', isError: false, text: 'All done.', costUsd: 0.42, numTurns: 6, durationMs: 134_000 }))
    const result = await screen.findByLabelText('Run result')
    expect(within(result).getByText('turn 6 · $0.42 · 2m 14s')).toBeInTheDocument()

    source.emit('run', event({ type: 'status', status: 'succeeded' }))
    source.emit('end', run({ status: 'succeeded', endedAt: '2026-09-26T18:12:14.000Z', costUsd: 0.42, numTurns: 6 }))
    expect(await screen.findByText('Claude Code finished working on your comments')).toBeInTheDocument()
    expect(source.closed).toBe(true)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the pending panel and starts a fork from it', async () => {
    const api = renderSubmit(withComment(), {
      send: () => json(200, sendResponse({ pending: { reason: 'the Claude Code session is still open' } })),
    })
    fireEvent.click(await submitButton())
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' }))
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByText('the Claude Code session is still open')).toBeInTheDocument()
    expect(within(panel).getByText(`/apply-review ${SESSION_ID}`)).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Run as fork' }))
    await waitFor(() => expect(api.posts.find((post) => /\/runs$/.test(post.url))?.body).toEqual({ fork: true }))
    expect(await screen.findByText('Claude Code is working on your comments')).toBeInTheDocument()
  })

  it('shows a 4xx from the send route inline', async () => {
    renderSubmit(withComment(), { send: () => json(400, { error: 'nothing to send: there are no open comments and no decision' }) })
    fireEvent.click(await submitButton())
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing to send')
  })

  it('surfaces a 409 from Run as fork inside the panel', async () => {
    renderSubmit(withComment(), {
      send: () => json(200, sendResponse({ pending: { reason: 'still open' } })),
      startRun: () => json(409, { error: 'run run-20260926181000-ab12 is already active for session' }),
    })
    fireEvent.click(await submitButton())
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send' }))
    const panel = await screen.findByLabelText('Feedback pending')
    fireEvent.click(within(panel).getByRole('button', { name: 'Run as fork' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('already active')
  })

  it('lists previous runs newest first and replays one on click', async () => {
    const older = run({ id: 'run-20260926170000-0001', startedAt: '2026-09-26T17:00:00.000Z', endedAt: '2026-09-26T17:01:00.000Z', status: 'failed', costUsd: 0.1 })
    const newer = run({ id: 'run-20260926180000-0002', startedAt: '2026-09-26T18:00:00.000Z', endedAt: '2026-09-26T18:02:00.000Z', status: 'succeeded', costUsd: 0.3 })
    renderSubmit(withComment(), { runs: [older, newer] })
    const list = await screen.findByLabelText('Previous runs')
    const rows = within(list).getAllByRole('button')
    expect(rows[0]).toHaveTextContent(newer.id)
    expect(rows[0]).toHaveTextContent('$0.30')
    expect(rows[1]).toHaveTextContent(older.id)
    fireEvent.click(rows[1] as HTMLElement)
    const source = await waitFor(() => {
      const found = MockEventSource.latest(`/api/runs/${older.id}/events`)
      expect(found).toBeDefined()
      return found as MockEventSource
    })
    source.emit('run', event({ type: 'assistant_text', text: 'Replayed line.' }))
    source.emit('end', older)
    expect(await screen.findByText('Replayed line.')).toBeInTheDocument()
    expect(screen.getByText('The Claude Code run failed')).toBeInTheDocument()
  })
})
