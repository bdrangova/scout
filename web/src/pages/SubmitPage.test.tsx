import type { AgentRun, SendResponse, SessionDetail } from '@review-dash/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  detail?: SessionDetail
  /** Route params to start on (e.g. a pending state surviving a reload). */
  search?: string
}

/** The fixture session, but started from the CLI instead of Claude Desktop. */
const cliDetail: SessionDetail = {
  ...sessionDetailFixture,
  manifest: { ...sessionDetailFixture.manifest, agent: { ...sessionDetailFixture.manifest.agent, entrypoint: 'cli' } },
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function sendResponse(overrides: Partial<SendResponse> = {}): SendResponse {
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
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}/submit${options.search ?? ''}`]}>
        <Routes>
          <Route
            path="/s/:id"
            element={
              <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: options.detail ?? sessionDetailFixture, reload: () => {} }}>
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
      overall: { ...reviewFixture().overall, decision: 'request-changes' },
    }),
  )

async function submitButton() {
  return screen.findByRole('button', { name: /Submit to (current|new) session/ })
}

async function pickTarget(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Send options' }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name: new RegExp(`^${name}`) }))
}

async function confirmSend() {
  fireEvent.click(await submitButton())
}

const sentBody = (posts: Posted[]) => posts.find((post) => post.url.endsWith('/review/send'))?.body

let event = runEventFactory(SENT_AT)

describe('SubmitPage', () => {
  beforeEach(() => {
    event = runEventFactory(SENT_AT)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('disables Submit until a decision exists, then summarises what it will send', async () => {
    const api = renderSubmit()
    expect(await submitButton()).toBeDisabled()
    // The footer says why the button is off, and stays quiet about an idle agent or the autosave.
    expect(screen.getByText('Pick a decision first')).toBeInTheDocument()
    expect(screen.queryByTestId('send-summary')).not.toBeInTheDocument()
    expect(screen.queryByText(/Claude Code is/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Draft saved/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reviewed/)).not.toBeInTheDocument()
    const pr = screen.getByRole('region', { name: 'PR description' })
    expect(within(pr).getByText('pr-description.md')).toBeInTheDocument()
    expect(within(pr).getByRole('heading', { level: 1, name: 'Trial countdown bar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Request changes/ }))
    expect(screen.getByRole('radio', { name: /Request changes/ })).toHaveAttribute('aria-checked', 'true')
    expect(await submitButton()).toBeEnabled()
    expect(screen.queryByText('Pick a decision first')).not.toBeInTheDocument()
    expect(screen.getByTestId('send-summary')).toHaveTextContent(`Send no comments + Request changes to the current session · ${sessionDetailFixture.tree.files.length} files not reviewed`)
    // Clicking the chosen decision again clears it and disables Submit.
    fireEvent.click(screen.getByRole('radio', { name: /Request changes/ }))
    expect(screen.getByRole('radio', { name: /Request changes/ })).toHaveAttribute('aria-checked', 'false')
    expect(await submitButton()).toBeDisabled()
    await waitFor(() => expect(api.puts.at(-1)?.review.overall).toEqual({ decision: 'undecided', cleared: true }))
  })

  it('keeps an explicitly cleared decision unselected after loading Submit again', async () => {
    const files = Object.fromEntries(sessionDetailFixture.tree.files.map((file) => [file.path, { verdict: 'approved' as const, fingerprint: file.fingerprint, viewed: true }]))
    renderSubmit(reviewResponseFixture(reviewFixture({ files, overall: { decision: 'undecided', cleared: true } })))
    expect(await submitButton()).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Approve/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('pre-selects Request changes when a file is rejected and Approve when every file is approved', async () => {
    const files = sessionDetailFixture.tree.files
    const verdict = (verdictOf: (index: number) => 'approved' | 'rejected') =>
      Object.fromEntries(files.map((file, index) => [file.path, { verdict: verdictOf(index), fingerprint: file.fingerprint, viewed: true }]))
    renderSubmit(reviewResponseFixture(reviewFixture({ files: verdict((index) => (index === 0 ? 'rejected' : 'approved')) })))
    expect(await screen.findByRole('radio', { name: /Request changes/ })).toHaveAttribute('aria-checked', 'true')
    cleanup()
    renderSubmit(reviewResponseFixture(reviewFixture({ files: verdict(() => 'approved') })))
    expect(await screen.findByRole('radio', { name: /^Approve/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('send-summary')).toHaveTextContent('Send no comments + Approve to the current session')
    expect(screen.getByTestId('send-summary')).not.toHaveTextContent('not reviewed')
  })

  it('saves the overall feedback typed a moment ago before it sends, so the send includes it', async () => {
    const savedAtSend: string[][] = []
    let api: ReturnType<typeof renderSubmit> | null = null
    api = renderSubmit(withComment(), {
      send: () => {
        savedAtSend.push((api?.puts.at(-1)?.review.comments ?? []).map((comment) => comment.body))
        return json(200, sendResponse())
      },
    })
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'Overall feedback' }), 'Ship it after the rename.')
    // Clicking Submit blurs the field (committing the comment) and sends in the same breath.
    await user.click(await submitButton())

    await waitFor(() => expect(savedAtSend).toHaveLength(1))
    expect(savedAtSend[0]).toContain('Ship it after the rename.')
  })

  it('does not send when the save before it hits a conflict, and says so', async () => {
    const api = renderSubmit(withComment())
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'Overall feedback' }), 'Late thought.')
    api.queuePut({ ok: false, kind: 'conflict', current: reviewFixture({ nextCommentId: 5 }) })
    await user.click(await submitButton())

    expect(await screen.findByText(/nothing was sent/)).toBeInTheDocument()
    expect(sentBody(api.posts)).toBeUndefined()
  })

  it('describes the send targets in the menu', async () => {
    renderSubmit(withComment())
    fireEvent.click(await screen.findByRole('button', { name: 'Send options' }))
    const current = await screen.findByRole('menuitemradio', { name: /Current session/ })
    expect(current).toHaveTextContent('Continue the Claude Code session that wrote this')
    expect(screen.getByRole('menuitemradio', { name: /New session/ })).toHaveTextContent('Open a fresh Claude Desktop session')
  })

  it('shows a failed latest run at the top with its error and retries by sending again', async () => {
    const failed = run({ status: 'failed', endedAt: '2026-09-26T18:10:30.000Z', error: 'claude exited with code 1\nstack line' })
    const api = renderSubmit(withComment(), { runs: [failed], send: () => json(200, sendResponse({ run: run({ id: 'run-20260926182000-ab13', startedAt: '2026-09-26T18:20:00.000Z' }) })) })
    const notice = await screen.findByRole('region', { name: 'Run failed' })
    expect(within(notice).getByText('claude exited with code 1')).toBeInTheDocument()
    expect(within(notice).queryByText('stack line')).not.toBeInTheDocument()
    fireEvent.click(within(notice).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: false }))
  })

  it('creates the overall comment from the textarea', async () => {
    const api = renderSubmit()
    const box = await screen.findByRole('textbox', { name: 'Overall feedback' })
    fireEvent.change(box, { target: { value: 'Matches the plan.' } })
    fireEvent.blur(box)
    await waitFor(() => expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({ target: { kind: 'overall' }, body: 'Matches the plan.' }))
    expect(await screen.findByLabelText('1 open')).toBeInTheDocument()
  })

  it('sends at once (no confirmation) with dispatch for a CLI session, then streams the run and cancels it', async () => {
    const started = run()
    const api = renderSubmit(withComment(), { detail: cliDetail, send: () => json(200, sendResponse({ run: started })) })
    expect(await screen.findByRole('radio', { name: /Request changes/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(await submitButton())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: true }))
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
      detail: cliDetail,
      send: () => json(200, sendResponse({ pending: { reason: 'the Claude Code session is still open' } })),
    })
    await confirmSend()
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByText('the Claude Code session is still open')).toBeInTheDocument()
    expect(within(panel).getByText(`/apply-review ${SESSION_ID}`)).toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: 'Open in Claude Desktop' })).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Run as fork' }))
    await waitFor(() => expect(api.posts.find((post) => /\/runs$/.test(post.url))?.body).toEqual({ fork: true }))
    expect(await screen.findByText('Claude Code is working on your comments')).toBeInTheDocument()
  })

  it('sends a Desktop session without a headless run and copies the command', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const api = renderSubmit(withComment(), { send: () => json(200, sendResponse()) })
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: false }))
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByText(/Send any message in your open Claude Code session/)).toBeInTheDocument()
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`/apply-review ${SESSION_ID}`))
  })

  it('"New session" sends without dispatch, opens the Desktop deep link and shows it in the panel', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const api = renderSubmit(withComment(), { send: () => json(200, sendResponse()) })
    await pickTarget('New session')
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: false }))
    const href = `claude://code/new?q=${encodeURIComponent(`/apply-review ${SESSION_ID}`)}&folder=${encodeURIComponent(sessionDetailFixture.manifest.repo.path)}`
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByRole('link', { name: 'Open in Claude Desktop' })).toHaveAttribute('href', href)
    expect(assign).toHaveBeenCalledWith(href)
  })

  it('"New session" from a CLI session shows the Desktop link without opening it', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const api = renderSubmit(withComment(), { detail: cliDetail, send: () => json(200, sendResponse()) })
    await pickTarget('New session')
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: false }))
    expect(within(await screen.findByLabelText('Feedback pending')).getByRole('link', { name: 'Open in Claude Desktop' })).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('disables "Current session" and defaults to a new one for a Desktop session without an agent session id', async () => {
    const detail: SessionDetail = {
      ...sessionDetailFixture,
      manifest: { ...sessionDetailFixture.manifest, agent: { ...sessionDetailFixture.manifest.agent, sessionId: null } },
    }
    const api = renderSubmit(withComment(), { detail, send: () => json(200, sendResponse()) })
    fireEvent.click(await screen.findByRole('button', { name: 'Send options' }))
    expect(await screen.findByRole('menuitemradio', { name: /^Current session/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: false }))
    expect(within(await screen.findByLabelText('Feedback pending')).getByRole('link', { name: 'Open in Claude Desktop' })).toBeInTheDocument()
  })

  it('keeps the headless default for a CLI session without an agent session id (the server decides)', async () => {
    const detail: SessionDetail = {
      ...cliDetail,
      manifest: { ...cliDetail.manifest, agent: { ...cliDetail.manifest.agent, sessionId: null } },
    }
    const api = renderSubmit(withComment(), { detail, send: () => json(200, sendResponse({ run: run() })) })
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes', dispatch: true }))
  })

  it('restores the pending panel in new mode from the URL', async () => {
    renderSubmit(withComment(), { search: '?pending=saved&target=new' })
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByRole('link', { name: 'Open in Claude Desktop' })).toBeInTheDocument()
    expect(within(panel).queryByText('saved')).not.toBeInTheDocument()
  })

  it('shows a 4xx from the send route inline', async () => {
    renderSubmit(withComment(), { send: () => json(400, { error: 'nothing to send: there are no open comments and no decision' }) })
    await confirmSend()
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing to send')
  })

  it('surfaces a 409 from Run as fork inside the panel', async () => {
    renderSubmit(withComment(), {
      detail: cliDetail,
      send: () => json(200, sendResponse({ pending: { reason: 'still open' } })),
      startRun: () => json(409, { error: 'run run-20260926181000-ab12 is already active for session' }),
    })
    await confirmSend()
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
