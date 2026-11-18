import { BLUEPRINT_UNGROUPED_ID, blueprintGroupingOfDir } from '@scout/shared'
import { Folder, Layers } from 'lucide-react'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { cn } from '@/lib/utils'
import { OutsideLinks } from './OutsideLinks'
import { BoxShell, type BoxShellProps } from './BoxShell'
import type { BoxInfo } from './box-info'
import { BOX_STATE_BORDER, BOX_STATE_WASH, BOX_STATE_WORD, boxStateOf } from './box-state'
import { CommentCount } from './CommentCount'

export const PACKAGE_BOX_WIDTH = 236

export interface PackageBoxProps extends Omit<BoxShellProps, 'boxKey' | 'label' | 'width' | 'children' | 'className'> {
  info: BoxInfo
  onOpen: (dir: string) => void
}

/** A folder of the change drawn as a UML package: a header band with its name (a link into the folder), the biggest files and the review progress. */
export function PackageBox({ info, onOpen, ...shell }: PackageBoxProps) {
  const { box } = info
  const dir = box.ref.type === 'dir' ? box.ref.dir : ''
  const state = boxStateOf(info, true)
  // An agent group (its dir starts with `@<type>`) reads «group»; the box of files no group names reads «ungrouped» and is dashed.
  const group = blueprintGroupingOfDir(dir) !== null
  const ungrouped = group && dir.endsWith(`/${BLUEPRINT_UNGROUPED_ID}`)
  const stereotype = ungrouped ? '«ungrouped»' : group ? '«group»' : '«package»'
  const Icon = group ? Layers : Folder
  const more = box.files.length - info.topNames.length
  return (
    <BoxShell
      {...shell}
      boxKey={box.key}
      label={`${group ? 'Group' : 'Package'} ${box.name}${state === 'none' ? '' : `, ${BOX_STATE_WORD[state]}`}`}
      width={PACKAGE_BOX_WIDTH}
      wash={BOX_STATE_WASH[state]}
      className={cn('rounded-[10px]', BOX_STATE_BORDER[state], ungrouped && 'border-dashed')}
    >
      <button
        type="button"
        tabIndex={shell.pick ? -1 : undefined}
        onClick={() => onOpen(dir)}
        title={`Open the ${box.name} diagram`}
        aria-label={`${box.name}, open its diagram`}
        className="group block w-full cursor-pointer rounded-t-[8.5px] border-b-fine border-line bg-sunken px-3 py-1.5 text-left"
      >
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-muted">
          <Icon aria-hidden className="size-3" />
          {stereotype}
        </span>
        <b className="block text-[15px] font-bold break-all group-hover:underline">
          {box.name}
          <span aria-hidden className="opacity-50">
            {' →'}
          </span>
        </b>
      </button>
      {info.purpose && <p className="m-0 px-3 pt-2 text-[12px] leading-[1.4] text-ink">{info.purpose}</p>}
      <p className="m-0 px-3 pt-2 pb-0.5 font-mono text-[10.5px] leading-[1.4] break-all text-ink-muted">
        {info.topNames.join(', ')}
        {more > 0 && ` +${more} more`}
      </p>
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]">
        <span>{box.files.length === 1 ? '1 file' : `${box.files.length} files`}</span>
        <span className="inline-flex gap-1.5 font-mono font-bold tabular-nums">
          <span className="text-green">{formatAdditions(info.additions)}</span>
          <span className="text-red">{formatDeletions(info.deletions)}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono tabular-nums">
          <CommentCount count={info.comments} />
          {info.reviewed}/{info.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${box.name} reviewed files`}
        aria-valuemin={0}
        aria-valuemax={info.total}
        aria-valuenow={info.reviewed}
        className="h-[5px] overflow-hidden border-t border-line bg-sunken"
      >
        <i className="block h-full bg-green" style={{ width: `${info.total === 0 ? 0 : (100 * info.approved) / info.total}%`, float: 'left' }} />
        <i className="block h-full bg-red" style={{ width: `${info.total === 0 ? 0 : (100 * info.rejected) / info.total}%`, float: 'left' }} />
      </div>
      <OutsideLinks box={box} />
    </BoxShell>
  )
}
