import type { CommentTarget, ExtraItem } from '@review-dash/shared'
import { useMemo } from 'react'
import { Markdown } from '@/components/common/Markdown'
import { SandboxedHtml } from '@/components/common/SandboxedHtml'
import { TargetComments } from '@/components/common/TargetComments'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { splitPath } from '@/lib/paths'
import { useContent } from '@/lib/useContent'

export interface ExtraCardProps {
  item: ExtraItem
  sessionId: string
}

const KIND_LABEL = { markdown: 'Markdown', mermaid: 'Mermaid', html: 'HTML' } as const

/** A `.mmd` file is a single diagram: render it through the markdown pipeline as a mermaid fence. */
function wrapMermaid(source: string): string {
  return '```mermaid\n' + source.replace(/\n?$/, '\n') + '```'
}

/** One file of `extras/`, fetched live; comments are keyed by its path relative to that folder. */
export function ExtraCard({ item, sessionId }: ExtraCardProps) {
  const content = useContent(sessionId, 'extras', item.path)
  const target = useMemo<CommentTarget>(() => ({ kind: 'extra', ref: item.path }), [item.path])

  let body = null
  if (content.error) {
    body = (
      <div className="flex flex-col items-start gap-2 text-sm text-reject">
        <p>Couldn't load this file: {content.error.message}</p>
        <Button variant="outline" size="xs" onClick={content.reload}>
          Retry
        </Button>
      </div>
    )
  } else if (content.content === null) {
    body = (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        Loading…
      </p>
    )
  } else if (item.type === 'html') {
    body = <SandboxedHtml html={content.content} title={item.title} />
  } else {
    body = <Markdown source={item.type === 'mermaid' ? wrapMermaid(content.content) : content.content} />
  }

  return (
    <article aria-label={item.title} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{KIND_LABEL[item.type]}</Badge>
        <h3 className="text-[15px] font-semibold">{item.title}</h3>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground" title={item.path}>
          {splitPath(item.path).name}
        </span>
      </header>
      {body}
      <TargetComments target={target} label={`Comment on ${item.title}`} className="flex flex-col gap-3 border-t pt-4" />
    </article>
  )
}
