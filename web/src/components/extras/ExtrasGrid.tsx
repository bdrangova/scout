import type { ExtraItem } from '@scout/shared'
import { useMemo } from 'react'
import { ItemGrid, ItemTile } from '@/components/common/ItemGrid'
import { EXTRA_KIND } from '@/components/spec/item-kinds'
import { extractHeadings } from '@/components/spec/outline'
import { splitPath } from '@/lib/paths'
import { useContent } from '@/lib/useContent'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'

interface ExtraTileProps {
  item: ExtraItem
  sessionId: string
  onOpen: (path: string) => void
}

/** An extra as the rail shows it (kind, title, file name, open comments), plus a markdown file's headings. */
function ExtraTile({ item, sessionId, onOpen }: ExtraTileProps) {
  const { content } = useContent(sessionId, 'extras', item.path)
  const comments = useOpenCommentCount('extra', item.path)
  const headings = useMemo(() => (item.type !== 'markdown' || content === null ? [] : extractHeadings(content).map(({ text }) => text)), [item.type, content])
  return (
    <ItemTile
      path={item.path}
      kind={EXTRA_KIND[item.type]}
      title={item.title}
      label={item.title}
      subtitle={splitPath(item.path).name}
      mono
      headings={headings}
      openComments={comments}
      onOpen={() => onOpen(item.path)}
    />
  )
}

export interface ExtrasGridProps {
  extras: readonly ExtraItem[]
  sessionId: string
  /** Open the extra in the scroll view. */
  onOpen: (path: string) => void
}

/** The Extras page's grid view: a tile per file, in page order. */
export function ExtrasGrid({ extras, sessionId, onOpen }: ExtrasGridProps) {
  return (
    <ItemGrid label="All extras">
      {extras.map((item) => (
        <ExtraTile key={item.path} item={item} sessionId={sessionId} onOpen={onOpen} />
      ))}
    </ItemGrid>
  )
}
