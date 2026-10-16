import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommentBox, type CommentBoxProps } from './CommentBox'

const LABEL = 'Comment on badge.tsx'

function renderBox(props: Partial<CommentBoxProps> = {}) {
  const onSubmit = vi.fn()
  const onCancelReject = vi.fn()
  const ui = (overrides: Partial<CommentBoxProps>) => (
    <CommentBox label={LABEL} pendingReject={false} collapsible onSubmit={onSubmit} onCancelReject={onCancelReject} {...props} {...overrides} />
  )
  const result = render(ui({}))
  return { onSubmit, onCancelReject, rerenderWith: (overrides: Partial<CommentBoxProps>) => result.rerender(ui(overrides)) }
}

describe('CommentBox', () => {
  it('starts collapsed when collapsible and opens on click with the textarea focused', async () => {
    renderBox()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: LABEL }))
    const box = screen.getByRole('textbox', { name: LABEL })
    await waitFor(() => expect(box).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled()
  })

  it('asks for a comment, not a change, and keeps a controlled draft open', async () => {
    const onDraftChange = vi.fn()
    const { rerenderWith } = renderBox()
    await userEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveAttribute('placeholder', 'Leave a comment…')
    expect(screen.queryByText('What should change?')).not.toBeInTheDocument()

    // Controlled: typing reports the draft and the textarea shows what the parent holds.
    rerenderWith({ draft: 'Half typed', onDraftChange })
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveValue('Half typed')
    await userEvent.type(screen.getByRole('textbox', { name: LABEL }), '!')
    expect(onDraftChange).toHaveBeenLastCalledWith('Half typed!')
  })

  it('a draft held by the parent opens a collapsible box', () => {
    renderBox({ draft: 'Unsent', onDraftChange: () => {} })
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveValue('Unsent')
  })

  it('opens on a focusToken bump', async () => {
    const { rerenderWith } = renderBox()
    rerenderWith({ focusToken: 1 })
    const box = screen.getByRole('textbox', { name: LABEL })
    await waitFor(() => expect(box).toHaveFocus())
  })

  it('a pending reject forces it open with "Comment & Reject"', () => {
    const { rerenderWith } = renderBox()
    rerenderWith({ pendingReject: true, label: 'Why reject badge.tsx?' })
    expect(screen.getByRole('textbox', { name: 'Why reject badge.tsx?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comment & Reject' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('submitting calls onSubmit and collapses the box again', async () => {
    const { onSubmit } = renderBox()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: LABEL }))
    await user.type(screen.getByRole('textbox', { name: LABEL }), 'Needs a test')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(onSubmit).toHaveBeenCalledWith('Needs a test')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument()
  })

  it('Escape on an empty draft collapses it without cancelling a reject', async () => {
    const { onCancelReject } = renderBox()
    await userEvent.click(screen.getByRole('button', { name: LABEL }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: LABEL }), { key: 'Escape' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(onCancelReject).not.toHaveBeenCalled()
  })

  it('Escape with a draft keeps the box open', async () => {
    renderBox()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: LABEL }))
    await user.type(screen.getByRole('textbox', { name: LABEL }), 'wip')
    fireEvent.keyDown(screen.getByRole('textbox', { name: LABEL }), { key: 'Escape' })
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveValue('wip')
  })

  it('Escape while a reject is pending cancels the reject and stays open', async () => {
    const { onCancelReject } = renderBox({ pendingReject: true })
    const box = screen.getByRole('textbox', { name: LABEL })
    await waitFor(() => expect(box).toHaveFocus())
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onCancelReject).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: LABEL })).toBeInTheDocument()
  })

  it('stays open when not collapsible', async () => {
    const { onSubmit } = renderBox({ collapsible: false })
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: LABEL }), 'Always here')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(onSubmit).toHaveBeenCalledWith('Always here')
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveValue('')
  })
})
