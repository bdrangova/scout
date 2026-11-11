import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sessionDetailFixture, testRunDetailFixture } from '@/test/fixtures'
import { sessionTabTitle, useDocumentTitle, worktreeTabTitle } from './document-title'

describe('tab titles', () => {
  it('names a code review, a test run and a worktree', () => {
    const dev = { ...sessionDetailFixture, manifest: { ...sessionDetailFixture.manifest, kind: 'code-review' as const } }
    expect(sessionTabTitle(dev)).toBe(`scout: dev ${dev.manifest.title}`)
    expect(sessionTabTitle(testRunDetailFixture)).toBe(`scout: test ${testRunDetailFixture.manifest.title}`)
    expect(worktreeTabTitle('scout-wt')).toBe('scout: wt scout-wt')
  })

  it('names a PR review by its number, from the start URL before it is synced', () => {
    const manifest = { ...sessionDetailFixture.manifest, kind: 'pr-review' as const, pr: { url: 'https://github.com/o/r/pull/42' } }
    expect(sessionTabTitle({ ...sessionDetailFixture, manifest, pr: null, prReview: null })).toBe('scout: pr #42')
  })

  it('falls back to the title for a PR review with no known number', () => {
    const manifest = { ...sessionDetailFixture.manifest, kind: 'pr-review' as const, pr: undefined }
    expect(sessionTabTitle({ ...sessionDetailFixture, manifest, pr: null, prReview: null })).toBe(`scout: pr ${manifest.title}`)
  })

  it('sets the title while mounted and restores it after', () => {
    const { rerender, unmount } = renderHook(({ title }: { title: string | null }) => useDocumentTitle(title), { initialProps: { title: null as string | null } })
    expect(document.title).toBe('scout')
    rerender({ title: 'scout: dev x' })
    expect(document.title).toBe('scout: dev x')
    unmount()
    expect(document.title).toBe('scout')
  })
})
