import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface FileTreeFilterProps {
  query: string
  onChange: (query: string) => void
  /** `n of total` while a filter is on. */
  matches?: { shown: number; total: number }
}

/** The tree's search box: Esc or the cross clears it; the match count is announced beside it. */
export function FileTreeFilter({ query, onChange, matches }: FileTreeFilterProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 pb-2">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted" />
        <Input
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== '') {
              event.preventDefault()
              onChange('')
            }
          }}
          placeholder="Filter files…"
          aria-label="Filter files"
          autoComplete="off"
          className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Clear filter"
            title="Clear filter"
            onClick={() => onChange('')}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-muted hover:bg-hover hover:text-ink"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {matches && (
        <span className="shrink-0 text-xs font-semibold text-ink-muted tabular-nums" aria-live="polite">
          {matches.shown} of {matches.total}
        </span>
      )}
    </div>
  )
}
