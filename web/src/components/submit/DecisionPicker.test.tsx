import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DecisionPicker } from './DecisionPicker'

describe('DecisionPicker', () => {
  it('lays the options out by its own width: rows by default, three columns only in a wide container', () => {
    const { container } = render(<DecisionPicker value="undecided" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Decision' })
    expect(group).toHaveClass('grid', '@2xl:grid-cols-3')
    expect(group).not.toHaveClass('grid-cols-3', 'sm:grid-cols-3')
    expect(container.firstElementChild).toHaveClass('@container')
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })
})
