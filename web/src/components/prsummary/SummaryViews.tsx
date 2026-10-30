import type { CodeReviewDetail, PrReviewReport } from '@scout/shared'
import { ItemGrid, ItemTile } from '@/components/common/ItemGrid'
import { RailSection } from '@/components/layout/RailSlot'
import { ArtifactCard } from '@/components/spec/ArtifactCard'
import { JiraCard } from '@/components/spec/JiraCard'
import { MarkdownSpecCard } from '@/components/spec/MarkdownSpecCard'
import { RailBlock, RailItem } from '@/components/spec/RailItem'
import { scrollToTarget, TARGET_ATTR } from '@/components/spec/rail-targets'
import { useActiveTarget } from '@/components/spec/useActiveTarget'
import { pluralize } from '@/lib/format'
import { splitPath } from '@/lib/paths'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'
import { ChangedFilesCard } from './ChangedFilesCard'
import { PrDescriptionCard } from './PrDescriptionCard'
import { PrSummaryCard } from './PrSummaryCard'
import { DESCRIPTION_ID, FILES_ID, SUMMARY_ID, type SummaryCard } from './summary-cards'

interface ViewProps {
  cards: readonly SummaryCard[]
  report: PrReviewReport | null
  detail: CodeReviewDetail
  sessionId: string
}

function CardBody({ card, report, detail, sessionId }: Omit<ViewProps, 'cards'> & { card: SummaryCard }) {
  if ('spec' in card) {
    const item = card.spec
    if (item.type === 'jira') return <JiraCard item={item} sessionId={sessionId} />
    if (item.type === 'artifact') return <ArtifactCard item={item} sessionId={sessionId} />
    return <MarkdownSpecCard item={item} sessionId={sessionId} />
  }
  if (card.id === SUMMARY_ID) return <PrSummaryCard report={report} stats={detail.tree.stats} />
  if (card.id === DESCRIPTION_ID && report?.overview) return <PrDescriptionCard description={report.overview.description} author={report.overview.author} />
  return <ChangedFilesCard sessionId={sessionId} files={detail.tree.files} stats={detail.tree.stats} />
}

/** Scroll view: every card stacked, the summary first. */
export function SummaryCards(props: ViewProps) {
  return (
    <div className="flex flex-col gap-5">
      {props.cards.map((card) => (
        <div key={card.id} {...{ [TARGET_ATTR]: card.id }}>
          <CardBody card={card} {...props} />
        </div>
      ))}
    </div>
  )
}

/** What a tile lists under its title: the bullets, the folders, or nothing. */
function tileLines(card: SummaryCard, report: PrReviewReport | null, detail: CodeReviewDetail): string[] {
  if (card.id === SUMMARY_ID) return report?.overview?.summary ?? []
  if (card.id === FILES_ID) return detail.tree.files.map((file) => splitPath(file.path).name)
  return []
}

function tileSubtitle(card: SummaryCard, report: PrReviewReport | null, detail: CodeReviewDetail): string | undefined {
  if ('spec' in card) return card.kind.label
  if (card.id === SUMMARY_ID) return report ? `PR #${report.pr.number}` : undefined
  if (card.id === DESCRIPTION_ID) return report?.overview ? `by ${report.overview.author}` : undefined
  return pluralize(detail.tree.stats.files, 'file')
}

function SummaryTile({ card, report, detail, onOpen }: Omit<ViewProps, 'cards' | 'sessionId'> & { card: SummaryCard; onOpen: (id: string) => void }) {
  const comments = useOpenCommentCount('spec', 'spec' in card ? card.id : '')
  return (
    <ItemTile
      path={card.id}
      kind={card.kind}
      title={card.title}
      label={card.title}
      subtitle={tileSubtitle(card, report, detail)}
      headings={tileLines(card, report, detail)}
      openComments={'spec' in card ? comments : 0}
      onOpen={() => onOpen(card.id)}
    />
  )
}

/** Grid view: a tile per card; a click opens it in the scroll view. */
export function SummaryGrid({ cards, report, detail, onOpen }: Omit<ViewProps, 'sessionId'> & { onOpen: (id: string) => void }) {
  return (
    <ItemGrid label="Summary sections">
      {cards.map((card) => (
        <SummaryTile key={card.id} card={card} report={report} detail={detail} onOpen={onOpen} />
      ))}
    </ItemGrid>
  )
}

/** The Summary page's block in the session rail: one row per card. */
export function SummaryRailSection({ cards }: { cards: readonly SummaryCard[] }) {
  const [active, select] = useActiveTarget(cards.map((card) => card.id))
  const current = active ?? cards[0]?.id ?? null
  return (
    <RailSection>
      <RailBlock title="Summary" count={cards.length} hint="sections">
        {cards.map((card) => (
          <RailItem
            key={card.id}
            icon={card.kind.icon}
            title={card.title}
            subtitle={card.kind.label}
            current={card.id === current}
            onSelect={() => {
              select(card.id)
              scrollToTarget(card.id)
            }}
          />
        ))}
      </RailBlock>
    </RailSection>
  )
}
