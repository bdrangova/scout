import type { BlueprintDiagram, BlueprintPackage } from '@scout/shared'
import { ChevronRight, CircleCheck, File, type LucideIcon, Maximize, Minus, Plus, Sparkles, SquareCheck, Unlink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/segmented'
import type { ArrowKind, ArrowKindsShown, BoxHide, BoxHides } from '@/lib/blueprint-arrow-prefs'
import { cn } from '@/lib/utils'
import { packageDiagramId } from './blueprint-nav'

export interface BlueprintToolbarProps {
  diagram: BlueprintDiagram
  /** The packages from the root to the diagram's package (an around-diagram's file folder). */
  chain: readonly BlueprintPackage[]
  boxes: number
  files: number
  reviewed: number
  /** Select mode is on. */
  selecting: boolean
  /** The folders / feature / layer / priority switch, when the session can be grouped. */
  viewSwitch?: ReactNode
  /** Which kinds of arrow are drawn; the legend's two arrow entries switch them. */
  arrows: ArrowKindsShown
  onToggleArrow: (kind: ArrowKind) => void
  /** The box switches this diagram offers (a switch that would do nothing here is left out), which are on, and how many boxes they hide. */
  hideOptions: readonly BoxHide[]
  hides: BoxHides
  hidden: number
  onToggleHide: (hide: BoxHide) => void
  onNavigate: (diagramId: string) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onTidy: () => void
  onToggleSelect: () => void
}

/** A legend entry that is also a switch: pressed = shown on the diagram; off = struck through and faded. */
function LegendToggle({ name, label, shown, onToggle, children }: { name: string; label: string; shown: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={`Show ${name}`}
      title={`${shown ? 'Hide' : 'Show'} ${name}`}
      onClick={onToggle}
      className={cn('-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 hover:bg-sunken hover:text-ink', !shown && 'line-through opacity-45')}
    >
      {children}
      {label}
    </button>
  )
}

const HIDE_ENTRY: Record<Exclude<BoxHide, 'unlinked'>, { label: string; name: string; icon: LucideIcon }> = {
  approved: { label: 'approved', name: 'the fully approved boxes', icon: CircleCheck },
  files: { label: 'files', name: 'the loose files next to the packages', icon: File },
}

/** Not a show/hide entry but a filter: pressed = only the boxes no arrow touches are left. Lit when on, plain when off. */
function OnlyUnlinked({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Only the boxes no arrow touches"
      title={on ? 'Show every box again' : 'Show only the boxes no arrow touches'}
      onClick={onToggle}
      className={cn('-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 hover:bg-sunken hover:text-ink', on && 'bg-ink font-bold text-paper hover:bg-ink hover:text-paper')}
    >
      <Unlink aria-hidden className="size-3.5" />
      only unlinked
    </button>
  )
}

interface LegendProps {
  arrows: ArrowKindsShown
  onToggleArrow: (kind: ArrowKind) => void
  hideOptions: readonly BoxHide[]
  hides: BoxHides
  hidden: number
  onToggleHide: (hide: BoxHide) => void
}

function Legend({ arrows, onToggleArrow, hideOptions, hides, hidden, onToggleHide }: LegendProps) {
  return (
    <div role="group" aria-label="Legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
      <LegendToggle name={'the "extends" arrows'} label="extends" shown={arrows.extends} onToggle={() => onToggleArrow('extends')}>
        <svg width="34" height="12" aria-hidden className="overflow-visible">
          <path d="M2 6H24" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity=".5" />
          <path d="M24 1L34 6L24 11Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </LegendToggle>
      <LegendToggle name={'the "leans on" arrows'} label="leans on" shown={arrows.uses} onToggle={() => onToggleArrow('uses')}>
        <svg width="34" height="12" aria-hidden className="overflow-visible">
          <path d="M2 6H30" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 4" opacity=".5" />
          <path d="M26 1L33 6L26 11" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </LegendToggle>
      {hideOptions.length > 0 && (
        <span role="group" aria-label="Boxes shown" title={hidden > 0 ? `${hidden} ${hidden === 1 ? 'box' : 'boxes'} hidden` : undefined} className="inline-flex items-center gap-x-3 border-x border-line px-3">
          {hideOptions.map((hide) => {
            if (hide === 'unlinked') return <OnlyUnlinked key={hide} on={hides.unlinked} onToggle={() => onToggleHide(hide)} />
            const { label, name, icon: Icon } = HIDE_ENTRY[hide]
            return (
              <LegendToggle key={hide} name={name} label={label} shown={!hides[hide]} onToggle={() => onToggleHide(hide)}>
                <Icon aria-hidden className="size-3.5" />
              </LegendToggle>
            )
          })}
        </span>
      )}
      <span className="inline-flex items-center gap-x-2 font-mono text-[13px] font-bold">
        <span role="img" aria-label="+ added" title="+ a declaration the change added" className="cursor-help text-green">
          +
        </span>
        <span role="img" aria-label="− removed" title="− a declaration the change removed" className="cursor-help text-red">
          −
        </span>
        <span role="img" aria-label="~ changed" title="~ a declaration the change edited" className="cursor-help">
          ~
        </span>
      </span>
    </div>
  )
}

/** The root is titled by its own name in a grouping ("By feature"); the folders' root has none. */
function rootTitle(root: BlueprintPackage): string {
  return root.name === '' ? 'Whole change' : root.name
}

/** The Blueprint page's bar: where you are, how much is here, the legend, and the canvas controls. */
export function BlueprintToolbar({ diagram, chain, boxes, files, reviewed, selecting, viewSwitch, arrows, onToggleArrow, hideOptions, hides, hidden, onToggleHide, onNavigate, onZoomIn, onZoomOut, onFit, onTidy, onToggleSelect }: BlueprintToolbarProps) {
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
        <Legend arrows={arrows} onToggleArrow={onToggleArrow} hideOptions={hideOptions} hides={hides} hidden={hidden} onToggleHide={onToggleHide} />
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
        </div>
      </div>
    </div>
  )
}
