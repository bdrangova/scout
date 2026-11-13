import type { PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface BoxShellProps {
  boxKey: string
  label: string
  x: number
  y: number
  width: number
  className?: string
  /** Unrelated to the box under the pointer or focus: faded. */
  dim: boolean
  dragging: boolean
  onActive: (key: string | null) => void
  onPointerDown: (key: string, event: PointerEvent<HTMLElement>) => void
  onClickCapture: (event: React.MouseEvent<HTMLElement>) => void
  children: ReactNode
}

/** The positioned, draggable, focusable frame every box shares. The `bp-box` class keeps the canvas from panning when a box is dragged. */
export function BoxShell({ boxKey, label, x, y, width, className, dim, dragging, onActive, onPointerDown, onClickCapture, children }: BoxShellProps) {
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={label}
      data-box-key={boxKey}
      data-slot="blueprint-box"
      data-dragging={dragging || undefined}
      className={cn(
        'bp-box absolute flex touch-none flex-col border-fine border-line bg-surface text-ink transition-opacity select-none',
        dragging ? 'z-10 cursor-grabbing' : 'cursor-grab hover:z-[3]',
        dim && 'opacity-25',
        className,
      )}
      style={{ left: x, top: y, width }}
      onPointerDown={(event) => onPointerDown(boxKey, event)}
      onClickCapture={onClickCapture}
      onMouseEnter={() => onActive(boxKey)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(boxKey)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onActive(null)
      }}
    >
      {children}
    </div>
  )
}
