import { ChevronDownIcon, FunnelIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileTypeDot } from '@/components/ui/file-type-dot'
import { Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import type { FileType, FileTypeId } from '@/lib/file-type'
import { cn } from '@/lib/utils'

export interface FileTypeOption {
  type: FileType
  /** The extensions actually present (`other` has no fixed list of its own). */
  exts: readonly string[]
  count: number
}

export interface FileTypeFilterProps {
  /** Only the types present in the session, in `FILE_TYPES` order. */
  options: readonly FileTypeOption[]
  selected: readonly FileTypeId[]
  onToggle: (id: FileTypeId, on: boolean) => void
  onClear: () => void
}

/** The filter's wording (the design's): "CSS" for the styles family, "Everything else" for the rest. */
const FILTER_LABEL: Partial<Record<FileTypeId, string>> = { css: 'CSS', other: 'Everything else' }

function displayLabel(type: FileType): string {
  return FILTER_LABEL[type.id] ?? type.label
}

/** A multiselect dropdown over the file types in the session: colour dot, name, extensions and count per row. */
export function FileTypeFilter({ options, selected, onToggle, onClear }: FileTypeFilterProps) {
  const active = selected.length > 0
  return (
    <Menu>
      <MenuTrigger
        render={<Button size="sm" />}
        aria-label={active ? `File types, ${selected.length} selected` : 'File types'}
        className={cn(
          // A chooser, so flat: line only, no lift. (`!`: tailwind-merge does not know `shadow-raised` as a shadow.)
          'shrink-0 gap-2 pr-2.5 shadow-none hover:translate-0 active:translate-0',
          active && 'border-ink bg-ink text-paper hover:bg-ink hover:text-paper',
        )}
      >
        <FunnelIcon aria-hidden className="size-3.5" />
        File types
        {active && (
          <Badge variant="neutral" className="border-transparent bg-paper text-ink">
            {selected.length}
          </Badge>
        )}
        <ChevronDownIcon aria-hidden className="size-3.5" />
      </MenuTrigger>
      <MenuContent align="end" className="w-[292px]" aria-label="File types">
        <MenuGroup className="contents">
          <MenuLabel>File types</MenuLabel>
          {options.map(({ type, exts, count }) => (
            <MenuCheckboxItem
              key={type.id}
              checked={selected.includes(type.id)}
              onCheckedChange={(on) => onToggle(type.id, on)}
              className="h-9 gap-2.5"
            >
              <FileTypeDot type={type.id} aria-hidden />
              <span className="flex-1 truncate">{displayLabel(type)}</span>
              <span className="truncate font-mono text-[11.5px] font-medium text-ink-muted">{exts.join(' ')}</span>
              <span className="min-w-[18px] text-right text-ink-muted tabular-nums">{count}</span>
            </MenuCheckboxItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem disabled={!active} onClick={onClear} className="text-ink-muted data-highlighted:text-ink">
          Clear
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
