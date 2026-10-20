import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { SessionErrorBar } from './SessionErrorBar'

describe('SessionErrorBar', () => {
  it('has Sessions, the session id and the theme, nothing else', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <SessionErrorBar id="20260920-0800-qi-15301-a7c1" />
        </MemoryRouter>
      </ThemeProvider>,
    )
    const bar = screen.getByRole('banner')
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/')
    expect(bar).toHaveTextContent('20260920-0800-qi-15301-a7c1')
    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
