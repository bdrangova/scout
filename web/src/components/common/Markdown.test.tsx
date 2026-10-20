import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('Markdown untrusted variant', () => {
  const renderUntrusted = (source: string) => render(<Markdown variant="untrusted" source={source} />)
  afterEach(() => vi.restoreAllMocks())

  it('asks before opening a link, shows the full destination, and opens it without opener or referrer', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderUntrusted('Please [sign in here](https://evil.example/login?next=/a).')
    const link = await screen.findByRole('button', { name: /sign in here/ })
    expect(link).toHaveTextContent('sign in here (evil.example)')
    await userEvent.click(link)
    expect(open).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog', { name: 'Open external link?' })
    expect(within(dialog).getByText('https://evil.example/login?next=/a')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(open).not.toHaveBeenCalled()
    await userEvent.click(link)
    await userEvent.click(await screen.findByRole('button', { name: 'Open link' }))
    expect(open).toHaveBeenCalledWith('https://evil.example/login?next=/a', '_blank', 'noreferrer')
  })

  it('turns javascript:, data: and vbscript: links into plain text', async () => {
    const { container } = renderUntrusted('[a](javascript:alert(1)) [b](data:text/html;base64,PHNjcmlwdD4=) [c](vbscript:x) [d](JaVaScRiPt:alert(2))')
    await screen.findByText(/^a/)
    expect(container.querySelector('a, button')).toBeNull()
    expect(container.innerHTML).not.toMatch(/javascript:|data:text|vbscript:/i)
  })

  it('loads images only from GitHub hosts', async () => {
    const { container } = renderUntrusted(
      [
        '![ok](https://user-images.githubusercontent.com/1/a.png)',
        '![ok2](https://github.com/acme/app/assets/1/b.png)',
        '![ok3](https://private-user-images.githubusercontent.com/1/c.png)',
        '![px](https://tracker.example/pixel.gif)',
        '![lookalike](https://github.com.evil.example/x.png)',
        '![plain](http://github.com/x.png)',
        '![data](data:image/png;base64,AAAA)',
      ].join('\n\n'),
    )
    await screen.findByText(/image blocked: tracker\.example/)
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toEqual(['https://user-images.githubusercontent.com/1/a.png', 'https://github.com/acme/app/assets/1/b.png', 'https://private-user-images.githubusercontent.com/1/c.png'])
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByText(/image blocked: github\.com\.evil\.example/)).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('tracker.example/pixel')
    expect(container.innerHTML).not.toContain('data:image')
  })

  it('keeps raw HTML inert', async () => {
    const { container } = renderUntrusted(
      'before\n\n<script>window.__pwned = 1</script>\n\n<img src="https://tracker.example/x.png" onerror="window.__pwned = 2">\n\n<iframe src="https://evil.example"></iframe>\n\n<p style="position:fixed" onclick="window.__pwned = 3">styled</p>\n\n<a href="javascript:alert(1)">x</a>\n\nafter',
    )
    await screen.findByText('after')
    expect(container.querySelector('script, iframe, img, style, [style], [onerror], [onclick], a, button')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('still highlights code and does not render mermaid blocks as diagrams', async () => {
    const { container } = renderUntrusted('```ts\nconst a = 1\n```\n\n```mermaid\ngraph TD; A-->B\n```')
    await screen.findByText('const')
    expect(container.querySelector('[data-streamdown="mermaid"]')).toBeNull()
  })
})
