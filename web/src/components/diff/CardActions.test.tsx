import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CardActions, type CardActionsProps } from './CardActions'

function renderActions(overrides: Partial<CardActionsProps> = {}) {
  const props: CardActionsProps = {
    verdict: 'none',
    pendingReject: false,
    reviewable: true,
    hasDraft: false,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onComment: vi.fn(),
    ...overrides,
  }
  render(<CardActions {...props} />)
  return props
}

describe('CardActions', () => {
  it('names the buttons by aria-label and shows the word with its key from lg up (hidden below)', async () => {
    const props = renderActions()
    const reject = screen.getByRole('button', { name: 'Reject' })
    const comment = screen.getByRole('button', { name: 'Comment' })
    expect(reject).toHaveTextContent('RejectX')
    expect(comment).toHaveTextContent('CommentC')
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveTextContent('ApproveA')
    // Below lg only the icon shows: the labelled span is `hidden lg:inline-flex`.
    expect(reject.querySelector('span[aria-hidden]')).toHaveClass('hidden', 'lg:inline-flex')
    await userEvent.setup().click(reject)
    expect(props.onReject).toHaveBeenCalledOnce()
  })
})
