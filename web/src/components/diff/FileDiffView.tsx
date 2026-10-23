import { anchorInPatch, parsePatchLines, type LineAnchor } from '@review-dash/shared'
import { PatchDiff, type PatchDiffProps } from '@pierre/diffs/react'
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { findDiffRow, useLineJump } from '@/lib/line-jump'
import { placePrThreads } from '@/lib/pr-threads'
import { cn } from '@/lib/utils'
import { ThemeContext } from '@/theme/ThemeContext'
import { contentsLoader, fullFileRows, type FileSides } from './expand-context'
import { ProposalCard } from '@/components/prreview/ProposalCard'
import { useProposalAnnotations } from '@/components/prreview/proposal-annotations'
import { PANEL_CLASS } from './LineAnnotation'
import { LineAnnotation } from './LineAnnotation'
import { PrAnnotation } from './PrAnnotation'
import { usePrAnnotations } from './pr-annotations'
import {
  anchorFromCursor,
  anchorFromRange,
  buildAnnotations,
  buildPrAnnotations,
  selectionFor,
  useLineComments,
  type DiffAnnotation,
  type LineAnnotationContent,
  type RowCursor,
} from './line-comments'

export type DiffStyle = 'unified' | 'split'

type DiffOptions = NonNullable<PatchDiffProps<LineAnnotationContent, undefined>['options']>

/**
 * The library renders into a shadow root and paints from its own `--diffs-*` variables; this maps
 * them onto the design's code tokens (which the host inherits from `:root` / `.dark`): paper code
 * background, ink text, the design's gutter tints, the UI's mono font. The line washes are the
 * library's own mix of the code background with the accent (green / red), which lands close to
 * `--diff-add` / `--diff-del`. Token colours stay the library's bundled pierre themes (closest match).
 */
const THEME_CSS = `
:host {
  --diffs-font-family: 'Geist Mono Variable', 'Geist Mono', 'JetBrains Mono', 'SF Mono', Monaco, monospace;
  --diffs-font-size: 12.5px;
  --diffs-line-height: 21px;
  --diffs-light-bg: var(--code-bg);
  --diffs-dark-bg: var(--code-bg);
  --diffs-light: var(--ink);
  --diffs-dark: var(--ink);
  --diffs-bg-context-override: var(--code-bg);
  --diffs-bg-context-gutter-override: var(--paper-2);
  --diffs-bg-separator-override: var(--paper-2);
  --diffs-fg-number-override: var(--ink-muted);
  --diffs-bg-addition-number-override: var(--diff-add-gutter);
  --diffs-bg-deletion-number-override: var(--diff-del-gutter);
  --diffs-addition-color-override: var(--green);
  --diffs-deletion-color-override: var(--red);
}
/* The line-comment "+": ink on paper, a 24px target (the library's is one line high, 21px), and a
   focus ring so it shows for the keyboard as well as the hover. Line numbers open the composer too,
   so they get the pointer. */
[data-utility-button] {
  width: 24px;
  height: 24px;
  margin-top: -1.5px;
  background-color: var(--ink);
  color: var(--code-bg);
}
[data-utility-button]:hover { background-color: var(--yellow); color: var(--on-yellow); }
[data-utility-button]:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
[data-column-number] { cursor: pointer; }
`

// The card header shows the path, so the library's own file header is off; lines never wrap
// (horizontal scroll instead). The hunk separators reveal hidden lines 10 at a time.
const BASE_OPTIONS: DiffOptions = {
  overflow: 'scroll',
  disableFileHeader: true,
  hunkSeparators: 'line-info',
  lineDiffType: 'word',
  expansionLineCount: 10,
  unsafeCSS: THEME_CSS,
}

interface FileDiffViewProps {
  /** The per-file slice of `diff.patch` (one `diff --git` section). */
  patch: string
  diffStyle: DiffStyle
  /**
   * Fetches both sides of the file; given, the separators between hunks offer to reveal the
   * hidden lines and this runs on the first reveal. Absent (or failing once), nothing is offered.
   */
  loadSides?: () => Promise<FileSides>
  /** The file's path: a content-search jump to one of its lines scrolls there and highlights it. */
  path?: string
}

/**
 * The only place that renders `@pierre/diffs`. Inside a `LineCommentsContext` the gutter shows
 * the library's "+" on the hovered line (drag it over several lines for a range); clicking it (or the line number)
 * opens a comment box under that line, and the file's line comments render under their lines.
 * The wrapper is focusable: ↑/↓ move a cursor over the lines (Shift extends it), Enter comments there.
 * The diff follows the app theme (never the OS scheme on its own).
 */
