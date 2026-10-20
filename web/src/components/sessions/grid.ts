/**
 * Below `lg` each row stacks (identity, then a wrapped meta row); at `lg` and up the head and the
 * rows share one grid whose first column takes the leftover width so titles stay readable.
 */
export const SESSION_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_172px_136px_204px_84px_64px] lg:items-center lg:gap-x-4'

/** Wraps the meta cells so they flow below `lg` and dissolve into grid items at `lg`. */
export const SESSION_META = 'flex flex-wrap items-center gap-x-4 gap-y-2 lg:contents'
