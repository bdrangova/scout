import type { Commit, Remote } from '@review-dash/shared'
import { CloudCheck, CloudUpload, GitMerge } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatFileCount, formatRelativeTime, formatStats } from '@/lib/format'
import { shortSha } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { formatAbsoluteDate, truncateSubject } from './commit-format'

/** The width of one column; every node has it, so the line segments meet at the centres. */
const NODE_WIDTH_CLASS = 'w-[7.5rem]'

/** A segment of the line: solid between pushed commits, dashed into a commit that is not on the remote. */
export type LineStyle = 'solid' | 'dashed'

/** Shared chrome of a timeline node: the line segments behind it, the node itself and the two text lines. */
export interface NodeShellProps {
  selected: boolean
  /** The half segment from the previous node's centre to this one; null for the first node. */
  incoming: LineStyle | null
  /** The half segment from this node's centre to the next one; null for the last node. */
  outgoing: LineStyle | null
  label: string
  node: ReactNode
  /** The mono line under the node. */
  primary: ReactNode
  /** The muted line under it. */
  secondary: ReactNode
  tooltip: ReactNode
  'data-scope': string
  onSelect: () => void
}

function Segment({ style, side }: { style: LineStyle | null; side: 'left' | 'right' }) {
  if (style === null) return null
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-[9px] border-t',
        side === 'left' ? 'right-1/2 left-0' : 'right-0 left-1/2',
        style === 'dashed' ? 'border-dashed border-warn/70' : 'border-border',
      )}
    />
  )
}

export function NodeShell({ selected, incoming, outgoing, label, node, primary, secondary, tooltip, onSelect, ...rest }: NodeShellProps) {
  return (
    <li className={cn('relative flex shrink-0 flex-col items-center', NODE_WIDTH_CLASS)}>
      <Segment style={incoming} side="left" />
      <Segment style={outgoing} side="right" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-pressed={selected}
              aria-label={label}
              data-scope={rest['data-scope']}
              onClick={onSelect}
              className="relative z-10 flex w-full flex-col items-center gap-1 rounded-md pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
          }
        >
          <span className="flex h-5 items-center">{node}</span>
          <span className="flex max-w-full items-center gap-1 font-mono text-[11px] leading-none">{primary}</span>
          <span className="max-w-full truncate px-1 text-[11px] leading-none text-muted-foreground tabular-nums">{secondary}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex-col items-start gap-0.5 text-left">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}

const SELECTED_NODE = 'border-foreground bg-foreground text-background ring-2 ring-foreground/25 ring-offset-2 ring-offset-card'

/** A hollow circle, filled with a ring when selected. */
export function Dot({ selected, dashed = false }: { selected: boolean; dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('flex size-3.5 items-center justify-center rounded-full border-2 bg-card transition', dashed && 'border-dashed', selected ? SELECTED_NODE : 'border-muted-foreground')}
    />
  )
}

/** The larger node with an icon inside: the merge commit and the full diff. */
export function Ring({ selected, children }: { selected: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn('flex size-5 items-center justify-center rounded-full border-2 bg-card transition', selected ? SELECTED_NODE : 'border-muted-foreground text-muted-foreground')}
    >
      {children}
    </span>
  )
}

export function PushedIcon({ pushed, remoteRef }: { pushed: boolean; remoteRef: string | null }) {
  if (pushed) {
    return <CloudCheck role="img" aria-label={`Pushed to ${remoteRef ?? 'the remote'}`} strokeWidth={2.5} className="size-3.5 shrink-0 text-approve" />
  }
  return <CloudUpload role="img" aria-label="Not pushed yet" className="size-3.5 shrink-0 text-warn" />
}

interface CommitNodeProps {
  commit: Commit
  remote: Remote
  selected: boolean
  incoming: LineStyle | null
  outgoing: LineStyle | null
  onSelect: () => void
}

export function CommitNode({ commit, remote, selected, incoming, outgoing, onSelect }: CommitNodeProps) {
  const sha = shortSha(commit.sha)
  return (
    <NodeShell
      selected={selected}
      incoming={incoming}
      outgoing={outgoing}
      label={`${commit.merge ? 'Merge commit' : 'Commit'} ${sha}: ${commit.subject}`}
      data-scope={commit.sha}
      onSelect={onSelect}
      node={
        commit.merge ? (
          <Ring selected={selected}>
            <GitMerge className="size-3" />
          </Ring>
        ) : (
          <Dot selected={selected} />
        )
      }
      primary={
        <>
          <span className={cn(selected && 'font-semibold')}>{sha}</span>
          <PushedIcon pushed={commit.pushed} remoteRef={remote.ref} />
        </>
      }
      secondary={truncateSubject(commit.subject)}
      tooltip={<CommitTooltip commit={commit} remote={remote} />}
    />
  )
}

function CommitTooltip({ commit, remote }: { commit: Commit; remote: Remote }) {
  return (
    <>
      <span className="font-medium">{commit.subject}</span>
      <span className="opacity-80">
        {commit.author} · {formatRelativeTime(commit.authoredAt)} · {formatAbsoluteDate(commit.authoredAt)}
      </span>
      <span className="opacity-80 tabular-nums">
        {formatFileCount(commit.stats.files)} {formatStats(commit.stats.additions, commit.stats.deletions)}
      </span>
      <span className="opacity-80">{commit.pushed && remote.ref !== null ? `On ${remote.ref}` : 'Not pushed yet'}</span>
      {commit.merge && (
        <span className="opacity-80">
          <span className="rounded-sm bg-background/20 px-1 font-mono text-[10px] uppercase">merge</span>
          {' of '}
          <span className="font-mono">{commit.parents.map(shortSha).join(', ')}</span>
        </span>
      )}
    </>
  )
}
