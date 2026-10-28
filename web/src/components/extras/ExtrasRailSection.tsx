import type { ExtraItem } from '@scout/shared'
import { Code, FileText, Workflow, type LucideIcon } from 'lucide-react'
import { RailSection } from '@/components/layout/RailSlot'
import { RailBlock, RailItem } from '@/components/spec/RailItem'
import { scrollToTarget } from '@/components/spec/rail-targets'
import { useActiveTarget } from '@/components/spec/useActiveTarget'
import { splitPath } from '@/lib/paths'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'

const ICON: Record<ExtraItem['type'], LucideIcon> = { markdown: FileText, mermaid: Workflow, html: Code }

function ExtraRow({ item, current, onSelect }: { item: ExtraItem; current: boolean; onSelect: (path: string) => void }) {
  const comments = useOpenCommentCount('extra', item.path)
  return (
    <RailItem
      icon={ICON[item.type]}
      title={item.title}
      subtitle={splitPath(item.path).name}
      mono
      twoLines
      current={current}
      comments={comments}
      onSelect={() => {
        onSelect(item.path)
        scrollToTarget(item.path)
      }}
    />
  )
}

/** The Extras page's block in the session rail: the list of extras, in page order; a click scrolls to its card. */
export function ExtrasRailSection({ extras }: { extras: readonly ExtraItem[] }) {
  const [active, select] = useActiveTarget(extras.map((item) => item.path))
  const current = active ?? extras[0]?.path ?? null
  return (
    <RailSection>
      <RailBlock title="Extras" count={extras.length}>
        {extras.map((item) => (
          <ExtraRow key={item.path} item={item} current={item.path === current} onSelect={select} />
        ))}
      </RailBlock>
    </RailSection>
  )
}
