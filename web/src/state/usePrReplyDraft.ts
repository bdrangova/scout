import type { PrCommentView, PrReplyKind } from '@scout/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isKindMismatch } from '@/lib/pr-replies'
import { AUTOSAVE_DELAY_MS } from './useAutosave'
import { usePrComments } from './pr-comments-context'

export type ReplySaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface PrReplyDraftState {
  /** What the textarea shows: the draft, else the agent's proposal, else empty. */
  value: string
  onChange: (value: string) => void
  /** Saves what is pending now (blur, Esc, "Use this reply"); resolves false after a failed save. */
  flush: () => Promise<boolean>
  /** Queues the shown text as the draft even when it was not edited (accepting the proposal); the one place a `reply` kind is sent. */
  accept: () => Promise<boolean>
  /** Empties the box and saves it (a blank save deletes the draft). */
  clear: () => Promise<boolean>
  /** The server refused the last save: the comment changed, so the draft's kind no longer fits. The text stays, nothing is retried. */
  mismatch: boolean
  status: ReplySaveStatus
}

/**
 * The text of one PR thread's box, saved as the user's draft 250 ms after the last keystroke (same delay as the
 * review's autosave). A proposal fills the box but is not a draft until it is edited or accepted. A
 * `pr-comments.updated` refetch never overwrites text the user is still editing. The box registers its flush
 * with the provider, so Submit saves a reply typed a moment before the click.
 */
export function usePrReplyDraft(root: PrCommentView): PrReplyDraftState {
  const { saveReply, registerReplyFlush } = usePrComments()
  const commentId = root.id
  const serverBody = root.draftReply?.body ?? null
  const source = serverBody ?? root.proposedReply ?? ''
  const [value, setValue] = useState(source)
  const [seenSource, setSeenSource] = useState(source)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<ReplySaveStatus>('idle')
  const [mismatch, setMismatch] = useState(false)

  // The text the server holds for this root ('' = no draft), whether the user touched the box, and what is typed.
  const savedRef = useRef(serverBody ?? '')
  const touchedRef = useRef(false)
  const latestRef = useRef(value)
  const timerRef = useRef<number | null>(null)
  const queueRef = useRef<Promise<boolean>>(Promise.resolve(true))
  // Set by `accept` for the next save only; autosaves send no kind.
  const kindRef = useRef<PrReplyKind | null>(null)

  if (seenSource !== source) {
    setSeenSource(source)
    if (!dirty) setValue(source)
  }
  useEffect(() => {
    latestRef.current = value
  })

  const flush = useCallback((): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const run = queueRef.current.then(async () => {
      const kind = kindRef.current
      kindRef.current = null
      const body = latestRef.current
      if (!touchedRef.current || body === savedRef.current) return true
      setStatus('saving')
      try {
        if (kind === null) await saveReply(commentId, body)
        else await saveReply(commentId, body, kind)
        savedRef.current = body
        setMismatch(false)
        setStatus('saved')
        if (latestRef.current === body) setDirty(false)
        return true
      } catch (reason: unknown) {
        if (isKindMismatch(reason)) {
          // Not retried and not overwritten: the text stays in the box and the user clears it on purpose.
          savedRef.current = body
          setMismatch(true)
          setStatus('error')
          return false
        }
        const message = reason instanceof Error ? reason.message : String(reason)
        toast.error("Couldn't save the text", { description: `${message}. Retries on next change.` })
        setStatus('error')
        return false
      }
    })
    queueRef.current = run
    return run
  }, [commentId, saveReply])

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  useEffect(() => registerReplyFlush(flush), [registerReplyFlush, flush])
  // Leaving the page (or the card) saves what is typed.
  useEffect(
    () => () => {
      void flushRef.current()
    },
    [],
  )

  const onChange = useCallback(
    (next: string) => {
      touchedRef.current = true
      latestRef.current = next
      setValue(next)
      setDirty(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void flush()
      }, AUTOSAVE_DELAY_MS)
    },
    [flush],
  )

  const accept = useCallback(() => {
    touchedRef.current = true
    kindRef.current = 'reply'
    setDirty(true)
    return flush()
  }, [flush])

  const clear = useCallback(() => {
    touchedRef.current = true
    latestRef.current = ''
    setValue('')
    setDirty(true)
    return flush()
  }, [flush])

  return { value, onChange, flush, accept, clear, mismatch, status }
}
