import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { cn } from '@/lib/utils'

export interface AsyncBoundaryProps {
  /** True while the first result is on its way (a reload keeps the stale children). */
  loading: boolean
  error: Error | null
  /** Offered as a Retry button next to the error. */
  onRetry?: () => void
  /** Prefix of the error line: `Couldn't load this file`. */
  errorLabel?: string
  /** True when the load settled with nothing to show; renders `emptyState`. */
  empty?: boolean
  emptyState?: ReactNode
  /** Replaces the default pulsing lines while loading. */
  skeleton?: ReactNode
  className?: string
  children: ReactNode
}

/** Three pulsing text lines, as tall as a short paragraph. */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex animate-pulse flex-col gap-2.5 py-1', className)} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={cn('block h-3 rounded-sm bg-sunken', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/**
 * The loading / error / empty states shared by every card and list that waits on the API.
 * The error is a `Notice` (role=alert) with a Retry button; the children render only once settled.
 */
export function AsyncBoundary({ loading, error, onRetry, errorLabel = "Couldn't load this file", empty = false, emptyState, skeleton, className, children }: AsyncBoundaryProps) {
  if (error) {
    return (
      <div data-slot="async-error" className={cn('flex flex-wrap items-center gap-3', className)}>
        <Notice tone="err" className="min-w-0 flex-1 [&>span:last-child]:truncate">
          {errorLabel}: {error.message}
        </Notice>
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Retry
          </Button>
        )}
      </div>
    )
  }
  if (loading) {
    return (
      <div data-slot="async-loading" aria-busy="true" className={className}>
        <span className="sr-only">Loading…</span>
        {skeleton ?? <Skeleton />}
      </div>
    )
  }
  if (empty) return <>{emptyState ?? null}</>
  return <>{children}</>
}
