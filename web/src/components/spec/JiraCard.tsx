import type { SpecItem } from '@scout/shared'
import { ClipboardList, ExternalLink } from 'lucide-react'
import { IconLink } from '@/components/common/IconLink'
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
      kindLabel="Jira ticket"
      icon={ClipboardList}
      item={item}
      className={className}
      title={
        <>
          {key && <span className="mr-1 font-mono font-bold text-focus">{key}</span>}
          {rest || (key ? '' : item.title)}
        </>
      }
      actions={
        item.url && (
          <IconLink showLabel href={item.url} label="Open in Jira">
            <ExternalLink aria-hidden />
          </IconLink>
        )
      }
      content={content}
    >
      {(text) => <Markdown source={text} />}
    </SpecCardShell>
  )
}
