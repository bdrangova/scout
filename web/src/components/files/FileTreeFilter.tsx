import { Search, TextSearch, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface FileTreeFilterProps {
  query: string
  onChange: (query: string) => void
  /** `n of total` while a filter is on. */
  matches?: { shown: number; total: number }
  /** Searching file contents instead of filtering names. */
  contents?: boolean
  onToggleContents?: () => void
  /** The "only commented" toggle, drawn before the contents toggle. */
  commented?: ReactNode
}

/**
 * The tree's search box: Esc or the cross clears it; the match count is announced beside it.
 * The toggle beside it switches from filtering names to searching the changes' contents.
 */
export function FileTreeFilter({ query, onChange, matches, contents = false, onToggleContents, commented }: FileTreeFilterProps) {
  const label = contents ? 'Search in changes' : 'Filter files'
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
          placeholder={`${label}…`}
          aria-label={label}
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
      {commented}
      {onToggleContents && (
        <button
          type="button"
          aria-pressed={contents}
          aria-label="Search file contents"
          title={contents ? 'Back to filtering file names' : 'Search file contents'}
          onClick={onToggleContents}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md border-fine border-line text-ink-muted hover:bg-hover hover:text-ink',
            contents && 'border-ink bg-ink text-paper hover:bg-ink hover:text-paper',
          )}
        >
          <TextSearch aria-hidden className="size-4" />
        </button>
      )}
      {matches && (
        <span className="shrink-0 text-xs font-semibold text-ink-muted tabular-nums" aria-live="polite">
          {matches.shown} of {matches.total}
        </span>
      )}
    </div>
  )
}
