import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SegmentedVariant = 'seg' | 'pills'

const SegmentedContext = createContext<SegmentedVariant>('seg')

interface SegmentedProps extends ComponentProps<'div'> {
  /** `seg`: one boxed control with small flat buttons. `pills`: loose rounded pills with a gap. */
  variant?: SegmentedVariant
  /** Required: what the group chooses (read by screen readers). */
  'aria-label': string
}

/** A flat chooser: line only, the selected item is filled ink. Children are `SegmentedItem`s. */
function Segmented({ className, variant = 'seg', children, ...props }: SegmentedProps) {
  return (
    <SegmentedContext value={variant}>
      <div
        role="group"
        data-slot="segmented"
        data-variant={variant}
        className={cn(
          variant === 'seg'
            ? 'inline-flex gap-0.5 rounded-lg border-fine border-line bg-surface p-0.5'
            : 'flex flex-wrap items-center gap-1.5',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SegmentedContext>
  )
}

interface SegmentedItemProps extends Omit<ComponentProps<'button'>, 'children'> {
  pressed: boolean
  /** Optional count shown after the label (tabular). */
  count?: number
  children?: ReactNode
}

const ITEM_CLASS: Record<SegmentedVariant, string> = {
  // The ::after grows the 26px hit area to 32px without changing the look (U16).
  seg: 'relative h-[26px] rounded-sm after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[""] border-0 px-[9px] text-[12.5px] [&_svg]:size-[15px] aria-pressed:bg-selected aria-pressed:text-on-selected',
  pills:
    'h-8 rounded-full border-fine border-line px-[13px] text-[13px] [&_svg]:size-3.5 aria-pressed:border-selected-border aria-pressed:bg-selected aria-pressed:text-on-selected',
}

function SegmentedItem({ className, pressed, count, children, type = 'button', ...props }: SegmentedItemProps) {
  const variant = useContext(SegmentedContext)
  return (
    <button
      type={type}
      aria-pressed={pressed}
      data-slot="segmented-item"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap bg-transparent font-bold text-ink transition-colors hover:bg-hover',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
        ITEM_CLASS[variant],
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span
          data-slot="segmented-count"
          className={cn('font-semibold tabular-nums', pressed ? 'text-inherit opacity-80' : 'text-ink-muted')}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** A standalone flat pill chooser (same as a `SegmentedItem` inside `variant="pills"`). */
function Pill({ className, pressed, count, children, type = 'button', ...props }: SegmentedItemProps) {
  return (
    <SegmentedContext value="pills">
      <SegmentedItem className={className} pressed={pressed} count={count} type={type} {...props}>
        {children}
      </SegmentedItem>
    </SegmentedContext>
  )
}

export { Segmented, SegmentedItem, Pill, type SegmentedProps, type SegmentedItemProps }
