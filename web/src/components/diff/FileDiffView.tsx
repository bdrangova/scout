import { parsePatchLines, type LineAnchor } from '@review-dash/shared'
import { PatchDiff, type PatchDiffProps } from '@pierre/diffs/react'
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { LineAnnotation } from './LineAnnotation'
import {
  anchorFromCursor,
  anchorFromRange,
  buildAnnotations,
  selectionFor,
  useLineComments,
  type DiffAnnotation,
  type LineAnnotationContent,
  type RowCursor,
} from './line-comments'

export type DiffStyle = 'unified' | 'split'

type DiffOptions = NonNullable<PatchDiffProps<LineAnnotationContent, undefined>['options']>

// The card header shows the path, so the library's own file header is off; lines never wrap
// (horizontal scroll instead); the theme is pinned to light because the app is light-only (the
// diff must not follow the OS scheme).
const BASE_OPTIONS: DiffOptions = {
  overflow: 'scroll',
  themeType: 'light',
  disableFileHeader: true,
  hunkSeparators: 'line-info',
  lineDiffType: 'word',
}

interface FileDiffViewProps {
  /** The per-file slice of `diff.patch` (one `diff --git` section). */
  patch: string
  diffStyle: DiffStyle
}

/**
 * The only place that renders `@pierre/diffs`. Inside a `LineCommentsContext` the gutter shows
 * the library's "+" on the hovered line (drag it over several lines for a range); clicking it
 * opens a comment box under that line, and the file's line comments render under their lines.
 * The wrapper is focusable: ↑/↓ move a cursor over the lines (Shift extends it), Enter comments there.
 */
export function FileDiffView({ patch, diffStyle }: FileDiffViewProps) {
  const lineComments = useLineComments()
  const [draft, setDraft] = useState<LineAnchor | null>(null)
  const [cursor, setCursor] = useState<RowCursor | null>(null)
  const rows = useMemo(() => (lineComments ? parsePatchLines(patch) : []), [lineComments, patch])

  const onGutterUtilityClick = useCallback((range: Parameters<NonNullable<DiffOptions['onGutterUtilityClick']>>[0]) => {
    setCursor(null)
    setDraft(anchorFromRange(range))
  }, [])

  const options = useMemo<DiffOptions>(
    () => (lineComments ? { ...BASE_OPTIONS, diffStyle, enableGutterUtility: true, onGutterUtilityClick } : { ...BASE_OPTIONS, diffStyle }),
    [diffStyle, lineComments, onGutterUtilityClick],
  )
  const annotations = useMemo<DiffAnnotation[]>(
    () => (lineComments ? buildAnnotations(rows, lineComments.comments, draft) : []),
    [lineComments, rows, draft],
  )
  const cursorAnchor = cursor ? anchorFromCursor(rows, cursor) : null
  const selected = draft ?? cursorAnchor

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!lineComments || event.target !== event.currentTarget || rows.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      setCursor((current) => {
        const to = Math.min(rows.length - 1, Math.max(0, (current?.to ?? -1) + step))
        return { from: event.shiftKey && current ? current.from : to, to }
      })
    } else if (event.key === 'Enter' && cursorAnchor) {
      setDraft(cursorAnchor)
      setCursor(null)
    } else if (event.key === 'Escape' && cursor) {
      setCursor(null)
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const renderAnnotation = useCallback(
    (annotation: DiffAnnotation) =>
      lineComments ? (
        <LineAnnotation
          content={annotation.metadata}
          comments={{
            ...lineComments,
            onAdd: (anchor, body) => {
              lineComments.onAdd(anchor, body)
              setDraft(null)
            },
          }}
          onCancelDraft={() => setDraft(null)}
        />
      ) : null,
    [lineComments],
  )

  return (
    <div
      className={cn('text-[12.5px]', lineComments && 'outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-inset')}
      style={{ overflowAnchor: 'none' }}
      data-diff-style={diffStyle}
      tabIndex={lineComments ? 0 : undefined}
      role={lineComments ? 'group' : undefined}
      aria-label={lineComments ? 'Diff lines' : undefined}
      onKeyDown={onKeyDown}
    >
      <PatchDiff<LineAnnotationContent>
        patch={patch}
        options={options}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        selectedLines={lineComments ? (selected ? selectionFor(selected) : null) : undefined}
      />
    </div>
  )
}