export function FileDiffView({ patch, diffStyle, loadSides, path }: FileDiffViewProps) {
  const lineComments = useLineComments()
  const prAnnotations = usePrAnnotations()
  // Read without `useTheme()` so a diff rendered outside the provider (tests) still works, as light.
  const themeType = useContext(ThemeContext)?.resolved ?? 'light'
  const [draft, setDraft] = useState<LineAnchor | null>(null)
  const [cursor, setCursor] = useState<RowCursor | null>(null)
  // The loaded sides (once revealed), or `null` after a failed load: the offer is withdrawn.
  const [sides, setSides] = useState<FileSides | null | undefined>(undefined)
  // A new patch (the file moved on disk) starts over: what was loaded belongs to the old content.
  const [seenPatch, setSeenPatch] = useState(patch)
  if (seenPatch !== patch) {
    setSeenPatch(patch)
    setSides(undefined)
  }
  const proposals = useProposalAnnotations()
  const rows = useMemo(() => (lineComments || prAnnotations || proposals.length ? parsePatchLines(patch) : []), [lineComments, prAnnotations, proposals, patch])
  // Anchors on revealed lines count as in the diff; the keyboard cursor keeps to the patch's own rows.
  const anchorRows = useMemo(() => (sides ? fullFileRows(rows, sides) : rows), [rows, sides])

  const offered = sides !== null
  const loadDiffFiles = useMemo(
    () =>
      loadSides && offered
        ? contentsLoader(() =>
            loadSides().then(
              (loaded) => {
                setSides(loaded)
                return loaded
              },
              (reason: unknown) => {
                setSides(null)
                throw reason
              },
            ),
          )
        : undefined,
    [loadSides, offered],
  )

  const onGutterUtilityClick = useCallback((range: Parameters<NonNullable<DiffOptions['onGutterUtilityClick']>>[0]) => {
    setCursor(null)
    setDraft(anchorFromRange(range))
  }, [])

  /** The line number is a second way to open the composer, for that one line. */
  const onLineNumberClick = useCallback((props: Parameters<NonNullable<DiffOptions['onLineNumberClick']>>[0]) => {
    setCursor(null)
    setDraft(anchorFromRange({ start: props.lineNumber, end: props.lineNumber, side: props.annotationSide }))
  }, [])

  const options = useMemo<DiffOptions>(
    () =>
      lineComments
        ? { ...BASE_OPTIONS, themeType, diffStyle, loadDiffFiles, enableGutterUtility: true, onGutterUtilityClick, onLineNumberClick }
        : { ...BASE_OPTIONS, themeType, diffStyle, loadDiffFiles },
    [themeType, diffStyle, lineComments, loadDiffFiles, onGutterUtilityClick, onLineNumberClick],
  )
  // GitHub threads whose line is in the diff hang under it; the card lists the others in its footer.
  const prThreads = prAnnotations?.threads
  const prPlacement = useMemo(() => placePrThreads(anchorRows, prThreads ?? []), [anchorRows, prThreads])
  const placedKey = prPlacement.placed.map(({ thread }) => thread.root.id).join(',')
  const onPlaced = prAnnotations?.onPlaced
  useEffect(() => {
    onPlaced?.(placedKey === '' ? [] : placedKey.split(','))
    return () => onPlaced?.([])
  }, [onPlaced, placedKey])
  const annotations = useMemo<DiffAnnotation[]>(
    () => [...(lineComments ? buildAnnotations(anchorRows, lineComments.comments, draft) : []), ...buildPrAnnotations(prPlacement.placed), ...proposals.map((finding): DiffAnnotation => {
      const changed = !anchorInPatch(anchorRows, finding.anchor)
      return { side: finding.anchor.side === 'new' ? 'additions' : 'deletions', lineNumber: changed ? 0 : finding.anchor.endLine ?? finding.anchor.line, metadata: { kind: 'proposal', finding, changed } }
    })],
    [lineComments, anchorRows, draft, prPlacement, proposals],
  )
  const cursorAnchor = cursor ? anchorFromCursor(rows, cursor) : null
  const jump = useLineJump(path)
  const selected = draft ?? cursorAnchor ?? (jump ? { side: jump.side, line: jump.line } : null)

  // The diff renders asynchronously: look for the jumped-to row for a few seconds, then centre it.
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!jump) return
    let frame = 0
    let id = 0
    const tick = () => {
      const root = hostRef.current?.querySelector('diffs-container')?.shadowRoot
      const row = root ? findDiffRow(root, jump.side, jump.line) : null
      if (row) row.scrollIntoView({ block: 'center' })
      else if (++frame < 240) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [jump])

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
    (annotation: DiffAnnotation) => {
      const { metadata } = annotation
      if (metadata.kind === 'proposal') return <div className={PANEL_CLASS}><ProposalCard finding={metadata.finding} changed={metadata.changed} /></div>
      if (metadata.kind === 'pr') return <PrAnnotation anchor={metadata.anchor} threads={metadata.threads} />
      return lineComments ? (
        <LineAnnotation
          content={metadata}
          comments={{
            ...lineComments,
            onAdd: (anchor, body) => {
              lineComments.onAdd(anchor, body)
              setDraft(null)
            },
          }}
          onCancelDraft={() => setDraft(null)}
        />
      ) : null
    },
    [lineComments],
  )

  return (
    <div
      ref={hostRef}
      className={cn('bg-code text-[12.5px]', lineComments && 'outline-none focus-visible:outline-focus focus-visible:-outline-offset-[3px]')}
      style={{ overflowAnchor: 'none' }}
      data-diff-style={diffStyle}
      data-theme={themeType}
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
        selectedLines={selected ? selectionFor(selected) : lineComments ? null : undefined}
      />
    </div>
  )
}
