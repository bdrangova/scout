import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewStateContext, type ReviewContextValue } from './review-context'
import { useCommentActions, type CommentActions } from './useCommentActions'

function Probe({ onRender }: { onRender: (actions: CommentActions) => void }) {
  onRender(useCommentActions())
  return <span>probe</span>
}

function renderProbe() {
  const dispatch = vi.fn()
  const seen: CommentActions[] = []
  const value = { dispatch } as unknown as ReviewContextValue
  // A fresh element tree each time, so the rerender reaches the probe.
  const ui = () => (
    <ReviewStateContext.Provider value={value}>
      <Probe onRender={(actions) => seen.push(actions)} />
    </ReviewStateContext.Provider>
  )
  const view = render(ui())
  return { dispatch, seen, rerender: () => view.rerender(ui()) }
}

describe('useCommentActions', () => {
  it('dispatches the four comment actions to the review context', () => {
    const { dispatch, seen } = renderProbe()
    const actions = seen[0]
    if (!actions) throw new Error('hook did not render')
    actions.onEdit('c1', 'Better wording.')
    actions.onDelete('c2')
    actions.onResolve('c3')
    actions.onReopen('c4')
    expect(dispatch.mock.calls.map((call) => call[0])).toEqual([
      { type: 'EDIT_COMMENT', id: 'c1', body: 'Better wording.' },
      { type: 'DELETE_COMMENT', id: 'c2' },
      { type: 'RESOLVE_COMMENT', id: 'c3' },
      { type: 'REOPEN_COMMENT', id: 'c4' },
    ])
  })

  it('returns the same handlers across renders while dispatch is stable', () => {
    const { seen, rerender } = renderProbe()
    rerender()
    expect(screen.getByText('probe')).toBeInTheDocument()
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.at(-1)).toBe(seen[0])
  })
})
