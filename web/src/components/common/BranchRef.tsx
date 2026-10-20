import { ArrowLeft, Folder, GitBranch } from 'lucide-react'
import { Tag } from '@/components/ui/tag'
import { baseTooltip } from '@/lib/branch-tooltip'
import { repoName } from '@/lib/paths'
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

/** A mono branch tag: branch icon plus the ref name, truncating with the full name in `title`. */
export function BranchRef({ name, title, className }: BranchRefProps) {
  const [remote, rest] = name === null ? ['', 'detached HEAD'] : splitRemote(name)
  return (
    <Tag
      mono
      title={title ?? name ?? 'Detached HEAD: no branch is checked out'}
      className={cn('min-w-14 max-w-64 text-ink', name === null && 'text-ink-muted italic', className)}
    >
      <GitBranch className="text-ink-muted" aria-hidden />
      <span className="truncate">
        {remote && <span className="text-ink-muted">{remote}</span>}
        {rest}
      </span>
    </Tag>
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

/** `[⎇ base] ← [⎇ branch]`: the branch merges into the base. Shrinks and truncates before wrapping. */
export function BranchPair({ baseRef, baseSha, baseVirtual = false, branch, className }: BranchPairProps) {
  const baseTitle = baseTooltip(baseSha, baseVirtual)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <BranchRef name={baseRef} title={baseTitle} className="shrink-0 max-w-40" />
      <ArrowLeft className="size-3 shrink-0 text-ink-muted" aria-label="merges into" />
      <BranchRef name={branch} />
    </span>
  )
}

/** The repository folder: folder icon and its name, the full path in `title`. Precedes the branch tags. */
export function RepoRef({ path, className }: { path: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 shrink items-center gap-1 whitespace-nowrap', className)} title={`Repository: ${path}`} aria-label={`Repository ${repoName(path)}`}>
      <Folder className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{repoName(path)} ·</span>
    </span>
  )
}
