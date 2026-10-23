import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Notice } from '@/components/ui/notice'
import { apiGet } from '@/lib/api'
import { repoFilePath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { HighlightedText } from './HighlightedText'

export interface RepoFileTarget {
  path: string
  line: number
  query: string
}

/** A repository file outside the diff, read-only with line numbers, opened on a search hit and scrolled to it. */
export function RepoFileDialog({ sessionId, target, onClose }: { sessionId: string; target: RepoFileTarget | null; onClose: () => void }) {
  const [state, setState] = useState<{ path: string; lines?: string[]; error?: string } | null>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const path = target?.path
  useEffect(() => {
    if (!path) return
    let live = true
    apiGet<string>(repoFilePath(sessionId, path)).then(
      (text) => live && setState({ path, lines: String(text ?? '').split('\n') }),
      (err: unknown) => live && setState({ path, error: err instanceof Error ? err.message : String(err) }),
    )
    return () => { live = false }
  }, [sessionId, path])
  const loaded = state && state.path === path ? state : null
  useEffect(() => {
    if (loaded?.lines) lineRef.current?.scrollIntoView({ block: 'center' })
  }, [loaded, target?.line])

  return <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="h-[85dvh] w-[calc(100vw-2rem)] max-w-none gap-3 sm:max-w-5xl grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      <DialogHeader>
        <DialogTitle className="truncate font-mono text-sm" title={target?.path}>{target?.path}</DialogTitle>
        <DialogDescription>Not part of this change · line {target?.line}</DialogDescription>
      </DialogHeader>
      {!loaded ? <p className="m-0 text-ink-muted">Loading…</p>
        : loaded.error ? <Notice tone="warn">{loaded.error}</Notice>
        : <div className="min-h-0 overflow-auto rounded-xl border-fine border-line bg-code py-2 font-mono text-xs leading-5">
          {loaded.lines!.map((text, i) => {
            const hit = i + 1 === target?.line
            return <div key={i} ref={hit ? lineRef : undefined} className={cn('flex min-w-max', hit && 'bg-yellow/40')}>
              <span className="w-12 shrink-0 pr-3 text-right text-ink-muted select-none">{i + 1}</span>
              <span className="pr-4 whitespace-pre">{target ? <HighlightedText text={text} query={target.query} /> : text}</span>
            </div>
          })}
        </div>}
    </DialogContent>
  </Dialog>
}
