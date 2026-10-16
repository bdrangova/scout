import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface CommentBoxProps {
  /** `Comment on useTrial.ts` or `Why reject useTrial.ts?` while a reject is pending. */
  label: string
  /** The reject verdict waits for this comment: the submit reads "Comment & Reject". */
  pendingReject: boolean
  onSubmit: (body: string) => void
  onCancelReject: () => void
  /** Offered as a Cancel button and on Escape (a line comment box that closes without saving). */
  onCancel?: () => void
  /** Bump to move focus into the textarea (the `C` hotkey, the Comment button). */
  focusToken?: number
  /**
   * Start as a one-line "Leave a comment…" row that opens on click, on a `focusToken` bump or on a
   * pending reject, and folds back after a submit or an Escape on an empty draft.
   */
  collapsible?: boolean
  placeholder?: string
  /** Controlled draft, so the card can send it along with an approve or reject. */
  draft?: string
  onDraftChange?: (draft: string) => void
  className?: string
}

export function CommentBox({
  label,
  pendingReject,
  onSubmit,
  onCancelReject,
  onCancel,
  focusToken = 0,
  collapsible = false,
  placeholder = 'Leave a comment…',
  draft: controlledDraft,
  onDraftChange,
  className,
}: CommentBoxProps) {
  const [localDraft, setLocalDraft] = useState('')
  const draft = controlledDraft ?? localDraft
  const setDraft = onDraftChange ?? setLocalDraft
  const [expanded, setExpanded] = useState(!collapsible || pendingReject || draft !== '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const body = draft.trim()

  // A focus request or a pending reject opens the box; the focus effects below run once the
  // textarea exists.
  const [seen, setSeen] = useState({ focusToken, pendingReject })
  if (seen.focusToken !== focusToken || seen.pendingReject !== pendingReject) {
    setSeen({ focusToken, pendingReject })
    if (seen.focusToken !== focusToken || pendingReject) setExpanded(true)
  }

  useEffect(() => {
    if (pendingReject && expanded) textareaRef.current?.focus()
  }, [pendingReject, expanded])

  useEffect(() => {
    if (focusToken > 0 && expanded) textareaRef.current?.focus()
  }, [focusToken, expanded])

  useEffect(() => {
    if (collapsible && expanded) textareaRef.current?.focus()
  }, [collapsible, expanded])

  function submit() {
    if (body === '') return
    onSubmit(body)
    setDraft('')
    if (collapsible && !pendingReject) setExpanded(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (pendingReject) {
        onCancelReject()
      } else if (onCancel) {
        onCancel()
      } else if (collapsible && body === '') {
        setExpanded(false)
      }
      event.currentTarget.blur()
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => setExpanded(true)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-[13px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground',
          className,
        )}
      >
        <span className="flex-1 truncate">Leave a comment…</span>
        <Kbd>C</Kbd>
      </button>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className={cn('text-[13px] font-semibold', pendingReject ? 'text-reject' : 'text-foreground')}>
        {label}
      </label>
      <Textarea
        id={id}
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        className={cn('min-h-14 resize-none bg-background text-[13px] leading-relaxed md:text-[13px]', pendingReject && 'border-reject/60')}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>{' '}
          to submit{pendingReject || onCancel ? ' · Esc to cancel' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {(pendingReject || onCancel) && (
            <Button variant="outline" size="sm" onClick={pendingReject ? onCancelReject : onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={body === ''}
            onClick={submit}
            className={cn(pendingReject && 'bg-reject text-white hover:bg-reject/90')}
          >
            {pendingReject ? 'Comment & Reject' : 'Comment'}
          </Button>
        </div>
      </div>
    </div>
  )
}
