import type { SpecItem } from '@review-dash/shared'
import { ExternalLink } from 'lucide-react'
import { Markdown } from '@/components/common/Markdown'
import { useContent } from '@/lib/useContent'
import { SpecCardShell } from './SpecCardShell'

export interface JiraCardProps {
  item: SpecItem
  sessionId: string
  className?: string
}

/** `QI-15472: Trial bar` → key and title. */
function splitJiraTitle(title: string): { key: string | null; rest: string } {
  const match = /^([A-Z][A-Z0-9]+-\d+)\s*[:\-–]?\s*(.*)$/.exec(title.trim())
  if (!match) return { key: null, rest: title }
  return { key: match[1] ?? null, rest: match[2] ?? '' }
}

export function JiraCard({ item, sessionId, className }: JiraCardProps) {
  const content = useContent(sessionId, 'spec', item.path)
  const { key, rest } = splitJiraTitle(item.title)
  return (
    <SpecCardShell
      kind="Jira"
      item={item}
      className={className}
      title={
        <>
          {key && <span className="mr-2 font-mono text-info">{key}</span>}
          {rest || (key ? '' : item.title)}
        </>
      }
      actions={
        item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            Open in Jira
            <ExternalLink className="size-3" />
          </a>
        )
      }
      content={content}
    >
      {(text) => <Markdown source={text} />}
    </SpecCardShell>
  )
}
