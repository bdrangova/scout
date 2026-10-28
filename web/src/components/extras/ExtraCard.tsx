import type { CommentTarget, ExtraItem } from '@scout/shared'
import { Code, FileText, Workflow, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { ContentCard } from '@/components/common/ContentCard'
import { Markdown } from '@/components/common/Markdown'
import { SandboxedHtml } from '@/components/common/SandboxedHtml'
import { TargetComments } from '@/components/common/TargetComments'
import { splitPath } from '@/lib/paths'
import { useContent } from '@/lib/useContent'

export interface ExtraCardProps {
  item: ExtraItem
  sessionId: string
}

const KIND: Record<ExtraItem['type'], { icon: LucideIcon; label: string }> = {
  markdown: { icon: FileText, label: 'Markdown' },
  mermaid: { icon: Workflow, label: 'Mermaid' },
  html: { icon: Code, label: 'HTML' },
}

/** A `.mmd` file is a single diagram: render it through the markdown pipeline as a mermaid fence. */
function wrapMermaid(source: string): string {
  return '```mermaid\n' + source.replace(/\n?$/, '\n') + '```'
}

/** One file of `extras/`, fetched live; comments are keyed by its path relative to that folder. */
export function ExtraCard({ item, sessionId }: ExtraCardProps) {
  const content = useContent(sessionId, 'extras', item.path)
  const target = useMemo<CommentTarget>(() => ({ kind: 'extra', ref: item.path }), [item.path])

  return (
    <ContentCard
      label={item.title}
      kind={KIND[item.type]}
      title={item.title}
      actions={
        <span className="font-mono text-xs font-medium text-ink-muted" title={item.path}>
          {splitPath(item.path).name}
        </span>
      }
      content={content}
      footer={<TargetComments target={target} label={`Comment on ${item.title}`} className="flex flex-col gap-3" />}
    >
      {(text) =>
        item.type === 'html' ? (
          <SandboxedHtml html={text} title={item.title} />
        ) : (
          <Markdown source={item.type === 'mermaid' ? wrapMermaid(text) : text} tallDiagrams />
        )
      }
    </ContentCard>
  )
}
