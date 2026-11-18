import type { BlueprintArrow } from '@scout/shared'
import { useCallback, useState } from 'react'

/** The two kinds of arrow a diagram draws; an arrow that carries an inheritance link is "extends", every other one "uses" (leans on). */
export type ArrowKind = 'extends' | 'uses'
export type ArrowKindsShown = Readonly<Record<ArrowKind, boolean>>

const ALL_SHOWN: ArrowKindsShown = { extends: true, uses: true }
const storageKey = (sessionId: string) => `scout:bp-arrows:${sessionId}`

export function arrowKindOf(arrow: BlueprintArrow): ArrowKind {
  return arrow.extends ? 'extends' : 'uses'
}

function read(sessionId: string): ArrowKindsShown {
  try {
    const hidden: unknown = JSON.parse(window.localStorage.getItem(storageKey(sessionId)) ?? '[]')
    if (!Array.isArray(hidden)) return ALL_SHOWN
    return { extends: !hidden.includes('extends'), uses: !hidden.includes('uses') }
  } catch {
    return ALL_SHOWN
  }
}

function write(sessionId: string, shown: ArrowKindsShown): void {
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify((Object.keys(shown) as ArrowKind[]).filter((kind) => !shown[kind])))
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

/** Which kinds of arrow the Blueprint draws, remembered per session (both by default). Hiding a kind only hides its arrows: the boxes stay where they are. */
export function useArrowKinds(sessionId: string): [ArrowKindsShown, (kind: ArrowKind) => void] {
  const [shown, setShown] = useState(() => read(sessionId))
  const toggle = useCallback(
    (kind: ArrowKind) => {
      setShown((current) => {
        const next = { ...current, [kind]: !current[kind] }
        write(sessionId, next)
        return next
      })
    },
    [sessionId],
  )
  return [shown, toggle]
}

/** What the Blueprint can leave out of a busy diagram: fully approved boxes, loose file boxes next to packages, and (`unlinked` = "only unlinked") every box an arrow touches. */
export type BoxHide = 'approved' | 'files' | 'unlinked'
export type BoxHides = Readonly<Record<BoxHide, boolean>>

const BOX_HIDES: readonly BoxHide[] = ['approved', 'files', 'unlinked']
const hidesKey = (sessionId: string) => `scout:bp-hide:${sessionId}`

function readHides(sessionId: string): BoxHides {
  let stored: unknown = []
  try {
    stored = JSON.parse(window.localStorage.getItem(hidesKey(sessionId)) ?? '[]')
  } catch {
    // Unreadable: nothing is hidden.
  }
  const on = Array.isArray(stored) ? stored : []
  return { approved: on.includes('approved'), files: on.includes('files'), unlinked: on.includes('unlinked') }
}

/** Which boxes the Blueprint hides, remembered per session (none by default). Hidden boxes keep their place: showing them again changes nothing else. */
export function useBoxHides(sessionId: string): [BoxHides, (hide: BoxHide) => void] {
  const [hides, setHides] = useState(() => readHides(sessionId))
  const toggle = useCallback(
    (hide: BoxHide) => {
      setHides((current) => {
        const next = { ...current, [hide]: !current[hide] }
        try {
          window.localStorage.setItem(hidesKey(sessionId), JSON.stringify(BOX_HIDES.filter((name) => next[name])))
        } catch {
          // Storage unavailable: the choice lasts for this page only.
        }
        return next
      })
    },
    [sessionId],
  )
  return [hides, toggle]
}
