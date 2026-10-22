import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { SESSION_ID, sessionDetailFixture, testRunDetailFixture } from '@/test/fixtures'
import { ModeToggle } from './ModeToggle'
import { ShellConfigProvider } from './ShellConfigProvider'

function renderToggle(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <ModeToggle />
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}

describe('ModeToggle', () => {
  it('offers Swipe and Grid and marks the current mode', () => {
    renderToggle(`/s/${SESSION_ID}/files/a.ts?mode=grid`)
    const group = screen.getByRole('group', { name: 'Review mode' })
    const links = group.querySelectorAll('a')
    // The label is the accessible name; every link carries an icon and, from `xl`, the word (hidden below).
    expect([...links].map((link) => link.getAttribute('aria-label'))).toEqual(['Swipe', 'Grid'])
    expect([...links].every((link) => link.querySelector('svg') !== null && link.textContent === link.getAttribute('aria-label') && link.querySelector('span.hidden.xl\\:inline') !== null)).toBe(true)
    expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Swipe' })).not.toHaveAttribute('aria-current')
    // The current file is kept when switching.
    expect(screen.getByRole('link', { name: 'Swipe' })).toHaveAttribute('href', `/s/${SESSION_ID}/files/a.ts?mode=swipe`)
  })

  it('hides Scroll but renders without a selection on ?mode=scroll', () => {
    renderToggle(`/s/${SESSION_ID}/files/a.ts?mode=scroll`)
    expect(screen.queryByRole('link', { name: 'Scroll' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Swipe' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Grid' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', `/s/${SESSION_ID}/files/a.ts?mode=grid`)
  })

  it('points at the files route from another section', () => {
    renderToggle(`/s/${SESSION_ID}/evidence`)
    expect(screen.getByRole('link', { name: 'Swipe' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', `/s/${SESSION_ID}/files?mode=grid`)
  })

  it('keeps the commit scope when switching modes', () => {
    renderToggle(`/s/${SESSION_ID}/files/a.ts?mode=swipe&commit=uncommitted`)
    expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', `/s/${SESSION_ID}/files/a.ts?mode=grid&commit=uncommitted`)
  })

  describe('in a test run', () => {
    function renderRunToggle(path: string, pathname?: string) {
      render(
        <MemoryRouter initialEntries={[path]}>
          <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: testRunDetailFixture, reload: () => {} }}>
            <ShellConfigProvider kind="test-run">
              <ModeToggle pathname={pathname} />
            </ShellConfigProvider>
          </SessionContext.Provider>
        </MemoryRouter>,
      )
    }

    it('writes ?mode= on the review route, keeping the current scenario', () => {
      renderRunToggle(`/t/${SESSION_ID}/review/s2-fail?mode=swipe`)
      expect(screen.getByRole('link', { name: 'Swipe' })).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', `/t/${SESSION_ID}/review/s2-fail?mode=grid`)
    })

    it('points at the review route from another page', () => {
      renderRunToggle(`/t/${SESSION_ID}/overview`)
      expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', `/t/${SESSION_ID}/review?mode=grid`)
    })

    it('reads ?mode=scroll as swipe', () => {
      renderRunToggle(`/t/${SESSION_ID}/review?mode=scroll`)
      expect(screen.getByRole('link', { name: 'Swipe' })).toHaveAttribute('aria-current', 'true')
    })

    it('writes on the page\'s own pathname when given one (Gaps, Logs, Data setup)', () => {
      renderRunToggle(`/t/${SESSION_ID}/gaps`, `/t/${SESSION_ID}/gaps`)
      expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', `/t/${SESSION_ID}/gaps?mode=grid`)
    })
  })
})
