import type { SessionDetail } from '@scout/shared'
import { useEffect } from 'react'

const BASE_TITLE = 'scout'

/** The PR number of a PR review: the synced PR, the published report, or the URL it was started from. */
function prNumber(detail: SessionDetail): number | null {
  if (detail.kind === 'test-run') return null
  const fromUrl = detail.manifest.pr?.url.match(/\/pull\/(\d+)/)?.[1]
  return detail.pr?.number ?? detail.prReview?.pr.number ?? (fromUrl ? Number(fromUrl) : null)
}

/** The browser tab title of an open session: `scout: dev <title>`, `scout: test <title>`, `scout: pr #<number>`. */
export function sessionTabTitle(detail: SessionDetail): string {
  if (detail.kind === 'test-run') return `${BASE_TITLE}: test ${detail.manifest.title}`
  if (detail.manifest.kind === 'pr-review') {
    const number = prNumber(detail)
    return `${BASE_TITLE}: pr ${number === null ? detail.manifest.title : `#${number}`}`
  }
  return `${BASE_TITLE}: dev ${detail.manifest.title}`
}

/** The browser tab title of a worktree: `scout: wt <name>`. */
export function worktreeTabTitle(name: string): string {
  return `${BASE_TITLE}: wt ${name}`
}

/** Sets the browser tab title while mounted (plain `scout` while `title` is null), and puts `scout` back on unmount. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ?? BASE_TITLE
  }, [title])
  useEffect(
    () => () => {
      document.title = BASE_TITLE
    },
    [],
  )
}
