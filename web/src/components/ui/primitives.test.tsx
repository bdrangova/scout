import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'
import { FileTypeDot } from './file-type-dot'
import { Notice } from './notice'
import { Progress } from './progress'
import { Segmented, SegmentedItem } from './segmented'
import { StatusDot } from './status-dot'
import { Tag } from './tag'

describe('Button', () => {
  it('renders a native button with variant and size data attributes', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" size="sm" onClick={onClick}>
        Send
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Send' })
    expect(button).toHaveAttribute('data-slot', 'button')
    expect(button).toHaveAttribute('data-variant', 'primary')
    expect(button).toHaveAttribute('data-size', 'sm')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('lets className override size classes', () => {
    render(<Button className="h-6">Tiny</Button>)
    const button = screen.getByRole('button', { name: 'Tiny' })
    expect(button).toHaveClass('h-6')
    expect(button).not.toHaveClass('h-10')
  })
})

describe('Segmented', () => {
  it('exposes a labelled group of aria-pressed buttons with counts', () => {
    render(
      <Segmented aria-label="Filter" variant="pills">
        <SegmentedItem pressed count={2}>
          All
        </SegmentedItem>
        <SegmentedItem pressed={false} count={0}>
          Sent
        </SegmentedItem>
      </Segmented>,
    )
    expect(screen.getByRole('group', { name: 'Filter' })).toHaveAttribute('data-variant', 'pills')
    expect(screen.getByRole('button', { name: 'All 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sent 0' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Notice', () => {
  it('is a polite status by default and an alert for err', () => {
    render(
      <>
        <Notice tone="warn">Updated</Notice>
        <Notice tone="err">Failed</Notice>
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Updated')
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'err')
  })

  it('can drop the icon', () => {
    const { container } = render(
      <Notice tone="ok" icon={null}>
        Done
      </Notice>,
    )
    expect(container.querySelector('[data-slot="notice-icon"]')).toBeNull()
  })
})

describe('StatusDot', () => {
  it('names its state for screen readers and pulses on demand', () => {
    const { container } = render(<StatusDot tone="info" label="Claude Code working" pulse />)
    expect(screen.getByText('Claude Code working')).toHaveClass('sr-only')
    expect(container.querySelector('.animate-ping')).not.toBeNull()
  })
})

describe('Tag and FileTypeDot', () => {
  it('carry their tone / type as data attributes', () => {
    render(
      <>
        <Tag tone="mint">Added</Tag>
        <FileTypeDot type="react" />
      </>,
    )
    expect(screen.getByText('Added')).toHaveAttribute('data-tone', 'mint')
    const dot = screen.getByText('React').parentElement
    expect(dot).toHaveAttribute('data-type', 'react')
    expect(dot).toHaveClass('ft-react')
  })
})

describe('Progress', () => {
  it('flags completion', () => {
    const { container } = render(<Progress value={5} max={5} aria-label="Reviewed" />)
    expect(container.querySelector('[data-slot="progress"]')).toHaveAttribute('data-complete', 'true')
  })
})
