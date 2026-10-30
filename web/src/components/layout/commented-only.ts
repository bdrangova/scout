import type { CommentTarget } from '@scout/shared'
import { createContext, useContext, useMemo } from 'react'
import { useReview } from '@/state/review-context'

export interface CommentedOnlyState {
  /** The reviewer asked the rail to list only the items carrying their open comments. */
  on: boolean
  toggle: () => void
}

/**
 * The rail-wide "only commented" switch (owned by `SidebarProvider`): one choice for every page's
 * list, so it stays on from Files to Spec to Evidence. Off, and inert, outside a session shell.
 */
export const CommentedOnlyContext = createContext<CommentedOnlyState>({ on: false, toggle: () => {} })

/** Open comments per ref, over the given target kinds. */
export function useOpenCommentRefs(...kinds: CommentTarget['kind'][]): ReadonlyMap<string, number> {
  const { comments } = useReview()
  const key = kinds.join(',')
  return useMemo(() => {
    const wanted = new Set(key.split(','))
    const counts = new Map<string, number>()
    for (const { target, status } of comments) {
      if (status !== 'open' || target.ref === null || !wanted.has(target.kind)) continue
      counts.set(target.ref, (counts.get(target.ref) ?? 0) + 1)
    }
    return counts
  }, [comments, key])
}

export interface CommentedOnlyFilter<T> {
  /** The list to draw: only the commented items while the filter is active. */
  items: readonly T[]
  /** Items with open comments; the toggle is disabled at zero. */
  count: number
  /** On, with something to show. */
  active: boolean
  toggle: () => void
}

/** Narrows one rail list by the rail-wide switch; `isCommented` says which items carry open comments. */
export function useCommentedOnlyFilter<T>(items: readonly T[], isCommented: (item: T) => boolean): CommentedOnlyFilter<T> {
  const { on, toggle } = useContext(CommentedOnlyContext)
  const commented = items.filter(isCommented)
  const active = on && commented.length > 0
  return { items: active ? commented : items, count: commented.length, active, toggle }
}
