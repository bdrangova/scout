import { ArrowLeft, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BranchRefProps {
  /** A ref name; null means a detached HEAD. */
  name: string | null
  title?: string
  className?: string
}

/** Splits `origin/feature` into its remote prefix (dimmed) and the rest. */
function splitRemote(name: string): [string, string] {
  const slash = name.indexOf('/')
  return slash === -1 ? ['', name] : [name.slice(0, slash + 1), name.slice(slash + 1)]
}

/** A GitHub-style branch chip: branch icon plus the ref name in mono, truncating with the full name in `title`. */
export function BranchRef({ name, title, className }: BranchRefProps) {
  const [remote, rest] = name === null ? ['', 'detached HEAD'] : splitRemote(name)
  return (
    <span
      title={title ?? name ?? 'Detached HEAD: no branch is checked out'}
      className={cn(
        'inline-flex h-5 min-w-14 max-w-64 items-center gap-1 rounded-md border bg-background/60 px-1.5 font-mono text-[11px] leading-none text-foreground',
        name === null && 'text-muted-foreground italic',
        className,
      )}
    >
      <GitBranch className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">
        {remote && <span className="text-muted-foreground">{remote}</span>}
        {rest}
      </span>
    </span>
  )
}

interface BranchPairProps {
  baseRef: string
  /** The live merge-base of `baseRef` and HEAD, when known (list rows have none). */
  baseSha?: string
  /** `WorkingTree.baseVirtual`: the ref and HEAD have several merge bases, so `baseSha` is a virtual one. */
  baseVirtual?: boolean
  branch: string | null
  className?: string
}

/** The base chip's tooltip: what the diff is taken against. */
function baseTooltip(baseSha: string | undefined, baseVirtual = false): string {
  if (!baseSha) return 'Base branch'
  if (baseVirtual) {
    return 'Base branch. The ref and HEAD have several merge bases, so the diff is against the virtual merge base git would use for a merge'
  }
  return `Base branch. The diff is against the merge-base ${baseSha.slice(0, 7)} of this ref and HEAD`
}

/** `[⎇ base] ← [⎇ branch]`: the branch merges into the base. Shrinks and truncates before wrapping. */
export function BranchPair({ baseRef, baseSha, baseVirtual = false, branch, className }: BranchPairProps) {
  const baseTitle = baseTooltip(baseSha, baseVirtual)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <BranchRef name={baseRef} title={baseTitle} />
      <ArrowLeft className="size-3 shrink-0 text-muted-foreground" aria-label="merges into" />
      <BranchRef name={branch} />
    </span>
  )
}
