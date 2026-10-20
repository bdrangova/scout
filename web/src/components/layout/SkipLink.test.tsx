import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SkipLink } from './SkipLink'

describe('SkipLink', () => {
  it('is the first tab stop and moves focus into the main content', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SkipLink />
        <button type="button">Header button</button>
        <main aria-label="content">
          <button type="button">Card</button>
        </main>
      </>,
    )
    await user.tab()
    const link = screen.getByRole('link', { name: 'Skip to review' })
    expect(link).toHaveFocus()
    fireEvent.click(link)
    expect(screen.getByRole('main')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus()
  })
})
