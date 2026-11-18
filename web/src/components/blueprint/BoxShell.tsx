import { Check, Minus } from 'lucide-react'
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { PickState } from './useSelection'

/** Select mode, seen from one box: how much of it is picked, and what a click on it does. */
interface BoxPick {
  state: PickState
  onToggle: () => void
}

export interface BoxShellProps {
  boxKey: string
  label: string
  x: number
  y: number
  width: number
  className?: string
  /** A translucent colour laid over the whole box (its review state). */
  wash?: string | null
  /** Unrelated to the box under the pointer or focus: faded. */
  dim: boolean
  dragging: boolean
  /** Left out of the diagram by a "Hide" switch: still laid out (so nothing moves), but not seen, clicked, focused or read out. */
  hidden?: boolean
  /** Set while select mode is on: every click picks or unpicks the box instead of opening anything. */
  pick: BoxPick | null
  /** Shift + click while select mode is off: turns it on with this box picked. */
  onShiftPick: () => void
  onActive: (key: string | null) => void
  onPointerDown: (key: string, event: PointerEvent<HTMLElement>) => void
  onClickCapture: (event: MouseEvent<HTMLElement>) => void
  children: ReactNode
}

const PICK_ARIA = { all: true, some: 'mixed', none: false } as const

/** The round badge on the top-left corner in select mode: empty to invite a pick, a check once picked, a minus when only part of a package is. */
function PickBadge({ state }: { state: PickState }) {
  return (
    <span
      aria-hidden
      data-slot="blueprint-pick"
      data-state={state}
      className={cn(
        'pointer-events-none absolute -top-3 -left-3 z-[1] grid size-6 place-items-center rounded-full border-2 border-selected',
        state === 'none' ? 'bg-surface' : 'bg-selected text-on-selected',
      )}
    >
      {state === 'all' && <Check className="size-3.5 stroke-[3.5]" />}
      {state === 'some' && <Minus className="size-3.5 stroke-[3.5]" />}
    </span>
  )
}

/** The positioned, draggable, focusable frame every box shares. The `bp-box` class keeps the canvas from panning when a box is dragged. */
export function BoxShell({ boxKey, label, x, y, width, className, wash, dim, dragging, hidden = false, pick, onShiftPick, onActive, onPointerDown, onClickCapture, children }: BoxShellProps) {
  // Ahead of the box's own buttons (capture phase): select mode and Shift + click replace what a click normally does.
  function onClick(event: MouseEvent<HTMLElement>) {
    const claim = (action: () => void) => {
      event.preventDefault()
      event.stopPropagation()
      action()
    }
    if (pick) claim(pick.onToggle)
    else if (event.shiftKey) claim(onShiftPick)
    else onClickCapture(event)
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!pick || event.target !== event.currentTarget || (event.key !== ' ' && event.key !== 'Enter')) return
    event.preventDefault()
    pick.onToggle()
  }
  return (
    <div
      role={pick ? 'checkbox' : 'group'}
      aria-checked={pick ? PICK_ARIA[pick.state] : undefined}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      aria-label={label}
      data-box-key={boxKey}
      data-slot="blueprint-box"
      data-dragging={dragging || undefined}
      data-pick={pick?.state}
      data-hidden={hidden || undefined}
      className={cn(
        'bp-box absolute flex touch-none flex-col border-fine border-line bg-surface text-ink transition-opacity select-none',
        pick ? 'cursor-pointer' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        dragging ? 'z-10' : 'hover:z-[3]',
        dim && 'opacity-25',
        className,
        // After `className`, so the picked outline wins over the centre box's.
        pick && pick.state === 'none' && 'opacity-55',
        pick && pick.state !== 'none' && 'z-[2] outline outline-[3px] outline-offset-[3px] outline-selected',
        pick?.state === 'some' && 'outline-dashed',
      )}
      style={{ left: x, top: y, width, visibility: hidden ? 'hidden' : undefined }}
      onPointerDown={(event) => onPointerDown(boxKey, event)}
      onClickCapture={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => onActive(boxKey)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(boxKey)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onActive(null)
      }}
    >
      {children}
      {wash && <span aria-hidden data-slot="blueprint-wash" className={cn('pointer-events-none absolute inset-0 rounded-[inherit]', wash)} />}
      {pick && <PickBadge state={pick.state} />}
    </div>
  )
}
