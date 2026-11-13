import { formatAdditions, formatDeletions } from '@/lib/format'
import { cn } from '@/lib/utils'
import { OutsideLinks } from './OutsideLinks'
import { BoxShell, type BoxShellProps } from './BoxShell'
import type { BoxInfo } from './box-info'

export const PACKAGE_BOX_WIDTH = 236

export interface PackageBoxProps extends Omit<BoxShellProps, 'boxKey' | 'label' | 'width' | 'children' | 'className'> {
  info: BoxInfo
  details: boolean
  onOpen: (dir: string) => void
}

/** A folder of the change drawn as a UML package: a tab, its name (a link into the folder), the biggest files and the review progress. */
export function PackageBox({ info, details, onOpen, ...shell }: PackageBoxProps) {
  const { box } = info
  const dir = box.ref.type === 'dir' ? box.ref.dir : ''
  const settled = info.total > 0 && info.reviewed === info.total
  const more = box.files.length - info.topNames.length
  return (
    <BoxShell
      {...shell}
      boxKey={box.key}
      label={`Package ${box.name}`}
      width={PACKAGE_BOX_WIDTH}
      className={cn('rounded-[4px_12px_12px_12px]', settled && 'bg-paper-2')}
    >
      <span className="absolute -top-[17px] -left-[1.5px] flex h-[17px] items-center rounded-t-[7px] border-x-fine border-t-fine border-line bg-sunken px-2.5 font-mono text-[10px] font-semibold">package</span>
      <button
        type="button"
        onClick={() => onOpen(dir)}
        title={`Open the ${box.name} diagram`}
        className="cursor-pointer rounded-[inherit] px-3 pt-2.5 pb-0.5 text-left text-[15px] font-bold break-all hover:underline"
      >
        {box.name}
        <span aria-hidden className="opacity-50">
          {' →'}
        </span>
      </button>
      {details && (
        <p className="m-0 px-3 pb-1 font-mono text-[10.5px] leading-[1.4] break-all text-ink-muted">
          {info.topNames.join(', ')}
          {more > 0 && ` +${more} more`}
        </p>
      )}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]">
        <span>{box.files.length === 1 ? '1 file' : `${box.files.length} files`}</span>
        <span className="inline-flex gap-1.5 font-mono font-bold tabular-nums">
          <span className="text-green">{formatAdditions(info.additions)}</span>
          <span className="text-red">{formatDeletions(info.deletions)}</span>
        </span>
        <span className="ml-auto font-mono tabular-nums">
          {info.reviewed}/{info.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${box.name} reviewed files`}
        aria-valuemin={0}
        aria-valuemax={info.total}
        aria-valuenow={info.reviewed}
        className={cn('h-[5px] overflow-hidden border-t border-line bg-sunken', details && 'mb-0')}
      >
        <i className="block h-full bg-green" style={{ width: `${info.total === 0 ? 0 : (100 * info.reviewed) / info.total}%` }} />
      </div>
      {details && <OutsideLinks box={box} />}
    </BoxShell>
  )
}
