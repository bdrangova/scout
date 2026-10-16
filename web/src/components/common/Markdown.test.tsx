import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '<svg />' }) }) },
}))

describe('Markdown', () => {
  it('renders GFM headings, lists, links and inline code', async () => {
    render(<Markdown source={'# Title\n\nSome *text* with `code` and a [link](https://example.com).\n\n- one\n- two\n\n1. first\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two', 'first'])
    expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://example.com/')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
