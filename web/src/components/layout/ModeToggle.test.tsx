import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { ModeToggle } from './ModeToggle'

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
})
