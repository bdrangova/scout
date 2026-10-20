import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeTreeFile } from '@/test/fixtures'
import { CardHeader, type CardHeaderProps } from './CardHeader'

function renderHeader(overrides: Partial<CardHeaderProps> = {}) {
  const props: CardHeaderProps = {
    file: makeTreeFile({ path: 'src/components/TrialBar.tsx', status: 'added', additions: 39, deletions: 0 }),
    position: { index: 7, total: 12 },
    updated: false,
    changedJustNow: false,
    view: 'unified',
    views: ['unified', 'split'],
    onViewChange: vi.fn(),
    ...overrides,
  }
  render(<CardHeader {...props} />)
  return props
}

describe('CardHeader', () => {
  it('shows the folder, the name, the delta and the position (readable as "file 8 of 12")', () => {
    renderHeader()
    expect(screen.getByText('src/components/')).toBeInTheDocument()
    expect(screen.getByText('TrialBar.tsx')).toBeInTheDocument()
    expect(screen.getByText('+39')).toBeInTheDocument()
    expect(screen.getByText('−0')).toBeInTheDocument()
    expect(screen.getByText('file 8 of 12')).toBeInTheDocument()
    expect(screen.getByTitle('File 8 of 12')).toBeInTheDocument()
  })

  it('renders the status as an icon chip whose word shows from lg up and is always there for assistive tech', () => {
    renderHeader()
    const chip = screen.getByTitle('added')
    expect(chip).toHaveTextContent('added')
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('added')).toHaveClass('sr-only', 'lg:not-sr-only')
    // A neutral chip: a tinted one could share the hue of the file type's header behind it.
    expect(chip).toHaveAttribute('data-tone', 'neutral')
  })

  it('has no window dots and labels the layouts from lg up', () => {
    const { container } = render(
      <CardHeader file={makeTreeFile({ path: 'README.md' })} updated={false} changedJustNow={false} view="preview" views={['unified', 'split', 'preview']} onViewChange={vi.fn()} />,
    )
    expect(container.querySelector('i')).toBeNull()
    const preview = screen.getByRole('button', { name: 'Preview' })
    expect(preview).toHaveTextContent('Preview')
    expect(preview.querySelector('span')).toHaveClass('hidden', 'lg:inline')
  })

  it('adds the binary, untracked and updated chips and the "changed just now" pulse', () => {
    renderHeader({
      file: makeTreeFile({ path: 'assets/logo.png', status: 'modified', binary: true, untracked: true }),
      updated: true,
      changedJustNow: true,
    })
    expect(screen.getByText('binary')).toBeInTheDocument()
    expect(screen.getByTitle('Not yet added to git')).toHaveTextContent('untracked')
    expect(screen.getByTitle('Updated since last review')).toHaveTextContent('updated since sent')
    expect(screen.getByRole('status')).toHaveTextContent('changed just now')
  })

  it('shows where a renamed file came from', () => {
    renderHeader({ file: makeTreeFile({ path: 'src/Notice.tsx', status: 'renamed', oldPath: 'src/Banner.tsx' }) })
    expect(screen.getByText('renamed from src/Banner.tsx')).toBeInTheDocument()
  })

  it('offers the layouts as icon buttons and reports the chosen one', () => {
    const { onViewChange } = renderHeader({ views: ['unified', 'split', 'preview'] })
    const group = screen.getByRole('group', { name: 'Diff layout' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Unified diff', 'Split diff', 'Preview'])
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    buttons[2]?.click()
    expect(onViewChange).toHaveBeenCalledWith('preview')
  })

  it('has no layout chooser when there is nothing to lay out', () => {
    renderHeader({ views: [] })
    expect(screen.queryByRole('group', { name: 'Diff layout' })).not.toBeInTheDocument()
  })

  it('shows the PR comment count with the open ones emphasised, ', () => {
    renderHeader({ prComments: { total: 3, open: 1 } })
    const chip = screen.getByText(/3 PR comments/)
    expect(chip).toHaveTextContent(/3 PR comments.*1 open/)
    expect(within(chip).getByText('1 open').tagName).toBe('STRONG')
  })

  it('leaves the chip out when no thread is open or present', () => {
    renderHeader({ prComments: { total: 1, open: 0 } })
    expect(screen.getByText('1 PR comment')).toBeInTheDocument()
    expect(screen.queryByText(/open$/)).not.toBeInTheDocument()
  })

  it('has no PR chip without counts', () => {
    renderHeader()
    expect(screen.queryByText(/PR comment/)).not.toBeInTheDocument()
  })
})
