import type { CommentWithStatus, Review } from '@scout/shared'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  BugIcon,
  ClapperboardIcon,
  FileCode2Icon,
  ImageIcon,
  MessageSquareIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  ScrollTextIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Eyebrow } from '@/components/common/Eyebrow'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { cn } from '@/lib/utils'
import { needsReplyReview } from '@/lib/pr-replies'
import { usePrComments } from '@/state/pr-comments-context'
import type { CommentActions } from '@/state/useCommentActions'
import { commentSections, type SectionDetail, type SectionKey } from './open-comments-sections'
import { TargetBlock } from './TargetBlock'

export interface OpenCommentsProps extends CommentActions {
  comments: CommentWithStatus[]
  review: Review
  detail: SectionDetail
  /** `Open comments` on the compose page, `Comments` next to a run. */
  title?: string
  className?: string
}

const SECTION_ICON: Record<SectionKey, LucideIcon> = {
  overall: MessageSquareTextIcon,
  files: FileCode2Icon,
  evidence: ImageIcon,
  spec: ScrollTextIcon,
  extras: PaperclipIcon,
  scenarios: ClapperboardIcon,
  bugs: BugIcon,
  logs: ScrollTextIcon,
}

/**
 * The comments grouped under Files (with the verdict chip per file and a one-line verdict
 * summary), Evidence (caption, `at 0:42` chips), Spec and Extras (title). Resolved comments stay
 * hidden until "Show n resolved"; each shows the agent's note and can be reopened. The session's GitHub PR
 * threads sit in the same groups (by file; the ones naming no file under Overall); open ones show, the rest
 * (addressed, declined, outdated) are counted as resolved and collapse, except an answered thread with a proposed or unposted reply, which stays visible
 * until it is posted. The header counts only threads still open on GitHub as open. The comments' text never goes to the agent from here, but the instruction and reply drafts typed in the cards are part of the send.
 */
export function OpenComments({ comments, review, detail, title = 'Open comments', className, ...actions }: OpenCommentsProps) {
  const [showResolved, setShowResolved] = useState(false)
  const { threads } = usePrComments()
  const open = comments.filter((comment) => comment.status === 'open')
  const openThreads = threads.filter((thread) => thread.root.status === 'open')
  // An answered thread whose reply still needs the reviewer (a proposal to accept, a draft not posted yet) stays in the list.
  const reviewThreads = threads.filter(needsReplyReview)
  const openCount = open.length + openThreads.length
  const total = comments.length + threads.length
  const resolvedCount = total - openCount
  const hiddenCount = resolvedCount - reviewThreads.length
  const visible = showResolved ? comments : open
  const visibleThreads = showResolved ? threads : threads.filter((thread) => thread.root.status === 'open' || needsReplyReview(thread))
  const sections = useMemo(() => commentSections(visible, review, detail, visibleThreads), [visible, review, detail, visibleThreads])
  const Chevron = showResolved ? ChevronDownIcon : ChevronRightIcon
  const resolvedLabel = `${showResolved ? 'Hide' : 'Show'} ${hiddenCount} resolved`

  return (
    <Panel id="open-comments" tabIndex={-1} role="region" aria-label={title} className={cn('outline-none', className)}>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        <Tag tone="warn" pill title={`${openCount} open`} aria-label={`${openCount} open`}>
          <MessageSquareIcon aria-hidden />
          {openCount}
        </Tag>
        {resolvedCount > 0 && (
          <Tag tone="ok" pill title={`${resolvedCount} resolved`} aria-label={`${resolvedCount} resolved`}>
            <CircleCheckIcon aria-hidden />
            {resolvedCount}
          </Tag>
        )}
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3 text-[13px]">
        {sections.length === 0 && (
          <p className="py-2 text-[13px] font-medium text-ink-muted">
            {total === 0 ? 'No comments yet. Reject or comment on an item and it shows up here.' : 'Every comment is resolved.'}
          </p>
        )}
        {sections.map((section) => {
          const Icon = SECTION_ICON[section.key]
          return (
            <div key={section.key} className="flex flex-col gap-2">
              <Eyebrow as="h3" className="flex items-center gap-1.5">
                <Icon className="size-[13px]" aria-hidden />
                {section.heading}
              </Eyebrow>
              {section.summary && <p className="text-xs font-medium text-ink-muted">{section.summary}</p>}
              {section.groups.map((group) => (
                <TargetBlock key={group.key} group={group} {...actions} />
              ))}
            </div>
          )
        })}
      </PanelBody>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={showResolved}
          aria-label={resolvedLabel}
          title={resolvedLabel}
          onClick={() => setShowResolved((value) => !value)}
          className="flex items-center gap-1 border-t-fine border-line bg-paper-2 px-5 py-2.5 text-left text-[12.5px] font-semibold text-ink-muted hover:bg-hover hover:text-ink [&_svg]:size-3.5"
        >
          <Chevron aria-hidden />
          <CircleCheckIcon aria-hidden />
          {hiddenCount}
        </button>
      )}
    </Panel>
  )
}
