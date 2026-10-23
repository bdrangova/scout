import { ChevronRight, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RailDensity } from './useRailDensity'

/** The rail identity's chevron: switches between the roomy and the compact identity. */
export function DensityButton({ density, onClick }: { density: RailDensity; onClick: () => void }) {
  const roomy = density === 'roomy'
  const label = roomy ? 'Collapse session details' : 'Expand session details'
  const Icon = roomy ? ChevronUp : ChevronRight
  return (
    <Button variant="ghost" size="icon-sm" className="size-7 shrink-0 rounded-md" aria-label={label} title={label} aria-expanded={roomy} onClick={onClick}>
      <Icon aria-hidden className="size-3.5" />
    </Button>
  )
}

/** The compact identity: the chevron and the title are one button, so the whole row expands. */
export function CompactIdentity({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <div data-density="compact" className="h-[41px] shrink-0 border-b-fine border-line">
      <button
        type="button"
        aria-label="Expand session details"
        aria-expanded={false}
        title={title}
        onClick={onClick}
        className="flex size-full cursor-pointer items-center gap-1 bg-transparent px-2 text-left hover:bg-ink/5"
      >
        <ChevronRight aria-hidden className="size-3.5 shrink-0 mx-1.5" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{title}</span>
      </button>
    </div>
  )
}
