import type { SpecItem } from '@scout/shared'
import { ExternalLink, Package } from 'lucide-react'
import { IconLink } from '@/components/common/IconLink'
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
      icon={Package}
      item={item}
      className={className}
      title={item.title}
      actions={
        item.url && (
          <IconLink showLabel href={item.url} label="Open on claude.ai">
            <ExternalLink aria-hidden />
          </IconLink>
        )
      }
      content={content}
    >
      {(html) => <SandboxedHtml html={html} title={item.title} maxHeight={900} />}
    </SpecCardShell>
  )
}
