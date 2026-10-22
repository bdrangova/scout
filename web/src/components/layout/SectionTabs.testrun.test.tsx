import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_ID, testRunDetailFixture } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'

const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }))

describe('SectionTabs with the test-run shell config', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the test sections in order, with the pages the index lists and the run counts', () => {
    renderShell(`/t/${SESSION_ID}/overview`, { kind: 'test-run' })
    const names = within(screen.getByRole('navigation', { name: 'Sections' }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'))
    expect(names).toEqual(['Overview', 'Review 3', 'Gaps & bugs 2', 'Logs 1', 'Submit'])
  })

  it('hides the optional pages the index does not list', () => {
    const detail = { ...testRunDetailFixture, index: { ...testRunDetailFixture.index, pages: [] } }
    renderShell(`/t/${SESSION_ID}/overview`, { kind: 'test-run', detail })
    expect(tabs().queryByRole('link', { name: /Gaps/ })).not.toBeInTheDocument()
    expect(tabs().queryByRole('link', { name: /Logs/ })).not.toBeInTheDocument()
    expect(tabs().queryByRole('link', { name: /Data setup/ })).not.toBeInTheDocument()
    expect(tabs().getAllByRole('link')).toHaveLength(3)
  })

  it('shows Data setup when the index lists it', () => {
    const detail = { ...testRunDetailFixture, index: { ...testRunDetailFixture.index, pages: ['data-setup' as const] } }
    renderShell(`/t/${SESSION_ID}/overview`, { kind: 'test-run', detail })
    expect(tabs().getByRole('link', { name: 'Data setup' })).toBeInTheDocument()
  })

  it('links the tabs under /t, marks the current one, has no PR tab and goes back to the test run list', () => {
    renderShell(`/t/${SESSION_ID}/review`, { kind: 'test-run' })
    expect(screen.queryByRole('link', { name: /PR #/ })).not.toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Review 3' })).toHaveAttribute('aria-current', 'page')
    const list = screen.getByRole('link', { name: 'Test runs' })
    expect(list).toHaveAttribute('href', '/t')
  })
})
