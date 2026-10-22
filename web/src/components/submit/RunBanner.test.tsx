import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunBanner, type RunBannerProps } from './RunBanner'

const props: RunBannerProps = {
  status: 'running', active: true, resolved: 1, total: 3,
  reconnecting: false, cancelling: false, onCancel: vi.fn(), error: null,
}

describe('Scout run feedback', () => {
  it('shows working Scout for an active run and removes it when the run fails', () => {
    const { container, rerender } = render(<RunBanner {...props} />)
    expect(container.querySelector('picture img')).toHaveAttribute('src', '/brand/scout-working.gif')
    expect(screen.getByText('Claude Code is working on your comments')).toBeInTheDocument()
    rerender(<RunBanner {...props} status="failed" active={false} error="Connection lost" />)
    expect(container.querySelector('picture')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })
})
