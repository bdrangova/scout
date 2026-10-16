import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PendingPanel, type PendingPanelProps } from './PendingPanel'

const SESSION_ID = '20260926-1200-qi-15472-trial-bar-f1a0'
const REPO = '/Users/bojana/Projects/qbdvision'

function renderPanel(overrides: Partial<PendingPanelProps> = {}) {
  const onRun = vi.fn()
  render(<PendingPanel sessionId={SESSION_ID} repoPath={REPO} mode="current" reason={null} onRun={onRun} {...overrides} />)
  return { panel: screen.getByLabelText('Feedback pending'), onRun }
}

describe('PendingPanel', () => {
  it('in current mode points at the open session, with Copy command first and no Desktop link', () => {
    const { panel } = renderPanel({ reason: 'the Claude Code session is still open' })
    expect(within(panel).getByText('the Claude Code session is still open')).toBeInTheDocument()
    expect(within(panel).getByText(/Send any message in your open Claude Code session/)).toBeInTheDocument()
    const buttons = within(panel).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Copy command', 'Run as fork'])
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
  })

  it('in new mode leads with the Desktop deep link and skips the reason line', () => {
    const { panel } = renderPanel({ mode: 'new' })
    const link = within(panel).getByRole('link', { name: 'Open in Claude Desktop' })
    expect(link).toHaveAttribute(
      'href',
      `claude://code/new?q=${encodeURIComponent(`/apply-review ${SESSION_ID}`)}&folder=${encodeURIComponent(REPO)}`,
    )
    expect(within(panel).getByText(/confirm it there/)).toBeInTheDocument()
    expect(within(panel).getAllByRole('button').map((button) => button.textContent)).toEqual(['Copy command', 'Run as fork'])
  })

  it('copies the command and reports a clipboard failure inline', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { panel } = renderPanel()
    fireEvent.click(within(panel).getByRole('button', { name: 'Copy command' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`/apply-review ${SESSION_ID}`))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Could not copy')
    vi.unstubAllGlobals()
  })
})
