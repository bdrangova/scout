import type { BlueprintDiagram, BlueprintPackage } from '@scout/shared'
import { ChevronRight, Maximize, Minus, Plus, Sparkles, SquareCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/segmented'
import { packageDiagramId } from './blueprint-nav'

export interface BlueprintToolbarProps {
  diagram: BlueprintDiagram
  /** The packages from the root to the diagram's package (an around-diagram's file folder). */
  chain: readonly BlueprintPackage[]
  boxes: number
  files: number
  reviewed: number
  details: boolean
  /** Select mode is on. */
  selecting: boolean
  /** The folders / feature / layer / priority switch, when the session can be grouped. */
  viewSwitch?: ReactNode
  onNavigate: (diagramId: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onTidy: () => void
  onToggleDetails: () => void
  onToggleSelect: () => void
}

function Legend() {
  return (
    <div role="group" aria-label="Legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1">
        <svg width="34" height="12" aria-hidden className="overflow-visible">
          <path d="M2 6H24" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity=".5" />
          <path d="M24 1L34 6L24 11Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        extends
      </span>
      <span className="inline-flex items-center gap-1">
        <svg width="34" height="12" aria-hidden className="overflow-visible">
          <path d="M2 6H30" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 4" opacity=".5" />
          <path d="M26 1L33 6L26 11" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        leans on
      </span>
      <span>
        <b className="font-mono text-green">+</b> added
      </span>
      <span>
        <b className="font-mono text-red">−</b> removed
      </span>
      <span>
        <b className="font-mono">~</b> changed
      </span>
    </div>
  )
}

/** The root is titled by its own name in a grouping ("By feature"); the folders' root has none. */
function rootTitle(root: BlueprintPackage): string {
  return root.name === '' ? 'Whole change' : root.name
}

/** The Blueprint page's bar: where you are, how much is here, the legend, and the canvas controls. */
export function BlueprintToolbar({ diagram, chain, boxes, files, reviewed, details, selecting, viewSwitch, onNavigate, onZoomIn, onZoomOut, onFit, onTidy, onToggleDetails, onToggleSelect }: BlueprintToolbarProps) {
  const around = diagram.ref.type === 'around' ? diagram.title : null
  const lastIndex = chain.length - 1
  return (
    <div role="toolbar" aria-label="Blueprint" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b-fine border-line px-4 py-2 md:px-6">
      {viewSwitch}
      <nav aria-label="Diagram path">
        <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-0.5 p-0 text-[13px]">
          {chain.map((pkg, index) => {
            const current = around === null && index === lastIndex
            return (
              <li key={pkg.dir} className="flex items-center gap-0.5">
                {index > 0 && <ChevronRight aria-hidden className="size-3.5 text-ink-muted" />}
                {current ? (
                  <span aria-current="page" className="px-1.5 font-bold">
                    {index === 0 ? rootTitle(pkg) : pkg.name}
                  </span>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => onNavigate(packageDiagramId(pkg))}>
                    {index === 0 ? rootTitle(pkg) : pkg.name}
                  </Button>
                )}
              </li>
            )
          })}
          {around !== null && (
            <li className="flex items-center gap-0.5">
              <ChevronRight aria-hidden className="size-3.5 text-ink-muted" />
              <span aria-current="page" className="px-1.5 font-bold">
                {around}
              </span>
            </li>
          )}
        </ol>
      </nav>
      <span className="text-[12.5px] text-ink-muted tabular-nums">
        {boxes} {boxes === 1 ? 'box' : 'boxes'} · {files} {files === 1 ? 'file' : 'files'} · {reviewed} reviewed
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <Legend />
        <div role="group" aria-label="Canvas controls" className="flex items-center gap-1.5">
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
            <Minus aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
            <Plus aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Fit to view" title="Fit to view (F)" onClick={onFit}>
            <Maximize aria-hidden />
          </Button>
          <Button size="sm" title="Forget the arrangement and lay the boxes out automatically" onClick={onTidy}>
            <Sparkles aria-hidden />
            Tidy up
          </Button>
          <Pill pressed={selecting} onClick={onToggleSelect} title="Pick files to look at or approve together (S)">
            <SquareCheck aria-hidden />
            Select
          </Pill>
          <Pill pressed={details} onClick={onToggleDetails} title="Show or hide summaries and changed members">
            Details
          </Pill>
        </div>
      </div>
    </div>
  )
}
