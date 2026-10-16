import type { SpecItem } from '@review-dash/shared'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Markdown } from '@/components/common/Markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { splitPath } from '@/lib/paths'
import { useContent } from '@/lib/useContent'
import { SpecCardShell } from './SpecCardShell'

export interface MarkdownSpecCardProps {
  item: SpecItem
  sessionId: string
  className?: string
}

/** A plan or notes file copied into the session; `sourcePath` points at the original on disk. */
export function MarkdownSpecCard({ item, sessionId, className }: MarkdownSpecCardProps) {
  const content = useContent(sessionId, 'spec', item.path)
  const [copied, setCopied] = useState(false)
  const { name } = splitPath(item.path)
  const sourcePath = item.sourcePath

  async function copyPath() {
    if (!sourcePath) return
    try {
      await navigator.clipboard.writeText(sourcePath)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (insecure context); the tooltip still shows the path.
    }
  }

  return (
    <SpecCardShell
      kind="Markdown"
      item={item}
      className={className}
      title={
        <>
          <span className="font-mono">{name}</span>
          {item.title && item.title !== name && <span className="ml-2 font-normal text-muted-foreground">{item.title}</span>}
        </>
      }
      actions={
        sourcePath && (
          <>
            <Badge variant="outline" title={sourcePath} className="font-mono text-[11px]">
              local file
            </Badge>
            <Button variant="ghost" size="xs" onClick={() => void copyPath()} title={sourcePath}>
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? 'Copied' : 'Copy path'}
            </Button>
          </>
        )
      }
      content={content}
    >
      {(text) => <Markdown source={text} />}
    </SpecCardShell>
  )
}
