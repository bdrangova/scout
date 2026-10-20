import {
  COLLAPSE_CHANGED_LINES,
  COLLAPSE_MAX_BYTES,
  OMIT_MAX_BYTES,
  type FileStatus,
  type TreeFile,
} from '@review-dash/shared'
import { ArrowRight, Binary, Copy, FileQuestionMark, Minus, Pencil, Plus, RefreshCw, Shuffle, type LucideIcon } from 'lucide-react'
import { formatBytes, formatNumber } from './format'

/** A header chip: the icon alone below `lg`, the word beside it from `lg` up (the label is always there for screen readers). */
export interface FileStatusBadgeSpec {
  label: string
  /** Tooltip; defaults to the label. */
  title?: string
  /** Colour of the icon only: the chip itself is neutral so it never blends into the file type's header colour. */
  iconClass: string
  icon: LucideIcon
}

// Chips are neutral surface with ink text; only the icon carries the status hue (added green, deleted red, renamed blue).
const BADGES: Record<FileStatus, FileStatusBadgeSpec> = {
  added: { label: 'added', iconClass: 'text-green', icon: Plus },
  modified: { label: 'modified', iconClass: 'text-ink', icon: Pencil },
  deleted: { label: 'deleted', iconClass: 'text-red', icon: Minus },
  renamed: { label: 'renamed', iconClass: 'text-st-r', icon: ArrowRight },
  copied: { label: 'copied', iconClass: 'text-st-r', icon: Copy },
  typechange: { label: 'type change', iconClass: 'text-ink', icon: Shuffle },
}

export function fileStatusBadge(file: Pick<TreeFile, 'status'>): FileStatusBadgeSpec {
  return BADGES[file.status]
}

export const BINARY_BADGE: FileStatusBadgeSpec = { label: 'binary', iconClass: 'text-ink', icon: Binary }

export const UNTRACKED_BADGE: FileStatusBadgeSpec = {
  label: 'untracked',
  title: 'Not yet added to git',
  iconClass: 'text-st-r',
  icon: FileQuestionMark,
}

/** The file changed on disk after it was reviewed: its verdict no longer counts. */
export const UPDATED_BADGE: FileStatusBadgeSpec = {
  label: 'updated since sent',
  title: 'Updated since last review',
  iconClass: 'text-ink',
  icon: RefreshCw,
}

/** The server's `collapseReason` codes (`git/rules.ts decideFile`), in words. */
export function collapseReason(file: Pick<TreeFile, 'collapseReason'>): string {
  switch (file.collapseReason) {
    case 'too-many-changed-lines':
      return `more than ${formatNumber(COLLAPSE_CHANGED_LINES)} changed lines`
    case 'too-large':
      return `larger than ${formatBytes(COLLAPSE_MAX_BYTES)}`
    case 'generated-or-vendored':
      return 'generated or vendored file'
    case 'omitted':
      return 'omitted from the diff'
    default:
      return file.collapseReason ?? 'large file'
  }
}

/** The server's `omitReason` codes, in words. */
export function omitReason(file: Pick<TreeFile, 'omitReason'>): string {
  switch (file.omitReason) {
    case 'too-large':
      return `larger than ${formatBytes(OMIT_MAX_BYTES)} on one side, so it is left out of the diff`
    default:
      return file.omitReason ?? 'this file was too large to include in the diff'
  }
}
