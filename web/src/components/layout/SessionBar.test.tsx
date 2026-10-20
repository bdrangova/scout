import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { commentFixture, reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'

const FILES = sessionDetailFixture.tree.files

describe('SessionBar', () => {
  beforeEach(() => window.localStorage.clear())

  it('has the sidebar toggle first, then Sessions, the tabs, then Shortcuts, the theme and the overflow menu', () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/spec`)
    const toggle = within(bar).getByRole('button', { name: 'Hide sidebar' })
    const sessions = within(bar).getByRole('link', { name: 'Sessions' })
    const tabs = within(bar).getByRole('navigation', { name: 'Sections' })
    const shortcuts = within(bar).getByRole('button', { name: 'Keyboard shortcuts' })
    const theme = within(bar).getByRole('group', { name: 'Colour theme' })
    const more = within(bar).getByRole('button', { name: 'More actions' })
    expect(sessions).toHaveAttribute('href', '/')
    expect(toggle).toHaveAttribute('title', 'Hide sidebar (B)')
    const order = [toggle, sessions, tabs, shortcuts, theme, more]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('carries no identity and no status: those live in the rail', () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/files`)
    expect(within(bar).queryByRole('group', { name: 'Tickets' })).not.toBeInTheDocument()
    expect(within(bar).queryByText(sessionDetailFixture.manifest.title)).not.toBeInTheDocument()
    expect(within(bar).queryByRole('status')).not.toBeInTheDocument()
    expect(within(bar).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('orders the tabs Spec, Extras, Evidence, Files, Submit with their counts', () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/files`)
    const tabs = within(bar).getByRole('navigation', { name: 'Sections' })
    const links = within(tabs).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(['Spec 1', 'Extras 1', 'Evidence 2', 'Files 6', 'Submit'])
    expect(within(tabs).getByRole('link', { name: 'Files 6' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Spec 1' })).toHaveTextContent('Spec1')
  })

  it('shows section counts only when there is something, Files always', () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/files`, { detail: { ...sessionDetailFixture, spec: [], extras: [], tree: { ...sessionDetailFixture.tree, files: [] } } })
    expect(within(bar).getByRole('link', { name: 'Files 0' })).toHaveTextContent('Files0')
    expect(within(bar).getByRole('link', { name: 'Spec' })).toHaveTextContent(/^Spec$/)
    expect(within(bar).getByRole('link', { name: 'Extras' })).toHaveTextContent(/^Extras$/)
  })

  describe('the Submit tab', () => {
    const approvedAll = Object.fromEntries(FILES.map((file) => [file.path, { verdict: 'approved' as const, fingerprint: file.fingerprint, viewed: true }]))
    const open = commentFixture('c1', { kind: 'file', ref: FILES[0]?.path ?? null }, 'Fix this')

    it('counts the open comments', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`, { review: reviewFixture({ comments: [open] }) })
      const submit = within(bar).getByRole('link', { name: 'Submit, 1 open comment' })
      expect(submit).toHaveTextContent('Submit1')
      expect(submit.querySelector('.step-tab-in')).toHaveClass('bg-surface')
    })

    it('turns green with a check when the review is ready, and tells assistive technology', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`, { review: reviewFixture({ files: approvedAll }) })
      const submit = within(bar).getByRole('link', { name: 'Submit, ready' })
      expect(submit.querySelector('.step-tab-in')).toHaveClass('bg-st-ready')
      expect(submit.querySelector('svg')).toHaveClass('lucide-check')
    })

    it('turns red with an alert when the last run failed', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`, { detail: { ...sessionDetailFixture, latestRunStatus: 'failed' }, review: reviewFixture({ files: approvedAll, comments: [open] }) })
      const submit = within(bar).getByRole('link', { name: 'Submit, last run failed, 1 open comment' })
      expect(submit.querySelector('.step-tab-in')).toHaveClass('bg-st-failed')
    })

    it('keeps the plain active look on the Submit page itself', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/submit`, { review: reviewFixture({ files: approvedAll }) })
      const submit = within(bar).getByRole('link', { name: 'Submit, ready' })
      expect(submit).toHaveAttribute('aria-current', 'page')
      expect(submit.querySelector('.step-tab-in')).toHaveClass('bg-hdr-ink')
    })
  })

  it('shows Swipe / Grid on the Files route only', () => {
    const files = renderShell(`/s/${SESSION_ID}/files/a.ts?mode=grid`)
    const toggle = within(files.bar).getByRole('group', { name: 'Review mode' })
    expect(within(toggle).getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'true')
  })

  it('has no Swipe / Grid on the other pages', () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/evidence`)
    expect(within(bar).queryByRole('group', { name: 'Review mode' })).not.toBeInTheDocument()
  })

  it('opens the help from the Shortcuts button', () => {
    const { bar, onHelp } = renderShell(`/s/${SESSION_ID}/submit`)
    fireEvent.click(within(bar).getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(onHelp).toHaveBeenCalledOnce()
  })

  it('announces the save state without a visible gap while idle', () => {
    const idle = renderShell(`/s/${SESSION_ID}/files`)
    expect(idle.bar.querySelector('[aria-live]')).toHaveTextContent('')
  })

  it('says Not saved when the autosave failed', () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/files`, { saveStatus: 'error' })
    expect(bar.querySelector('[aria-live]')).toHaveTextContent('Not saved')
  })

  it('holds Archive in the overflow menu, after Shortcuts and Theme (which only show there below 1024px)', async () => {
    const { bar } = renderShell(`/s/${SESSION_ID}/files`)
    expect(screen.queryByRole('menuitem', { name: 'Archive session' })).not.toBeInTheDocument()
    fireEvent.click(within(bar).getByRole('button', { name: 'More actions' }))
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    expect(items.at(-1)).toBe('Archive session')
    expect(items).toContain('Keyboard shortcuts?')
    expect(items).toEqual(expect.arrayContaining(['Light', 'Dark', 'System']))
    expect(screen.getByRole('menuitem', { name: /^Keyboard shortcuts/ })).toHaveClass('lg:hidden')
  })

  describe('PR tab', () => {
    const pr = { number: 482, url: 'https://github.com/acme/app/pull/482', title: 'Add trial bar', state: 'open', baseRef: 'main', headRef: 'trial', updatedAt: '2026-10-01T10:00:00.000Z' } as const

    it('is absent without a PR', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`)
      expect(within(bar).queryByRole('link', { name: /Pull request/ })).not.toBeInTheDocument()
    })

    it('is an external link after Submit, not part of the section links or the active tab', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/submit`, { detail: { ...sessionDetailFixture, pr } })
      const tabs = within(bar).getByRole('navigation', { name: 'Sections' })
      const links = within(tabs).getAllByRole('link')
      expect(links.at(-1)).toBe(within(tabs).getByRole('link', { name: 'Pull request #482, open, opens on GitHub' }))
      const link = links.at(-1)!
      expect(link).toHaveAttribute('href', pr.url)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAttribute('title', 'Add trial bar (#482, open)')
      expect(link).not.toHaveAttribute('aria-current')
      expect(link).toHaveTextContent('PR #482open')
    })

    it.each(['draft', 'merged', 'closed'] as const)('names the %s state without colour', (state) => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`, { detail: { ...sessionDetailFixture, pr: { ...pr, state } } })
      expect(within(bar).getByRole('link', { name: `Pull request #482, ${state}, opens on GitHub` })).toHaveTextContent(state)
    })

    it('renders nothing for a URL that is not a GitHub pull URL', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`, { detail: { ...sessionDetailFixture, pr: { ...pr, url: 'https://evil.example/acme/app/pull/482' } } })
      expect(within(bar).queryByRole('link', { name: /Pull request/ })).not.toBeInTheDocument()
    })

    it('is also in the overflow menu for narrow bars', async () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/files`, { detail: { ...sessionDetailFixture, pr } })
      fireEvent.click(within(bar).getByRole('button', { name: 'More actions' }))
      const item = await screen.findByRole('menuitem', { name: /PR #482 on GitHub/ })
      expect(item).toHaveAttribute('href', pr.url)
      expect(item).toHaveClass('min-[521px]:hidden')
    })
  })
})
