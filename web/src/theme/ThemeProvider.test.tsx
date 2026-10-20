import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from './theme'

function mockMatchMedia(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('follows prefers-color-scheme when the setting is system', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('persists an explicit choice and applies .dark on <html>', async () => {
    mockMatchMedia(false)
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(document.documentElement).not.toHaveClass('dark')
    await user.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Light' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('reads the stored setting on mount', () => {
    mockMatchMedia(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveClass('dark')
  })
})
