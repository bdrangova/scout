import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AsyncBoundary } from './AsyncBoundary'

describe('AsyncBoundary', () => {
  it('shows a busy placeholder while loading and the children once settled', () => {
    const { rerender } = render(
      <AsyncBoundary loading error={null}>
        <p>Body</p>
      </AsyncBoundary>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
    rerender(
      <AsyncBoundary loading={false} error={null}>
        <p>Body</p>
      </AsyncBoundary>,
    )
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('renders the error as an alert with the label and a Retry button', async () => {
    const onRetry = vi.fn()
    render(
      <AsyncBoundary loading={false} error={new Error('GET /x failed with 500')} onRetry={onRetry} errorLabel="Couldn't load the report">
        <p>Body</p>
      </AsyncBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the report: GET /x failed with 500")
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state instead of the children when empty', () => {
    render(
      <AsyncBoundary loading={false} error={null} empty emptyState={<p>Nothing here</p>}>
        <p>Body</p>
      </AsyncBoundary>,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
  })
})
