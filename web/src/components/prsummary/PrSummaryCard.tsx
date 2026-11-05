import type { PrReviewReport, TreeStats } from '@scout/shared'
import { ClipboardList, ExternalLink, GitBranch, GitCommitHorizontal, GitPullRequest, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { ChangeTags } from '@/components/common/ChangeTags'
import { ContentCard } from '@/components/common/ContentCard'
import { IconLink } from '@/components/common/IconLink'
import { Tag } from '@/components/ui/tag'
import { formatAdditions, formatDeletions, formatRelativeTime, pluralize } from '@/lib/format'
import { SUMMARY_KIND } from './summary-cards'

function Fact({ icon: Icon, label, children }: { icon: typeof GitBranch; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <dt className="sr-only">{label}</dt>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </div>
  )
}

export interface PrSummaryCardProps {
  report: PrReviewReport | null
  stats: TreeStats
}

/**
 * The top of a PR review: what the PR is, in a few plain bullets, with its change tags and the PR's facts
 * (author, branches, age, commits, size, tickets, labels). Without an overview it says how to get one.
 */
export function PrSummaryCard({ report, stats }: PrSummaryCardProps) {
  const overview = report?.overview
  const size = (
    <>
      {pluralize(stats.files, 'file')} ·{' '}
      <span className="font-mono text-xs font-bold tabular-nums">
        {formatAdditions(stats.additions)} {formatDeletions(stats.deletions)}
      </span>
    </>
  )
  return (
    <ContentCard
      label="PR summary"
      kind={SUMMARY_KIND}
      collapseLabel="Summary"
      title={
        <>
          {report && <span className="mr-1.5 font-mono font-bold text-focus">#{report.pr.number}</span>}
          {overview?.title ?? 'Summary'}
        </>
      }
      actions={
        <>
          {overview?.draft && <Tag tone="sunken" size="sm">Draft</Tag>}
          {report && (
            <IconLink showLabel href={report.pr.url} label="Open PR">
              <ExternalLink aria-hidden />
            </IconLink>
          )}
        </>
      }
      bodyClassName="gap-4"
    >
      {overview ? (
        <>
          <ChangeTags tags={overview.tags} />
          <ul aria-label="What this PR does" className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] leading-[1.5] marker:text-ink-muted">
            {overview.summary.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <dl className="m-0 grid grid-cols-1 gap-x-5 gap-y-2 border-t-fine border-line pt-3.5 text-[13px] font-medium sm:grid-cols-2 lg:grid-cols-3">
            <Fact icon={UserRound} label="Author">
              {overview.author} · opened {formatRelativeTime(overview.openedAt)}
            </Fact>
            <Fact icon={GitBranch} label="Branches">
              <span className="font-mono text-xs">{overview.headRef}</span> → <span className="font-mono text-xs">{overview.baseRef}</span>
            </Fact>
            <Fact icon={GitCommitHorizontal} label="Commits">
              {pluralize(overview.commits, 'commit')}
            </Fact>
            <Fact icon={GitPullRequest} label="Size">
              {size}
            </Fact>
            {overview.tickets.length > 0 && (
              <Fact icon={ClipboardList} label="Tickets">
                {overview.tickets.map((ticket, index) => (
                  <span key={ticket.key}>
                    {index > 0 && ', '}
                    {ticket.url ? (
                      <a href={ticket.url} target="_blank" rel="noreferrer" title={ticket.title ?? undefined} className="font-mono font-bold text-focus underline-offset-2 hover:underline">
                        {ticket.key}
                      </a>
                    ) : (
                      <span className="font-mono font-bold">{ticket.key}</span>
                    )}
                  </span>
                ))}
              </Fact>
            )}
          </dl>
          {overview.labels.length > 0 && (
            <ul aria-label="Labels" className="m-0 flex flex-wrap gap-1.5 p-0">
              {overview.labels.map((label) => (
                <li key={label} className="flex">
                  <Tag size="sm" pill>
                    {label}
                  </Tag>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="m-0 text-sm text-ink-muted">
          {report ? 'This review has no summary yet.' : 'No review report yet.'} Run <code className="font-mono">/scout-pr-review</code> again to add the summary, change tags, PR description and tickets. {size}.
        </p>
      )}
    </ContentCard>
  )
}
