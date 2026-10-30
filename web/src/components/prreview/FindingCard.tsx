import { anchorLabel, type PrFinding } from '@scout/shared'
import { Code2, FileText, GripVertical, ListChecks, Play } from 'lucide-react'
import { useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { CommentList } from '@/components/common/CommentList'
import { PrThreadList } from '@/components/prcomments/PrThreadList'
import { Notice } from '@/components/ui/notice'
import { Tag } from '@/components/ui/tag'
import { fileRoute, splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { useCommentActions } from '@/state/useCommentActions'
import { useCurrentPrReport } from './pr-review-context'
import { ProposalCard } from './ProposalCard'
import { ReproductionFocus } from './ReproductionFocus'
import { orderedEvidence, type EvidenceItem } from './reproduction-evidence'
import { useEvidenceSrc, useFindingComments } from './finding-comments'

const SEVERITY_TONE = { critical: 'err', high: 'err', medium: 'warn', low: 'info' } as const
const STATUS_TONE = { reproduced: 'ok', 'not-reproduced': 'warn', blocked: 'warn', 'non-visual': 'info' } as const

/** One evidence item beside its step: a thumbnail for screenshots and videos, a labelled chip for logs and tests. */
function StepEvidence({ item, src, onOpen }: { item: EvidenceItem; src: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  const label = `Open ${item.kind}: ${item.caption}`
  if (item.kind === 'screenshot' || item.kind === 'video') {
    return (
      <button type="button" aria-label={label} title={item.caption} onClick={onOpen} className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border-fine border-line bg-sunken hover:ring-2 hover:ring-yellow">
        {item.kind === 'video' ? (
          <>
            <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover object-top" />
            <span className="absolute inset-0 grid place-items-center"><Play aria-hidden className="size-6 rounded-full bg-ink/70 p-1.5 text-paper" /></span>
          </>
        ) : failed ? (
          <span className="grid size-full place-items-center text-[11px] text-ink-muted">Unavailable</span>
        ) : (
          <img src={src} alt="" onError={() => setFailed(true)} className="size-full object-cover object-top" />
        )}
      </button>
    )
  }
  return (
    <button type="button" aria-label={label} title={item.caption} onClick={onOpen} className="flex h-8 max-w-44 shrink-0 items-center gap-1.5 rounded-md border-fine border-line bg-code px-2 font-mono text-[11px] hover:ring-2 hover:ring-yellow">
      <FileText aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{item.kind} · {item.caption}</span>
    </button>
  )
}

export interface FindingCardProps {
  finding: PrFinding
  /** `2 / 4` in the header. */
  position?: { index: number; total: number }
  /** Swipe mode starts the drag from the header. */
  onHeaderPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  className?: string
}

/**
 * One finding on the PR review's Evidence page, the scenario card's counterpart: the header, the reproduction as
 * steps with their evidence beside each, Expected / Actual, then everything said about it: the suggested PR comment
 * with its actions, GitHub threads and your own comments on the same lines. Evidence opens full screen.
 */
export function FindingCard({ finding, position, onHeaderPointerDown, className }: FindingCardProps) {
  const { detail } = useCurrentPrReport()
  const srcOf = useEvidenceSrc()
  const actions = useCommentActions()
  const { threads, comments } = useFindingComments(finding)
  const [focus, setFocus] = useState<number | null>(null)
  const r = finding.reproduction
  const items = orderedEvidence(r)
  if (!detail) return null

  return (
    <article aria-label={finding.title} data-finding={finding.id} className={cn('relative flex flex-col overflow-hidden rounded-2xl border-fine border-line bg-surface text-ink', className)}>
      <div
        data-slot="card-header"
        className={cn('flex shrink-0 items-start gap-3 border-b-fine border-line bg-paper-2 px-4 py-3', onHeaderPointerDown && 'cursor-grab select-none')}
        style={onHeaderPointerDown ? { touchAction: 'none' } : undefined}
        onPointerDown={onHeaderPointerDown}
      >
        {onHeaderPointerDown && <GripVertical aria-hidden className="mt-0.5 size-4 shrink-0 opacity-60" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="m-0 min-w-0 truncate text-base font-bold" title={finding.title}>{finding.title}</h2>
            <Tag tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Tag>
            <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-ink-muted">
            <Link to={fileRoute(detail.manifest.id, finding.path)} title={`Open ${finding.path} in the diff`} className="inline-flex min-w-0 items-center gap-1 font-mono font-semibold text-ink underline underline-offset-2">
              <Code2 aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{splitPath(finding.path).name}</span>
            </Link>
            <span>{anchorLabel(finding.anchor)}</span>
            <span>· {finding.sources.join(' → ')}</span>
          </span>
        </div>
        {position && (
          <span className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[12.5px] font-semibold whitespace-nowrap tabular-nums" title={`Finding ${position.index + 1} of ${position.total}`}>
            <ListChecks aria-hidden className="size-[13px]" />
            {position.index + 1}
            <span className="opacity-60"> / </span>
            {position.total}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pt-3 pb-4 text-[13px]">
        <p className="m-0 text-xs text-ink-muted">{r.environment} · revision <code className="font-mono">{r.revision.slice(0, 12)}</code></p>
        {r.prerequisites.length > 0 && (
          <div className="text-xs">
            <strong>Before you start</strong>
            <ul className="m-0 mt-1 list-disc pl-5">{r.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        {r.steps.length > 0 && (
          <ol aria-label="Steps" className="m-0 flex list-none flex-col p-0">
            {r.steps.map((step, i) => {
              const evidence = items.map((item, index) => ({ item, index })).filter(({ item }) => item.stepId === step.id)
              return (
                <li key={step.id} className="flex items-center gap-3 border-t-fine border-line py-2.5 first:border-t-0">
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border-fine border-ink text-[11px] font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1">{step.instruction}</span>
                  {evidence.length > 0 && (
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {evidence.map(({ item, index }) => <StepEvidence key={item.path} item={item} src={srcOf(item)} onOpen={() => setFocus(index)} />)}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border-fine border-line px-3 py-2"><strong className="block text-[10.5px] tracking-[.08em] text-ink-muted uppercase">Expected</strong>{r.expected}</div>
          <div className="rounded-lg border-fine border-line px-3 py-2"><strong className="block text-[10.5px] tracking-[.08em] text-ink-muted uppercase">Actual</strong>{r.actual}</div>
        </div>
        {r.limitation && <Notice tone="warn">{r.limitation}</Notice>}
        {items.length === 0 && <p className="m-0 text-xs text-ink-muted">No evidence captured.</p>}
      </div>

      <section aria-label={`Comments on ${finding.title}`} className="flex max-h-[45%] shrink-0 flex-col gap-3 overflow-auto border-t-fine border-line px-4 pt-3.5 pb-4">
        <ProposalCard finding={finding} bare />
        {comments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <strong className="text-xs">Your comments on these lines</strong>
            <CommentList comments={comments} {...actions} />
          </div>
        )}
        {threads.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <strong className="text-xs">GitHub on these lines</strong>
            <PrThreadList threads={threads} label={`GitHub threads on ${finding.title}`} />
          </div>
        )}
      </section>
      <ReproductionFocus finding={finding} items={items} srcOf={srcOf} index={focus} onIndexChange={setFocus} />
    </article>
  )
}
