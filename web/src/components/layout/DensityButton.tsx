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
