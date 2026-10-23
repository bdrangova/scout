import { useEffect, useState } from 'react'
import { Notice } from '@/components/ui/notice'
import { cn } from '@/lib/utils'

/** A log or test output as text, in a scrolling code box (it fills a flex parent; `className` caps its height elsewhere). */
export function EvidenceLog({ src, className }: { src: string; className?: string }) {
  const [state, setState] = useState<{ src: string; text?: string; failed?: boolean }>({ src })
  useEffect(() => {
    let live = true
    fetch(src).then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => live && setState({ src, text }), () => live && setState({ src, failed: true }))
    return () => { live = false }
  }, [src])
  if (state.src !== src || (state.text === undefined && !state.failed)) return <p className="m-0 p-4 text-ink-muted">Loading…</p>
  if (state.failed) return <Notice tone="warn">Log unavailable. <a href={src} target="_blank" rel="noreferrer" className="underline">Open it</a></Notice>
  return <pre className={cn('m-0 min-h-0 overflow-auto rounded-xl border-fine border-line bg-code p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap', className)}>{state.text}</pre>
}
