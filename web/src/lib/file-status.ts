import {
  COLLAPSE_CHANGED_LINES,
  COLLAPSE_MAX_BYTES,
  OMIT_MAX_BYTES,
  type FileStatus,
  type TreeFile,
} from '@review-dash/shared'
import { formatBytes, formatNumber } from './format'

export interface FileStatusBadgeSpec {
  label: string
  className: string
}

const BADGES: Record<FileStatus, FileStatusBadgeSpec> = {
  added: { label: 'added', className: 'bg-approve/10 text-approve' },
  modified: { label: 'modified', className: 'bg-warn/15 text-warn-foreground' },
  deleted: { label: 'deleted', className: 'bg-reject/10 text-reject' },
  renamed: { label: 'renamed', className: 'bg-info/10 text-info' },
  copied: { label: 'copied', className: 'bg-info/10 text-info' },
  typechange: { label: 'type change', className: 'bg-muted text-muted-foreground' },
}

export function fileStatusBadge(file: Pick<TreeFile, 'status'>): FileStatusBadgeSpec {
  return BADGES[file.status]
}

export const BINARY_BADGE: FileStatusBadgeSpec = {
  label: 'binary',
  className: 'bg-muted text-muted-foreground',
}

export const UNTRACKED_BADGE: FileStatusBadgeSpec = {
  label: 'untracked',
  className: 'bg-info/10 text-info',
}

/** Dot colour for file lists (the scroll mode rail in the mock). */
export function fileStatusDotClass(file: Pick<TreeFile, 'status'>): string {
  switch (file.status) {
    case 'added':
    case 'copied':
      return 'bg-approve'
    case 'deleted':
      return 'bg-reject'
    case 'renamed':
      return 'bg-info'
    default:
      return 'bg-warn'
  }
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
