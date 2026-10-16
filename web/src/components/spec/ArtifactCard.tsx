import type { SpecItem } from '@review-dash/shared'
import { ExternalLink } from 'lucide-react'
import { SandboxedHtml } from '@/components/common/SandboxedHtml'
import { useContent } from '@/lib/useContent'
import { SpecCardShell } from './SpecCardShell'

export interface ArtifactCardProps {
  item: SpecItem
  sessionId: string
  className?: string
}

/** An exported claude.ai artifact, rendered in the sandbox; the live page cannot be embedded. */
export function ArtifactCard({ item, sessionId, className }: ArtifactCardProps) {
  const content = useContent(sessionId, 'spec', item.path)
  return (
    <SpecCardShell
      kind="Artifact"
      item={item}
      className={className}
      title={item.title}
      actions={
        item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            Open on claude.ai
            <ExternalLink className="size-3" />
          </a>
        )
      }
      content={content}
    >
      {(html) => <SandboxedHtml html={html} title={item.title} maxHeight={900} />}
    </SpecCardShell>
  )
}
