import type { EvidenceItem } from '@scout/shared'
import { useHotkeys } from '@/lib/useHotkeys'

/** Position in the evidence list and `←/→` movement; the URL (via `onChange`) holds the current item. */
export function useEvidenceNav(items: readonly EvidenceItem[], currentPath: string, onChange: (path: string) => void) {
  const index = Math.max(0, items.findIndex((item) => item.path === currentPath))

  function go(delta: number) {
    const next = items[index + delta]
    if (next) onChange(next.path)
  }

  useHotkeys({ prev: () => go(-1), next: () => go(1) })
  return { index, hasPrev: index > 0, hasNext: index < items.length - 1, go }
}
