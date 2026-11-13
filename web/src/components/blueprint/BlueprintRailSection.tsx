import type { BlueprintPackage } from '@scout/shared'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FileTreeFilter } from '@/components/files/FileTreeFilter'
import { CommentedOnlyToggle } from '@/components/layout/CommentedOnlyToggle'
import { useCommentedOnlyFilter, useOpenCommentRefs } from '@/components/layout/commented-only'
import { RailSection } from '@/components/layout/RailSlot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { packageDiagramId } from './blueprint-nav'

export interface BlueprintRailSectionProps {
  root: BlueprintPackage
  /** The folder of the package whose diagram is open (the holder of an around-diagram's file). */
  currentDir: string
  /** The outline is of an agent grouping (groups, not folders): the root is titled by its name and the filter matches names. */
  groups?: boolean
  onSelect: (diagramId: string) => void
}

interface RowProps extends Pick<BlueprintRailSectionProps, 'currentDir' | 'onSelect'> {
  pkg: BlueprintPackage
  depth: number
  closed: ReadonlySet<string>
  onToggle: (dir: string) => void
  /** The packages a filter leaves (matches and the packages above them); null without a filter. */
  visible: ReadonlySet<string> | null
}

function isInside(dir: string, ancestor: string): boolean {
  return ancestor === '' ? dir !== '' : dir.startsWith(`${ancestor}/`)
}

/** Every package below the root, depth first. */
function packagesBelow(pkg: BlueprintPackage): BlueprintPackage[] {
  return pkg.packages.flatMap((child) => [child, ...packagesBelow(child)])
}

function rootLabel(root: BlueprintPackage): string {
  return root.name === '' ? 'Whole change' : root.name
}

function PackageRows({ pkg, depth, closed, onToggle, visible, currentDir, onSelect }: RowProps) {
  const current = pkg.dir === currentDir
  const children = visible === null ? pkg.packages : pkg.packages.filter((child) => visible.has(child.dir))
  // The whole change never folds; every other package with sub-packages does, like a folder of the Files tree.
  // A filter decides what is open, so nothing folds while one is on.
  const foldable = depth > 0 && pkg.packages.length > 0 && visible === null
  const open = !foldable || !closed.has(pkg.dir)
  const label = depth === 0 ? rootLabel(pkg) : pkg.name
  return (
    <li>
      <div
        style={{ paddingLeft: 4 + depth * 14 }}
        className={cn(
          'flex min-w-0 items-center rounded-lg border-fine border-transparent hover:bg-hover',
          current && 'border-line bg-yellow font-bold text-on-yellow hover:bg-yellow',
        )}
      >
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
            onClick={() => onToggle(pkg.dir)}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-ink-muted hover:text-ink"
          >
            <ChevronDown aria-hidden className={cn('size-[13px] transition-transform', !open && '-rotate-90')} />
          </button>
        ) : (
          <span aria-hidden className="size-5 shrink-0" />
        )}
        <button
          type="button"
          aria-current={current ? 'page' : undefined}
          onClick={() => onSelect(packageDiagramId(pkg))}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 pr-2 pl-0.5 text-left text-[13px]"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{label}</span>
          <span className={cn('shrink-0 text-[11.5px] font-semibold tabular-nums', current ? 'text-on-yellow' : 'text-ink-muted')}>{pkg.allFiles.length}</span>
        </button>
      </div>
      {open && children.length > 0 && (
        <ul className="m-0 list-none p-0">
          {children.map((child) => (
            <PackageRows key={child.dir} pkg={child} depth={depth + 1} closed={closed} onToggle={onToggle} visible={visible} currentDir={currentDir} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The Blueprint page's block in the session rail: the packages as a foldable outline with their file counts,
 * under the same header toggle, filter box and "only commented" switch as the Files tree.
 */
export function BlueprintRailSection({ root, currentDir, groups = false, onSelect }: BlueprintRailSectionProps) {
  const noun = groups ? 'Groups' : 'Packages'
  const all = useMemo(() => packagesBelow(root), [root])
  const foldable = useMemo(() => all.filter((pkg) => pkg.packages.length > 0).map((pkg) => pkg.dir), [all])
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const openComments = useOpenCommentRefs('file')
  const commented = useCommentedOnlyFilter(all, (pkg) => pkg.allFiles.some((path) => openComments.has(path)))

  // Opening a diagram unfolds the packages above it, so the current row is always in view.
  const [seenDir, setSeenDir] = useState(currentDir)
  if (seenDir !== currentDir) {
    setSeenDir(currentDir)
    if ([...closed].some((dir) => isInside(currentDir, dir))) setClosed(new Set([...closed].filter((dir) => !isInside(currentDir, dir))))
  }

  const needle = query.trim().toLowerCase()
  const filtering = needle !== '' || commented.active
  const matches = useMemo(
    () => (filtering ? commented.items.filter((pkg) => needle === '' || (groups ? pkg.name : pkg.dir).toLowerCase().includes(needle)) : []),
    [filtering, commented.items, needle, groups],
  )
  const visible = useMemo(() => {
    if (!filtering) return null
    const dirs = new Set(matches.map((pkg) => pkg.dir))
    for (const pkg of all) if (matches.some((match) => isInside(match.dir, pkg.dir))) dirs.add(pkg.dir)
    return dirs
  }, [filtering, matches, all])

  const toggle = (dir: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(dir)) next.add(dir)
      return next
    })
  const allExpanded = closed.size === 0
  const foldLabel = allExpanded ? 'Collapse all' : 'Expand all'
  const FoldIcon = allExpanded ? ChevronsDownUp : ChevronsUpDown

  return (
    <RailSection>
      <nav aria-label={noun} className="flex min-h-0 flex-1 flex-col px-2.5 pt-3.5 pb-2">
        <div className="flex shrink-0 items-center gap-2 pb-2.5 pl-1">
          <strong className="text-[15px] font-bold">{noun}</strong>
          <Badge>{filtering ? `${matches.length} of ${all.length}` : all.length}</Badge>
          {foldable.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto size-7 rounded-md"
              aria-label={foldLabel}
              title={`${foldLabel} ${noun.toLowerCase()}`}
              disabled={filtering}
              onClick={() => setClosed(allExpanded ? new Set(foldable) : new Set())}
            >
              <FoldIcon aria-hidden className="size-3.5" />
            </Button>
          )}
        </div>
        {all.length > 0 && (
          <FileTreeFilter
            label={`Filter ${noun.toLowerCase()}`}
            query={query}
            onChange={setQuery}
            commented={<CommentedOnlyToggle count={commented.count} active={commented.active} onToggle={commented.toggle} />}
          />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="m-0 list-none p-0">
            <PackageRows pkg={root} depth={0} closed={closed} onToggle={toggle} visible={visible} currentDir={currentDir} onSelect={onSelect} />
          </ul>
          {filtering && matches.length === 0 && <p className="m-0 px-2 py-3 text-xs font-medium text-ink-muted">No {noun.toLowerCase()} match.</p>}
        </div>
      </nav>
    </RailSection>
  )
}
