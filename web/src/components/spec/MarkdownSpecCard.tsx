import type { SpecItem } from '@review-dash/shared'
import { Check, Copy, FileText, HardDrive } from 'lucide-react'
import { useState } from 'react'
import { KindTag } from '@/components/common/KindTag'
import { Markdown } from '@/components/common/Markdown'
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
      icon={FileText}
      item={item}
      className={className}
      title={<span className="font-mono">{name}</span>}
      subtitle={item.title && item.title !== name ? item.title : undefined}
      actions={
        sourcePath && (
          <>
            <KindTag icon={HardDrive} label="Local file" pill title={`Local file: ${sourcePath}`} />
            <Button size="icon-sm" aria-label={copied ? 'Copied' : 'Copy path'} title={copied ? 'Copied' : `Copy path: ${sourcePath}`} onClick={() => void copyPath()}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
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
