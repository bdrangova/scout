import { useCallback, useEffect, useRef, useState } from 'react'

/** Copies `command` to the clipboard on `copy()`; `copied` stays true for a moment, `failed` when the browser refused. */
export function useCopyCommand(command: string): { copied: boolean; failed: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  const copy = useCallback(() => {
    navigator.clipboard.writeText(command).then(
      () => {
        setFailed(false)
        setCopied(true)
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1500)
      },
      () => setFailed(true),
    )
  }, [command])
  return { copied, failed, copy }
}
