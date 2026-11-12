import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** The small refresh icon button the lists share; it spins while a load is in flight. */
export function RefreshButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" title="Refresh" aria-label={label} disabled={busy} aria-busy={busy} onClick={onClick}>
      <RefreshCw aria-hidden className={busy ? 'animate-spin motion-reduce:animate-none' : undefined} />
    </Button>
  )
}
