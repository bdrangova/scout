import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VerdictBar } from './VerdictBar'

describe('VerdictBar', () => {
  it('is one image named by the verdict summary', () => {
    render(<VerdictBar summary={{ approved: 3, rejected: 1, commented: 1, notReviewed: 3 }} />)
    expect(screen.getByRole('img', { name: '3 approved · 1 rejected · 1 commented · 3 not reviewed' })).toBeInTheDocument()
  })

  it('sizes each verdict’s segment by its share and leaves the rest empty', () => {
    render(<VerdictBar summary={{ approved: 2, rejected: 1, commented: 0, notReviewed: 1 }} />)
    const segments = screen.getByRole('img').querySelectorAll('i')
    expect([...segments].map((segment) => segment.style.width)).toEqual(['50%', '25%'])
  })

  it('draws nothing for an empty diff', () => {
    render(<VerdictBar summary={{ approved: 0, rejected: 0, commented: 0, notReviewed: 0 }} />)
    expect(screen.getByRole('img').children).toHaveLength(0)
  })
})
