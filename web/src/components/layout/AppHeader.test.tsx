import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { AppHeader } from './AppHeader'

describe('AppHeader', () => {
  it('renders the slots in order with the theme toggle last, as a banner when asked', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <AppHeader banner leading={<span>Brand</span>} trailing={<button type="button">Archive</button>}>
          <h1>Title</h1>
        </AppHeader>
      </ThemeProvider>,
    )
    const banner = screen.getByRole('banner')
    const order = [screen.getByText('Brand'), screen.getByRole('heading'), screen.getByRole('button', { name: 'Archive' }), screen.getByRole('group', { name: 'Colour theme' })]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(banner).toContainElement(order[3]!)
  })

  it('is a plain div by default, for pages with their own header element', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <header>
          <AppHeader>Inside</AppHeader>
        </header>
      </ThemeProvider>,
    )
    expect(screen.getByRole('banner').firstElementChild?.tagName).toBe('DIV')
  })
})
