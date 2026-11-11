import { Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The web app running out of a worktree, as `localhost:8098`, opening in a new tab without opening the card. */
export function AppLink({ url, className }: { url: string; className?: string }) {
  const label = url.replace(/^https?:\/\//, '')
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`App running at ${label}`}
      title={`App running at ${label}`}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-xs text-info-bd underline-offset-4 hover:bg-hover hover:underline focus-visible:bg-hover focus-visible:underline',
        className,
      )}
    >
      <Link2 aria-hidden className="size-3.5" />
      <span>{label}</span>
    </a>
  )
}
