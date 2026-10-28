import type { Verdict } from '@scout/shared'
import { useState } from 'react'

export type ExitDirection = 'left' | 'right' | 'up' | 'none'

/** A swipe commits past this horizontal offset (px) or velocity (px/s). */
export const SWIPE_OFFSET = 120
export const SWIPE_VELOCITY = 500

/** The stacked layers behind the card: each one steps in by this much and up by this much (px). */
export const PEEK_INSET = 16
export const PEEK_RISE = 13
/** How many of the next items show as layers behind the card. */
export const PEEK_COUNT = 2

export const cardVariants = {
  enter: { y: 10, scale: 0.985 },
  center: { y: 0, scale: 1, transition: { duration: 0.18 } },
  exit: (direction: ExitDirection) => {
    switch (direction) {
      case 'right':
        return { x: 720, rotate: 14, opacity: 0, transition: { duration: 0.28 } }
      case 'left':
        return { x: -720, rotate: -14, opacity: 0, transition: { duration: 0.28 } }
      case 'up':
        return { y: -48, opacity: 0, transition: { duration: 0.2 } }
      default:
        return { opacity: 0, transition: { duration: 0.12 } }
    }
  },
}

interface Signature {
  verdict: Verdict
  openComments: number
}

interface Tracked extends Signature {
  key: string
  exitDirection: ExitDirection
}

/**
 * The fly-off direction of the card that is about to leave, derived from what happened to it: approved
 * flies right, rejected flies left, a comment-only advance lifts off, anything else fades.
 */
export function useExitDirection(currentKey: string, signatureOf: (key: string) => Signature): ExitDirection {
  const [tracked, setTracked] = useState<Tracked>(() => ({ key: currentKey, ...signatureOf(currentKey), exitDirection: 'none' }))
  const signature = signatureOf(currentKey)
  if (tracked.key !== currentKey) {
    const previous = signatureOf(tracked.key)
    let exitDirection: ExitDirection = 'none'
    if (previous.verdict === 'approved' && tracked.verdict !== 'approved') exitDirection = 'right'
    else if (previous.verdict === 'rejected' && tracked.verdict !== 'rejected') exitDirection = 'left'
    else if (previous.openComments > tracked.openComments) exitDirection = 'up'
    setTracked({ key: currentKey, ...signature, exitDirection })
  } else if (tracked.verdict !== signature.verdict || tracked.openComments !== signature.openComments) {
    setTracked({ ...tracked, ...signature })
  }
  return tracked.exitDirection
}
