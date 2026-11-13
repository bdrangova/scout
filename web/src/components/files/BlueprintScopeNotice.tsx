import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { blueprintRoute } from '@/lib/blueprint'

interface Props {
  sessionId: string
  diagramId: string
  title: string
  count: number
  /** 1-based place of the open file among the diagram's files; 0 when none is open. */
  position?: number
  /** The files are the ones picked on the Blueprint page, not the diagram's own: the line says so. */
  selected?: boolean
  onShowAll: () => void
}

/** The one line above the card while the Files page is limited to one Blueprint diagram: the way back, where you are, and the way out. */
export function BlueprintScopeNotice({ sessionId, diagramId, title, count, position = 0, selected = false, onShowAll }: Props) {
  return (
    <section aria-label="Blueprint scope" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink">
      <Link to={blueprintRoute(sessionId, diagramId)} aria-label="Back to Blueprint" className="inline-flex items-center gap-1.5 rounded-md py-1 pr-1 font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-3.5" />
        Blueprint
      </Link>
      <ChevronRight aria-hidden className="size-3.5 text-ink-muted" />
      <span className={selected ? 'min-w-0 truncate font-bold' : 'min-w-0 flex-1 truncate font-bold'}>{title}</span>
      {selected && (
        <>
          <ChevronRight aria-hidden className="size-3.5 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate font-bold tabular-nums">
            {count} selected {count === 1 ? 'file' : 'files'}
          </span>
        </>
      )}
      {(!selected || position > 0) && (
        <span className="shrink-0 font-semibold text-ink-muted tabular-nums" aria-label={`${count} ${count === 1 ? 'file' : 'files'}`}>
          {position > 0 ? `${position} / ${count}` : `${count} ${count === 1 ? 'file' : 'files'}`}
        </span>
      )}
      <Button variant="ghost" size="sm" className="h-7" onClick={onShowAll}>
        Show all files
      </Button>
    </section>
  )
}
