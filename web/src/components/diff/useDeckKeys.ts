import { effectiveVerdict, type TreeFile } from '@scout/shared'
import { useReducer } from 'react'
import type { ScopeReview } from '@/lib/scope'
import type { HotkeyHandlers } from '@/lib/useHotkeys'
import { useReview } from '@/state/review-context'
import { useVerdictAction } from './useVerdictAction'

export interface DeckKeysOptions {
  /** The cards in order. */
  files: readonly TreeFile[]
  /** The open card (null when its path is not in `files`). */
  current: TreeFile | null
  /** The full diff by path: verdicts are pinned to its fingerprints. */
  fullByPath: ReadonlyMap<string, TreeFile>
  /** Set when `files` are one commit scope's files: its own advance replaces the reducer's. */
  scopeReview?: ScopeReview
  /** At the end panel a step with no neighbour still leaves it, on the current file, and the verdict keys do nothing. */
  ended?: boolean
  onGoTo: (path: string) => void
}

export interface DeckKeys {
  /** Bump token for the card's comment box (`C`, and a reject that waits for its comment). */
  commentFocusToken: number
  setVerdict: (file: TreeFile, verdict: 'approved' | 'rejected') => void
  /** Previous, next, approve, reject and comment: bind with `useHotkeys`. */
  hotkeys: HotkeyHandlers
}

/** What the card keys do, shared by the Files page and the Blueprint card overlay so both review through the same actions. */
export function useDeckKeys({ files, current, fullByPath, scopeReview, ended = false, onGoTo }: DeckKeysOptions): DeckKeys {
  const { state } = useReview()
  const sendVerdict = useVerdictAction()
  const [commentFocusToken, bumpCommentFocus] = useReducer((count: number) => count + 1, 0)

  /** A verdict is pinned to the full diff's fingerprint of the path, never to a scope file's. */
  function setVerdict(file: TreeFile, verdict: 'approved' | 'rejected') {
    const reviewFile = fullByPath.get(file.path)
    if (!reviewFile) return
    const clearing = effectiveVerdict(state.review.files[file.path], reviewFile) === verdict
    const withComment = sendVerdict(file.path, verdict, reviewFile.fingerprint)
    if (!clearing && (verdict === 'approved' || withComment)) scopeReview?.advanceFrom(file.path)
  }

  function stepBy(delta: number) {
    if (!current) return
    const index = files.indexOf(current)
    const next = (index === -1 ? undefined : files[index + delta]) ?? (ended ? current : undefined)
    if (next) onGoTo(next.path)
  }

  const stepHotkeys: HotkeyHandlers = { prev: () => stepBy(-1), next: () => stepBy(1) }
  // Behind the end panel the cards are out of reach: the verdict keys do nothing.
  const hotkeys: HotkeyHandlers = ended
    ? stepHotkeys
    : {
        ...stepHotkeys,
        approve: () => {
          if (current) setVerdict(current, 'approved')
        },
        reject: () => {
          if (!current || !fullByPath.has(current.path)) return
          setVerdict(current, 'rejected')
          bumpCommentFocus()
        },
        comment: bumpCommentFocus,
      }
  return { commentFocusToken, setVerdict, hotkeys }
}
