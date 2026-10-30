import { ContentCard } from '@/components/common/ContentCard'
import { Markdown } from '@/components/common/Markdown'
import { DESCRIPTION_KIND } from './summary-cards'

/** The PR description as its author wrote it (third-party text: links confirm, only GitHub images load). */
export function PrDescriptionCard({ description, author }: { description: string; author: string }) {
  return (
    <ContentCard label="PR description" kind={DESCRIPTION_KIND} title="Description" subtitle={`by ${author}`} collapseLabel="Description">
      {description.trim() ? <Markdown variant="untrusted" source={description} /> : <p className="m-0 text-sm text-ink-muted">The author wrote no description.</p>}
    </ContentCard>
  )
}
