import { anchorKey, anchorLabel, type CommentWithStatus } from '@review-dash/shared'
import { Eyebrow } from '@/components/common/Eyebrow'
import { CommentBox } from '@/components/common/CommentBox'
import { ReplyChip } from '@/components/journal/JournalParts'
import { CommentList } from '@/components/common/CommentList'
import type { LineAnnotationContent, LineCommentsValue } from './line-comments'

interface LineAnnotationProps {
  content: Exclude<LineAnnotationContent, { kind: 'pr' | 'proposal' | 'journal' }>
  comments: LineCommentsValue
  onCancelDraft: () => void
}

/** A small raised panel under the diff line, back in the UI font. */
export const PANEL_CLASS = 'my-1.5 ml-3 mr-3 flex flex-col gap-2 rounded-lg border-fine border-line bg-surface px-3 py-2 font-sans text-[13px] leading-normal text-ink'

/** The React content of one annotation slot under a diff line: saved comments, the draft box, or the orphaned comments. */
export function LineAnnotation({ content, comments, onCancelDraft }: LineAnnotationProps) {
  const list = (items: CommentWithStatus[]) => (
    <CommentList comments={items} onEdit={comments.onEdit} onDelete={comments.onDelete} onResolve={comments.onResolve} onReopen={comments.onReopen} />
  )
  switch (content.kind) {
    case 'draft':
      return (
        <div className={PANEL_CLASS} data-line-draft>
          {content.reply && <ReplyChip reply={content.reply} onCancel={onCancelDraft} />}
          <CommentBox
            label={`Comment on ${anchorLabel(content.anchor)}`}
            pendingReject={false}
            focusToken={1}
            onSubmit={(body) => (content.reply ? comments.onAdd(content.anchor, body, content.reply.id) : comments.onAdd(content.anchor, body))}
            onCancelReject={() => {}}
            onCancel={onCancelDraft}
          />
        </div>
      )
    case 'comments':
      return (
        <div className={PANEL_CLASS} data-line-comments={anchorKey(content.anchor)}>
          {list(content.comments)}
        </div>
      )
    case 'orphans':
      return (
        <div className={PANEL_CLASS} data-line-comments="changed">
          {groupOrphans(content.comments).map(({ key, label, items }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Eyebrow>{label} (changed)</Eyebrow>
              {list(items)}
            </div>
          ))}
        </div>
      )
  }
}

function groupOrphans(comments: CommentWithStatus[]): { key: string; label: string; items: CommentWithStatus[] }[] {
  const groups = new Map<string, { key: string; label: string; items: CommentWithStatus[] }>()
  for (const comment of comments) {
    const anchor = comment.target.anchor
    if (anchor === undefined) continue
    const key = anchorKey(anchor)
    const group = groups.get(key)
    if (group) group.items.push(comment)
    else groups.set(key, { key, label: anchorLabel(anchor), items: [comment] })
  }
  return [...groups.values()]
}
