import type { WorktreeSummary } from '@scout/shared'
import { GitPullRequest } from 'lucide-react'
import { Tag } from '@/components/ui/tag'
import { formatAdditions, formatDeletions, pluralize } from '@/lib/format'

function Sep() {
  return <span aria-hidden className="mx-1 text-ink-muted">|</span>
}

/** The change numbers of a worktree: files and lines, ahead/behind, uncommitted entries and the PR. Each part starts with a separator, the first one only when `leadingSeparator` (after the branch pair). */
export function WorktreeStats({ worktree, leadingSeparator = true }: { worktree: WorktreeSummary; leadingSeparator?: boolean }) {
  const { stats, ahead, behind, uncommitted, pr } = worktree
  return (
    <>
      {leadingSeparator && <Sep />}
      <span aria-label="File changes" className="inline-flex shrink-0 items-center gap-2 font-sans text-xs font-medium text-ink">
        <span>{pluralize(stats.files, 'file')}</span>
        <span className="font-mono text-green">{formatAdditions(stats.additions)}</span>
        <span className="font-mono text-red">{formatDeletions(stats.deletions)}</span>
      </span>
      {ahead !== null && behind !== null && (
        <>
          <Sep />
          <span aria-label={`${ahead} ahead, ${behind} behind`} title={`${pluralize(ahead, 'commit')} on this branch that the base doesn't have; ${pluralize(behind, 'commit')} on the base that this branch doesn't have yet`} className="shrink-0 font-sans text-xs font-medium text-ink">
            {ahead} ahead · {behind} behind
          </span>
        </>
      )}
      {uncommitted > 0 && (
        <>
          <Sep />
          <Tag tone="warn" size="sm" className="shrink-0">{uncommitted} uncommitted</Tag>
        </>
      )}
      {pr && (
        <>
          <Sep />
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`PR #${pr.number} · ${pr.state}`}
            title={`PR #${pr.number} · ${pr.state}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-info-bd underline-offset-4 hover:bg-hover hover:underline focus-visible:bg-hover focus-visible:underline"
          >
            <GitPullRequest aria-hidden className="size-3.5" />
            <span>#{pr.number}</span>
          </a>
        </>
      )}
    </>
  )
}
