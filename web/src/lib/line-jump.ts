import { useSyncExternalStore } from 'react'
import type { LineSide } from '@scout/shared'

/** A request to bring one diff line into view and highlight it (from content search). */
export interface LineJump {
  path: string
  side: LineSide
  line: number
  /** Distinguishes a repeated jump to the same line. */
  nonce: number
}

let current: LineJump | null = null
let nonce = 0
const listeners = new Set<() => void>()

export function requestLineJump(path: string, side: LineSide, line: number): void {
  current = { path, side, line, nonce: ++nonce }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The latest jump when it targets `path`, else null. */
export function useLineJump(path: string | undefined): LineJump | null {
  const jump = useSyncExternalStore(subscribe, () => current)
  return jump && jump.path === path ? jump : null
}

/** The rendered row of a diff line inside the library's shadow root (deletions carry the old number). */
export function findDiffRow(root: ParentNode, side: LineSide, line: number): Element | null {
  const rows = [...root.querySelectorAll(`[data-line="${line}"]`)]
  const match = rows.filter((row) => (row.getAttribute('data-line-type') === 'change-deletion') === (side === 'old'))
  return (side === 'new' ? match.at(-1) : match[0]) ?? null
}
