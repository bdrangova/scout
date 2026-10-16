import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BranchPair, BranchRef } from './BranchRef'

describe('BranchRef', () => {
  it('dims the remote prefix and keeps the full name in the title', () => {
    render(<BranchRef name="origin/main" />)
    const chip = screen.getByTitle('origin/main')
    expect(chip).toHaveTextContent('origin/main')
    expect(screen.getByText('origin/')).toHaveClass('text-muted-foreground')
  })

  it('truncates long names while exposing them in full through the title', () => {
    const name = 'bojana3-QI-14344-nav-redesign-with-a-very-long-suffix'
    render(<BranchRef name={name} />)
    const chip = screen.getByTitle(name)
    expect(chip).toHaveTextContent(name)
    expect(chip.querySelector('.truncate')).not.toBeNull()
  })

  it('shows a muted "detached HEAD" for a null branch', () => {
    render(<BranchRef name={null} />)
    const chip = screen.getByText('detached HEAD').closest('span[title]')
    expect(chip).toHaveClass('text-muted-foreground')
  })
})

describe('BranchPair', () => {
  it('renders base ← branch with the merge-base in the base tooltip', () => {
    render(<BranchPair baseRef="origin/main" baseSha={'b'.repeat(40)} branch="feature/nav" />)
    expect(screen.getByTitle('Base branch. The diff is against the merge-base bbbbbbb of this ref and HEAD')).toHaveTextContent('origin/main')
    expect(screen.getByLabelText('merges into')).toBeInTheDocument()
    expect(screen.getByTitle('feature/nav')).toBeInTheDocument()
  })

  it('says only "Base branch" when no merge-base is known', () => {
    render(<BranchPair baseRef="origin/main" branch={null} />)
    expect(screen.getByTitle('Base branch')).toHaveTextContent('origin/main')
    expect(screen.getByText('detached HEAD')).toBeInTheDocument()
  })

  it('explains a virtual merge base instead of naming one', () => {
    render(<BranchPair baseRef="origin/main" baseSha={'b'.repeat(40)} baseVirtual branch="feature/nav" />)
    expect(
      screen.getByTitle('Base branch. The ref and HEAD have several merge bases, so the diff is against the virtual merge base git would use for a merge'),
    ).toHaveTextContent('origin/main')
  })
})
