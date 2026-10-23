import type { PutReviewConflict, PutReviewRequest, PutReviewResponse, Review, ReviewAction } from '@review-dash/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiRequestError, apiPut } from '@/lib/api'
import type { SaveStatus } from './review-context'

export const AUTOSAVE_DELAY_MS = 250

export interface Autosave {
  status: SaveStatus
  /**
   * Saves now whatever is pending, waiting for a save already in flight. Resolves true when the
   * server holds the latest review; false after a failure or a 409 (which reloads the server's copy).
   */
  flush: () => Promise<boolean>
}

export interface AutosaveOptions {
  sessionId: string
  review: Review
  /** `updatedAt` of the review as loaded from the server: the first PUT's `baseUpdatedAt`. */
  initialBase: string
  /** The raw reducer dispatch, used to `LOAD` the server's copy after a 409. */
  dispatch: (action: ReviewAction) => void
  /** True while a load is in flight: nothing is saved meanwhile. */
  paused?: boolean
}

function reviewPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}/review`
}

function isConflict(body: unknown): body is PutReviewConflict {
  return typeof body === 'object' && body !== null && 'current' in body && typeof body.current === 'object'
}

/** A verdict was stored or cleared between two versions of the review. */
export function verdictChanged(previous: Review, next: Review): boolean {
  for (const [path, file] of Object.entries(next.files)) {
    if ((previous.files[path]?.verdict ?? 'none') !== file.verdict) return true
  }
  for (const path of Object.keys(previous.files)) {
    if (!(path in next.files) && previous.files[path]?.verdict !== 'none') return true
  }
  return false
}

/** Fire-and-forget PUT that survives navigation (`pagehide`, SPA unmount). */
function sendKeepalive(sessionId: string, body: PutReviewRequest): void {
  void fetch(`/api${reviewPath(sessionId)}`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined)
}

/**
 * PUTs the whole review 250 ms after the last change, immediately after a verdict is stored,
 * and with `keepalive` when the page hides or the provider unmounts. `baseUpdatedAt` follows the
 * server's last `updatedAt`; a 409 replaces the local review with the server's copy.
 */
export function useAutosave({ sessionId, review, initialBase, dispatch, paused = false }: AutosaveOptions): Autosave {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const baseRef = useRef(initialBase)
  /** The last review known to match the server (loaded, saved, or reloaded after a 409). */
  const syncedRef = useRef(review)
  const latestRef = useRef(review)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const queuedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    latestRef.current = review
  })

  const flush = useCallback((): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) {
      // The running loop saves again once more before it resolves.
      queuedRef.current = true
      return inFlightRef.current
    }

    async function saveOnce(): Promise<boolean> {
      const snapshot = latestRef.current
      if (snapshot === syncedRef.current) return true
      setStatus('saving')
      try {
        const body: PutReviewRequest = { review: snapshot, baseUpdatedAt: baseRef.current }
        const result = await apiPut<PutReviewResponse>(reviewPath(sessionId), body)
        baseRef.current = result.updatedAt
        syncedRef.current = snapshot
        setStatus('idle')
        return true
      } catch (reason: unknown) {
        if (reason instanceof ApiRequestError && reason.status === 409 && isConflict(reason.body)) {
          const current = reason.body.current
          baseRef.current = current.updatedAt
          syncedRef.current = current
          dispatch({ type: 'LOAD', review: current })
          toast.warning('Review reloaded from disk', {
            description: 'Changed elsewhere; your edits were replaced.',
          })
          setStatus('idle')
        } else {
          const message = reason instanceof Error ? reason.message : String(reason)
          toast.error("Couldn't save the review", { description: `${message}. Retries on next change.` })
          setStatus('error')
        }
        return false
      }
    }

    const run = (async (): Promise<boolean> => {
      // Changes made while a save was in flight are saved right after it (unless it failed:
      // then the next change retries).
      let ok = true
      let again = true
      while (again) {
        queuedRef.current = false
        ok = await saveOnce()
        again = ok && queuedRef.current
      }
      return ok
    })().finally(() => {
      queuedRef.current = false
      inFlightRef.current = null
    })
    inFlightRef.current = run
    return run
  }, [sessionId, dispatch])

  useEffect(() => {
    if (paused) return
    if (review === syncedRef.current) return
    if (verdictChanged(syncedRef.current, review)) {
      void flush()
      return
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flush()
    }, AUTOSAVE_DELAY_MS)
  }, [review, paused, flush])

  useEffect(() => {
    function saveIfDirty() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const snapshot = latestRef.current
      if (snapshot === syncedRef.current) return
      syncedRef.current = snapshot
      sendKeepalive(sessionId, { review: snapshot, baseUpdatedAt: baseRef.current })
    }
    window.addEventListener('pagehide', saveIfDirty)
    return () => {
      window.removeEventListener('pagehide', saveIfDirty)
      saveIfDirty()
    }
  }, [sessionId])

  return { status, flush }
}
