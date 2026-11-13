import type { BlueprintMember, BlueprintMemberChange } from '@scout/shared'
import { PencilLine } from 'lucide-react'
import { ChangeBar } from '@/components/files/ChangeBar'
import { fileTypeClass, fileTypeOf } from '@/lib/file-type'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { cn } from '@/lib/utils'
import { VERDICT_STYLE } from '@/lib/verdict'
import { BoxShell, type BoxShellProps } from './BoxShell'
import type { BoxInfo } from './box-info'
import { BOX_STATE_BORDER, BOX_STATE_WASH, BOX_STATE_WORD, boxStateOf } from './box-state'
import { CommentCount } from './CommentCount'
import { OutsideLinks } from './OutsideLinks'

export const FILE_BOX_WIDTH = 264

const STATUS_WORD: Record<string, string> = { added: 'new', deleted: 'deleted', renamed: 'moved', copied: 'copied' }

const MEMBER_MARK: Record<BlueprintMemberChange, { glyph: string; word: string; className: string }> = {
  added: { glyph: '+', word: 'added', className: 'text-green' },
  removed: { glyph: '−', word: 'removed', className: 'text-red' },
  changed: { glyph: '~', word: 'changed', className: 'text-ink-muted' },
}

export interface FileBoxProps extends Omit<BoxShellProps, 'boxKey' | 'label' | 'width' | 'children' | 'className'> {
  info: BoxInfo
  details: boolean
  /** The box the diagram is drawn around. */
  center: boolean
  /** Show the links to files outside the diagram (not in an around-diagram). */
  showOutside: boolean
  onOpenFile: (path: string) => void
  onOpenMember: (path: string, member: BlueprintMember) => void
  onAround: (path: string) => void
}

/** A changed file as a UML class: a band in the file type's colour, Scout's one-liner, the declarations that changed, then the size of the change. */
export function FileBox({ info, details, center, showOutside, onOpenFile, onOpenMember, onAround, ...shell }: FileBoxProps) {
  const { box } = info
  const file = info.file
  if (!file) return null
  const kind = file.file?.kind ?? 'module'
  const word = file.tree ? (STATUS_WORD[file.tree.status] ?? '') : ''
  const deleted = file.tree?.status === 'deleted'
  const state = boxStateOf(info)
  const verdict = file.verdict !== 'none' ? VERDICT_STYLE[file.verdict] : null
  const members = file.file?.members ?? []
  const extendsOther = (file.file?.extends.length ?? 0) > 0
  // In select mode the box is one checkbox: its buttons stay out of the tab order.
  const tab = shell.pick ? -1 : undefined
  const relation = file.importers > 0 ? `${file.importers} lean on it` : 'relations'
  return (
    <BoxShell
      {...shell}
      boxKey={box.key}
      label={state === 'none' ? `File ${file.path}` : `File ${file.path}, ${BOX_STATE_WORD[state]}`}
      wash={BOX_STATE_WASH[state]}
      width={FILE_BOX_WIDTH}
      className={cn('rounded-[10px]', BOX_STATE_BORDER[state], center && 'outline outline-[3px] outline-offset-[3px] outline-coral')}
    >
      <button
        type="button"
        tabIndex={tab}
        onClick={() => onOpenFile(file.path)}
        title={`Open ${file.path}`}
        className={cn(
          fileTypeClass(fileTypeOf(file.path).id),
          'relative block w-full cursor-pointer rounded-t-[8.5px] border-b-fine border-fill-line bg-ft py-1.5 pr-9 pl-2.5 text-left text-hdr-ink',
        )}
      >
        <span className="block font-mono text-[10.5px] opacity-80">
          «{kind}»{word && ` · ${word}`}
        </span>
        <b className={cn('block font-mono text-[13px] font-semibold break-all', deleted && 'line-through')}>{box.name}</b>
        <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full border-fine border-fill-line bg-surface font-sans text-[10.5px] font-bold text-ink tabular-nums">
          {verdict ? <verdict.icon role="img" aria-label={verdict.label} className={cn('size-3 stroke-[3]', verdict.iconClassName)} /> : file.order}
        </span>
      </button>
      {details && file.summary && (
        <p className="m-0 flex gap-1.5 border-b-fine border-line px-2.5 py-[7px] text-[12.5px] leading-[1.35]">
          <PencilLine aria-hidden className="mt-0.5 size-3 shrink-0 text-ink-muted" />
          <span>{file.summary}</span>
        </p>
      )}
      {details && members.length > 0 && (
        <div className="flex flex-col border-b-fine border-line px-1 py-1.5">
          {members.map((member) => {
            const mark = MEMBER_MARK[member.change]
            return (
              <button
                key={`${member.side}:${member.line}:${member.name}`}
                type="button"
                tabIndex={tab}
                title="Jump to this in the code"
                onClick={() => onOpenMember(file.path, member)}
                className="flex cursor-pointer items-center truncate rounded-md px-1.5 py-px text-left font-mono text-[11.5px] font-medium hover:bg-hover"
              >
                <i aria-hidden className={cn('inline-block w-3.5 shrink-0 font-bold not-italic', mark.className)}>
                  {mark.glyph}
                </i>
                <span className="sr-only">{mark.word} </span>
                <span className={cn('truncate', member.change === 'removed' && 'line-through decoration-line')}>{member.name}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
        <ChangeBar additions={file.tree?.additions ?? 0} deletions={file.tree?.deletions ?? 0} />
        <span className="inline-flex gap-1.5 font-mono font-bold tabular-nums">
          <span className="text-green">{formatAdditions(info.additions)}</span>
          <span className="text-red">{formatDeletions(info.deletions)}</span>
        </span>
        <CommentCount count={info.comments} />
        {file.related && !center && (
          <button
            type="button"
            tabIndex={tab}
            onClick={() => onAround(file.path)}
            title="Redraw the diagram around this file"
            className="ml-auto cursor-pointer rounded-full border-fine border-line px-2 py-px text-[11px] font-semibold whitespace-nowrap hover:bg-selected hover:text-on-selected"
          >
            {extendsOther && <span aria-hidden>▲ </span>}
            {relation}
            <span aria-hidden> ⤢</span>
          </button>
        )}
      </div>
      {details && showOutside && <OutsideLinks box={box} />}
    </BoxShell>
  )
}
