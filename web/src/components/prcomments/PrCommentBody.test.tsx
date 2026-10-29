import { githubImageRelayPath } from '@scout/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrCommentBody } from './PrCommentBody'

describe('PrCommentBody', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders a comment as untrusted text: links confirm first, outside images are not requested', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container } = render(<PrCommentBody label="maya's comment" body={'See [the docs](https://docs.example/a) ![t](https://tracker.example/p.gif) ![s](https://user-images.githubusercontent.com/1/s.png)'} />)
    await userEvent.click(await screen.findByRole('button', { name: /the docs \(docs\.example\)/ }))
    expect(open).not.toHaveBeenCalled()
    expect(await screen.findByRole('alertdialog', { name: 'Open external link?' })).toHaveTextContent('https://docs.example/a')
    expect(screen.getByText(/image blocked: tracker\.example/)).toBeInTheDocument()
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([githubImageRelayPath('https://user-images.githubusercontent.com/1/s.png')])
  })

  it('keeps script, event handlers, iframes and javascript: links inert', async () => {
    const { container } = render(<PrCommentBody label="x" body={'ok\n\n<script>window.__x = 1</script>\n\n<iframe src="https://evil.example"></iframe>\n\n[go](javascript:alert(1))'} />)
    await screen.findByText('ok')
    expect(container.querySelector('script, iframe, a, button, [onerror]')).toBeNull()
  })
})
