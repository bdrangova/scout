import type { AgentRun } from '@review-dash/shared'
import { mergeComments } from '@review-dash/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnsavedDraft } from '@/lib/comment-drafts'
import { commentFixture, reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'
import { SubmitRailSection } from './SubmitRailSection'

const FILE = sessionDetailFixture.tree.files[0]?.path ?? ''
const review = reviewFixture({
  comments: [
    commentFixture('c1', { kind: 'file', ref: FILE }, 'first'),
    commentFixture('c2', { kind: 'file', ref: FILE, anchor: { side: 'new', line: 2 } }, 'second'),
    commentFixture('c3', { kind: 'spec', ref: 'plan.md' }, 'spec'),
  ],
})

function run(id: string, startedAt: string, overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id,
    sessionId: SESSION_ID,
    sentAt: startedAt,
    adapter: 'fake',
    status: 'succeeded',
    pid: null,
    argv: [],
    startedAt,
    endedAt: startedAt,
    exitCode: 0,
    agentSessionId: null,
    numTurns: null,
    costUsd: null,
    resultText: null,
    error: null,
    resolvedComments: [],
    ...overrides,
  }
}

function renderRail(runs: AgentRun[] = [], onSelectRun = vi.fn(), selectedRunId: string | null = null, unsavedDrafts: UnsavedDraft[] = []) {
  const page = (
    <SubmitRailSection
      comments={mergeComments(review, null)}
      review={review}
      detail={sessionDetailFixture}
      runs={runs}
      selectedRunId={selectedRunId}
      onSelectRun={onSelectRun}
    />
  )
  renderShell(`/s/${SESSION_ID}/submit`, { review, page, unsavedDrafts })
  return within(screen.getByRole('complementary', { name: 'Session panel' }))
}

describe('SubmitRailSection', () => {
  it('warns about comments typed but not added, with a link to each file, and nothing otherwise', () => {
    const rail = renderRail([], vi.fn(), null, [{ kind: 'file', ref: FILE }, { kind: 'spec', ref: 'plan.md' }])
    const notice = rail.getByTestId('unsaved-drafts')
    expect(notice).toHaveTextContent('2 comments typed but not added')
    expect(within(notice).getAllByRole('link')[0]).toHaveAttribute('href', `/s/${SESSION_ID}/files/${FILE}`)
  })

  it('shows no warning when nothing is typed', () => {
    expect(renderRail().queryByTestId('unsaved-drafts')).not.toBeInTheDocument()
  })

  it('summarises what will be sent and links the files that carry comments', () => {
    const rail = renderRail()
    const summary = rail.getByRole('region', { name: 'Will be sent' })
    expect(within(summary).getByText('2 comments · 1 file')).toBeInTheDocument()
    expect(within(summary).getByText('1 of them')).toBeInTheDocument()
    const link = within(summary).getByRole('link', { name: new RegExp(FILE.split('/').pop() ?? '') })
    expect(link).toHaveAttribute('href', expect.stringContaining('/files/'))
  })

  it('says so when nothing is open', () => {
    const empty = reviewFixture()
    renderShell(`/s/${SESSION_ID}/submit`, {
      review: empty,
      page: <SubmitRailSection comments={[]} review={empty} detail={sessionDetailFixture} runs={[]} selectedRunId={null} onSelectRun={vi.fn()} />,
    })
    expect(screen.getByText(/No open comments/)).toBeInTheDocument()
    expect(screen.getByText('Nothing sent yet')).toBeInTheDocument()
  })

  it('lists the runs newest first, numbered, with the failure reason, and selects one on click', () => {
    const onSelect = vi.fn()
    const failed = run('run-b', '2026-09-26T19:00:00.000Z', { status: 'failed', exitCode: 1, error: 'workspace trust check' })
    const ok = run('run-a', '2026-09-26T18:00:00.000Z', { resolvedComments: ['c1'] })
    const rail = renderRail([ok, failed], onSelect, 'run-a')
    const history = rail.getByRole('region', { name: 'Run history' })
    const buttons = within(history).getAllByRole('button')
    expect(buttons[0]).toHaveTextContent('Run 2 · failed')
    expect(buttons[0]).toHaveTextContent('workspace trust check')
    expect(buttons[1]).toHaveTextContent('Run 1 · succeeded')
    expect(buttons[1]).toHaveTextContent('resolved 1 comment')
    expect(buttons[1]).toHaveAttribute('aria-current', 'true')
    fireEvent.click(buttons[0] as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith(failed)
  })
})
