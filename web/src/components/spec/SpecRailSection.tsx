import type { SpecItem } from '@scout/shared'
import { useMemo, useState } from 'react'
import { useCommentedOnlyFilter, useOpenCommentRefs } from '@/components/layout/commented-only'
import { CommentedOnlyToggle } from '@/components/layout/CommentedOnlyToggle'
import { RailSection } from '@/components/layout/RailSlot'
import { splitPath } from '@/lib/paths'
import { useContent } from '@/lib/useContent'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'
import { SPEC_KIND } from './item-kinds'
import { extractHeadings } from './outline'
import { RailBlock, RailHeadingItem, RailItem } from './RailItem'
import { scrollToHeading, scrollToTarget } from './rail-targets'
import { useActiveTarget } from './useActiveTarget'

interface SourceProps {
  item: SpecItem
  sessionId: string
  current: boolean
  onSelect: (path: string) => void
}

/** One source and its headings. Artifacts are pages in a frame: no headings. */
function SpecSourceRow({ item, sessionId, current, onSelect }: SourceProps) {
  const { content } = useContent(sessionId, 'spec', item.path)
  const comments = useOpenCommentCount('spec', item.path)
  const [heading, setHeading] = useState<string | null>(null)
  const headings = useMemo(() => (item.type === 'artifact' || content === null ? [] : extractHeadings(content)), [item.type, content])
  const { icon, label } = SPEC_KIND[item.type]
  const isMarkdown = item.type === 'markdown'

  return (
    <>
      <RailItem
        icon={icon}
        title={item.title}
        subtitle={isMarkdown ? splitPath(item.path).name : label}
        mono={isMarkdown}
        current={current}
        comments={comments}
        onSelect={() => {
          setHeading(null)
          onSelect(item.path)
          scrollToTarget(item.path)
        }}
      />
      {headings.map(({ text, occurrence }) => {
        const id = `${text}#${occurrence}`
        return (
          <RailHeadingItem
            key={id}
            text={text}
            current={heading === id}
            onSelect={() => {
              setHeading(id)
              onSelect(item.path)
              scrollToHeading(item.path, text, occurrence)
            }}
          />
        )
      })}
    </>
  )
}

export interface SpecRailSectionProps {
  spec: readonly SpecItem[]
  sessionId: string
}

/** The Spec page's block in the session rail: its sources, each with its headings and open comments. */
export function SpecRailSection({ spec, sessionId }: SpecRailSectionProps) {
  const [active, select] = useActiveTarget(spec.map((item) => item.path))
  const current = active ?? spec[0]?.path ?? null
  const openRefs = useOpenCommentRefs('spec')
  const commented = useCommentedOnlyFilter(spec, (item) => openRefs.has(item.path))
  return (
    <RailSection>
      <RailBlock
        title="Spec"
        count={spec.length}
        shown={commented.active ? commented.items.length : undefined}
        hint="sources"
        action={<CommentedOnlyToggle size="sm" count={commented.count} active={commented.active} onToggle={commented.toggle} />}
      >
        {commented.items.map((item) => (
          <SpecSourceRow key={item.path} item={item} sessionId={sessionId} current={item.path === current} onSelect={select} />
        ))}
      </RailBlock>
    </RailSection>
  )
}
