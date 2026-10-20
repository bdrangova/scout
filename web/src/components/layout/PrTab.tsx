import type { PrSummary } from '@review-dash/shared'
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, type LucideIcon } from 'lucide-react'
import { safePrUrl } from './pr-url'

const STATE: Record<PrSummary['state'], { icon: LucideIcon; word: string }> = {
  open: { icon: GitPullRequest, word: 'open' },
  draft: { icon: GitPullRequestDraft, word: 'draft' },
  merged: { icon: GitMerge, word: 'merged' },
  closed: { icon: GitPullRequestClosed, word: 'closed' },
}

/**
 * The sixth tab: an external link to the session's pull request, not a route. Same arrow shape as the
 * section tabs; the state is its icon plus a word (hidden below 1280px, still in the accessible name), and
 * below 1024px it is icon and number. Renders nothing unless `pr.url` is a github.com pull URL.
 */
export function PrTab({ pr }: { pr: PrSummary }) {
  const href = safePrUrl(pr.url)
  if (!href) return null
  const { icon: Icon, word } = STATE[pr.state]
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Pull request #${pr.number}, ${word}, opens on GitHub`}
      title={`${pr.title} (#${pr.number}, ${word})`}
      data-pr-state={pr.state}
      className="step-tab text-[13px] font-bold whitespace-nowrap text-ink max-[520px]:hidden [&_svg]:size-[15px] [&_svg]:shrink-0"
    >
      <span className="step-tab-in bg-surface">
        <span className="step-tab-c">
          <Icon aria-hidden />
          <span className="tabular-nums">PR #{pr.number}</span>
          <span className="text-[11.5px] font-semibold text-ink-muted max-xl:sr-only">{word}</span>
          <ExternalLink aria-hidden className="size-3! text-ink-muted max-lg:hidden" />
        </span>
      </span>
    </a>
  )
}
