import type { TreeFile } from '@scout/shared'
import { Tag } from '@/components/ui/tag'
import { BINARY_BADGE, fileStatusBadge, UNTRACKED_BADGE, UPDATED_BADGE, type FileStatusBadgeSpec } from '@/lib/file-status'
import { cn } from '@/lib/utils'

/**
 * One header chip: neutral surface with ink text (the header behind it is the file type's colour, so a
 * tinted chip could share its hue); only the icon is coloured. Below `lg` the icon stands alone, from
 * `lg` the word shows next to it. The label stays in the DOM for screen readers (and tests).
 */
export function FileStatusChip({ spec, className, ...props }: { spec: FileStatusBadgeSpec; className?: string; role?: string }) {
  const Icon = spec.icon
  return (
    <Tag
      tone="neutral"
      icon
      title={spec.title ?? spec.label}
      className={cn('border-fill-line bg-surface lg:w-auto lg:gap-[5px] lg:px-[9px]', className)}
      {...props}
    >
      <Icon aria-hidden className={spec.iconClass} />
      <span className="sr-only capitalize lg:not-sr-only">{spec.label}</span>
    </Tag>
  )
}

interface FileStatusChipsProps {
  file: TreeFile
  /** Changed on disk since it was reviewed. */
  updated: boolean
  /** The content moved on disk while the card was mounted (pulses for a moment). */
  changedJustNow: boolean
}

/** The chips next to the file name: status, binary, untracked, updated, and the "changed just now" pulse. */
export function FileStatusChips({ file, updated, changedJustNow }: FileStatusChipsProps) {
  return (
    <>
      <FileStatusChip spec={fileStatusBadge(file)} />
      {file.binary && <FileStatusChip spec={BINARY_BADGE} />}
      {file.untracked && <FileStatusChip spec={UNTRACKED_BADGE} />}
      {updated && <FileStatusChip spec={UPDATED_BADGE} />}
      {changedJustNow && (
        <Tag role="status" tone="warn" size="sm" className="animate-pulse">
          changed just now
        </Tag>
      )}
    </>
  )
}
