import type { SendResponse, SessionDetail } from '@scout/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { stubEventSource } from '@/test/mock-event-source'
import { SubmitPage } from './SubmitPage'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const FILE = sessionDetailFixture.tree.files[0]?.path ?? ''
const SENT_AT = '2026-09-26T18:10:00.000Z'

type Posted = { url: string; body: unknown }

interface Options {
  send?: () => Response
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
    if (method === 'POST') {
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (/\/review\/send$/.test(url)) return options.send?.() ?? json(400, { error: 'nothing to send' })
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

describe('SubmitPage', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('disables Submit until a decision exists, then summarises what it will send', async () => {
    const api = renderSubmit()
    expect(await submitButton()).toBeDisabled()
    // The footer says why the button is off, and stays quiet about an idle agent or the autosave.
    expect(screen.getByText('Pick a decision first')).toBeInTheDocument()
    expect(screen.queryByTestId('send-summary')).not.toBeInTheDocument()
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

  it('creates the overall comment from the textarea', async () => {
    const api = renderSubmit()
    const box = await screen.findByRole('textbox', { name: 'Overall feedback' })
    fireEvent.change(box, { target: { value: 'Matches the plan.' } })
    fireEvent.blur(box)
    await waitFor(() => expect(api.puts.at(-1)?.review.comments[0]).toMatchObject({ target: { kind: 'overall' }, body: 'Matches the plan.' }))
    expect(await screen.findByLabelText('1 open')).toBeInTheDocument()
  })

  it('sends a Desktop session with the current target and copies the command', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const api = renderSubmit(withComment(), { send: () => json(200, sendResponse()) })
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes' }))
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByText(/Send any message in your open Claude Code session/)).toBeInTheDocument()
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`/scout-apply-review ${SESSION_ID}`))
  })

  it('"New session" sends without dispatch, opens the Desktop deep link and shows it in the panel', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const api = renderSubmit(withComment(), { send: () => json(200, sendResponse()) })
    await pickTarget('New session')
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes' }))
    const href = `claude://code/new?q=${encodeURIComponent(`/scout-apply-review ${SESSION_ID}`)}&folder=${encodeURIComponent(sessionDetailFixture.manifest.repo.path)}`
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByRole('link', { name: 'Open in Claude Desktop' })).toHaveAttribute('href', href)
    expect(assign).toHaveBeenCalledWith(href)
  })

  it('sends a CLI session at once (no confirmation), copies the command and shows the pending panel without opening anything', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const api = renderSubmit(withComment(), { detail: cliDetail, send: () => json(200, sendResponse()) })
    expect(await screen.findByRole('radio', { name: /Request changes/ })).toHaveAttribute('aria-checked', 'true')
    await confirmSend()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes' }))
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByText(`/scout-apply-review ${SESSION_ID}`)).toBeInTheDocument()
    expect(within(panel).queryByRole('link', { name: 'Open in Claude Desktop' })).not.toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(`/scout-apply-review ${SESSION_ID}`)
    expect(await within(panel).findByText('The command is on your clipboard.')).toBeInTheDocument()
  })

  it('"New session" from a CLI session shows the Desktop link without opening it', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const api = renderSubmit(withComment(), { detail: cliDetail, send: () => json(200, sendResponse()) })
    await pickTarget('New session')
    await confirmSend()
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes' }))
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
    await waitFor(() => expect(sentBody(api.posts)).toEqual({ decision: 'request-changes' }))
    expect(within(await screen.findByLabelText('Feedback pending')).getByRole('link', { name: 'Open in Claude Desktop' })).toBeInTheDocument()
  })

  it('restores the pending panel in new mode from the URL', async () => {
    renderSubmit(withComment(), { search: '?pending=1&target=new' })
    const panel = await screen.findByLabelText('Feedback pending')
    expect(within(panel).getByRole('link', { name: 'Open in Claude Desktop' })).toBeInTheDocument()
  })

  it('shows a 4xx from the send route inline', async () => {
    renderSubmit(withComment(), { send: () => json(400, { error: 'nothing to send: there are no open comments and no decision' }) })
    await confirmSend()
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing to send')
  })
})
