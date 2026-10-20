import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { ReviewComplete } from './ReviewComplete'

function renderPanel(detail = sessionDetailFixture) {
  const onBack = vi.fn()
  render(
    <MemoryRouter>
      <ReviewComplete sessionId={SESSION_ID} detail={detail} onBack={onBack}>
        <article aria-label="the card">
          <button type="button">Approve</button>
        </article>
      </ReviewComplete>
    </MemoryRouter>,
  )
  return onBack
}

describe('ReviewComplete', () => {
  it('links to the filled sections with their counts and to Submit, and hides the view behind it', () => {
    renderPanel()
    expect(screen.getByRole('heading', { level: 2, name: 'Review complete' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Evidence 2' })).toHaveAttribute('href', `/s/${SESSION_ID}/evidence`)
    expect(screen.getByRole('link', { name: 'Spec 1' })).toHaveAttribute('href', `/s/${SESSION_ID}/spec`)
    expect(screen.getByRole('link', { name: 'Extras 1' })).toHaveAttribute('href', `/s/${SESSION_ID}/extras`)
    expect(screen.getByRole('link', { name: 'Submit' })).toHaveAttribute('href', `/s/${SESSION_ID}/submit`)
    // Icon-first: the word is the tooltip, the count is what shows.
    expect(screen.getByRole('link', { name: 'Evidence 2' })).toHaveAttribute('title', 'Evidence')
    expect(screen.getByRole('link', { name: 'Evidence 2' })).toHaveTextContent('2')

    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    const card = screen.getByRole('article', { hidden: true })
    const backdrop = card.parentElement
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop).toHaveAttribute('inert')
    expect(backdrop?.closest('[data-review-complete]')).not.toBeNull()
  })

  it('skips the empty sections and calls back from "Back to files"', () => {
    const onBack = renderPanel({ ...sessionDetailFixture, evidence: [], extras: [] })
    expect(screen.queryByRole('link', { name: /^Evidence/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Extras/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Spec 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to files' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
