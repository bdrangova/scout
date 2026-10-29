import type { SpecItem } from '@scout/shared'
import { useMemo } from 'react'
import { ItemGrid, ItemTile } from '@/components/common/ItemGrid'
import { splitPath } from '@/lib/paths'
import { useContent } from '@/lib/useContent'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'
import { SPEC_KIND } from './item-kinds'
import { extractHeadings } from './outline'

interface SpecTileProps {
  item: SpecItem
  sessionId: string
  onOpen: (path: string) => void
}

/** A source as the rail shows it: kind, title, file name, headings (none for an artifact) and open comments. */
function SpecTile({ item, sessionId, onOpen }: SpecTileProps) {
  const { content } = useContent(sessionId, 'spec', item.path)
  const comments = useOpenCommentCount('spec', item.path)
  const headings = useMemo(() => (item.type === 'artifact' || content === null ? [] : extractHeadings(content).map(({ text }) => text)), [item.type, content])
  return (
    <ItemTile
      path={item.path}
      kind={SPEC_KIND[item.type]}
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

export interface SpecGridProps {
  spec: readonly SpecItem[]
  sessionId: string
  /** Open the source in the scroll view. */
  onOpen: (path: string) => void
}

/** The Spec page's grid view: a tile per source, in page order. */
export function SpecGrid({ spec, sessionId, onOpen }: SpecGridProps) {
  return (
    <ItemGrid label="All sources">
      {spec.map((item) => (
        <SpecTile key={item.path} item={item} sessionId={sessionId} onOpen={onOpen} />
      ))}
    </ItemGrid>
  )
}
