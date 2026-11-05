import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { testRunSummary } from '@/test/fixtures'
import { ThemeProvider } from '@/theme'
import { TestRunRow } from './TestRunRow'

function renderRow(overrides: Parameters<typeof testRunSummary>[0], onArchive = vi.fn()) {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/t']}>
        <Routes>
          <Route path="/t" element={<ul><TestRunRow session={testRunSummary(overrides)} onArchive={onArchive} /></ul>} />
          <Route path="/t/:id" element={<p>Run route</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
  return onArchive
}

const base = { id: '20261021-1100-demo-ab12', title: 'Demo feature test run' }

describe('TestRunRow', () => {
  it('shows compact scenario totals and folder metadata, without branch or feature rows', () => {
    renderRow({ ...base, tickets: [{ key: 'QI-1', url: null }] })
    const row = screen.getByRole('link', { name: 'Demo feature test run' })
    expect(within(row).queryByLabelText('Feature and area')).not.toBeInTheDocument()
    expect(within(row).queryByLabelText('Base and current branch')).not.toBeInTheDocument()
    expect(within(row).getByTitle('/Users/bojana/Projects/qbdvision')).toHaveTextContent('qbdvision')
    expect(within(row).getByText('1 Pass')).toBeInTheDocument()
    expect(within(row).getByText('1 Fail')).toBeInTheDocument()
    expect(within(row).getByText('1 Gap')).toBeInTheDocument()
    expect(within(row).queryByText(/n\/a/)).not.toBeInTheDocument()
    expect(within(row).getByText('3 scenarios')).toBeInTheDocument()
    expect(within(row).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(row).getByText('QI-1')).toBeInTheDocument()
  })

  it('reads its status from the shared status wording', () => {
    renderRow({ ...base, status: 'ready', reviewed: 3 })
    expect(screen.getByLabelText('Ready to submit')).toHaveAttribute('data-status', 'ready')
  })

  it('shows the plain total when no scenario has a verdict-worthy status', () => {
    renderRow({ ...base, counts: { scenarios: 2, pass: 0, fail: 0, gap: 0, na: 0, blocked: 0, uncertain: 0, planned: 2 }, total: 2 })
    expect(screen.getByText('2 Planned')).toBeInTheDocument()
    expect(screen.getByText('2 scenarios')).toBeInTheDocument()
  })

  it('opens the run on click and archives without opening it', async () => {
    const user = userEvent.setup()
    const onArchive = renderRow(base)
    await user.click(screen.getByRole('button', { name: 'Archive Demo feature test run' }))
    expect(onArchive).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Run route')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Demo feature test run' }))
    expect(screen.getByText('Run route')).toBeInTheDocument()
  })
})
