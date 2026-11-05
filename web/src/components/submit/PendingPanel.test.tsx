import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PendingPanel, type PendingPanelProps } from './PendingPanel'

const SESSION_ID = '20260926-1200-qi-15472-trial-bar-f1a0'
const REPO = '/Users/bojana/Projects/qbdvision'

function renderPanel(overrides: Partial<PendingPanelProps> = {}) {
  render(<PendingPanel sessionId={SESSION_ID} repoPath={REPO} mode="current" {...overrides} />)
  return { panel: screen.getByLabelText('Feedback pending') }
}

describe('PendingPanel', () => {
  it('in current mode points at the open session, with Copy command and no Desktop link', () => {
    const { panel } = renderPanel()
    expect(within(panel).getByText(/Send any message in your open Claude Code session/)).toBeInTheDocument()
    expect(within(panel).getAllByRole('button').map((button) => button.textContent)).toEqual(['Copy command'])
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
  })

  it('in new mode leads with the Desktop deep link', () => {
    const { panel } = renderPanel({ mode: 'new' })
    const link = within(panel).getByRole('link', { name: 'Open in Claude Desktop' })
    expect(link).toHaveAttribute(
      'href',
      `claude://code/new?q=${encodeURIComponent(`/scout-apply-review ${SESSION_ID}`)}&folder=${encodeURIComponent(REPO)}`,
    )
    expect(within(panel).getByText(/confirm it there/)).toBeInTheDocument()
    expect(within(panel).getAllByRole('button').map((button) => button.textContent)).toEqual(['Copy command'])
  })

  it('copies the command and reports a clipboard failure inline', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { panel } = renderPanel()
    fireEvent.click(within(panel).getByRole('button', { name: 'Copy command' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`/scout-apply-review ${SESSION_ID}`))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Could not copy')
    vi.unstubAllGlobals()
  })
})
