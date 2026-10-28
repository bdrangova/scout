import type { Decision } from '@scout/shared'
import { MessageSquareWarningIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VERDICT_STYLE } from '@/lib/verdict'

interface Option {
  value: Exclude<Decision, 'undecided'>
  label: string
  hint: string
  icon: LucideIcon
  /** Colour of the title (and its icon). */
  titleClass: string
  /** The notice tint the card takes when selected. */
  selectedClass: string
}

const OPTIONS: readonly Option[] = [
  {
    value: 'approve',
    label: 'Approve',
    hint: 'Ready for a PR.',
    icon: VERDICT_STYLE.approved.icon,
    titleClass: VERDICT_STYLE.approved.className,
    selectedClass: 'border-ok-bd bg-ok-bg',
  },
  {
    value: 'request-changes',
    label: 'Request changes',
    hint: 'Claude applies comments.',
    icon: MessageSquareWarningIcon,
    titleClass: 'text-ink',
    selectedClass: 'border-warn-bd bg-warn-bg',
  },
  {
    value: 'reject',
    label: 'Reject',
    hint: 'Stop; rethink the approach.',
    icon: VERDICT_STYLE.rejected.icon,
    titleClass: VERDICT_STYLE.rejected.className,
    selectedClass: 'border-err-bd bg-err-bg',
  },
]

/** A choice with its own wording; the colours and icon come from the standard option of the same value. */
export interface DecisionChoice {
  value: Exclude<Decision, 'undecided'>
  label: string
  hint: string
}

export interface DecisionPickerProps {
  value: Decision
  /** The choices to offer (default: approve, request changes, reject). */
  choices?: readonly DecisionChoice[]
  onChange: (decision: Decision) => void
  disabled?: boolean
  className?: string
}

/**
 * Approve / request changes / reject as radio cards; clicking the chosen one again returns to undecided.
 * Three columns only when the picker itself is wide enough (container query); otherwise full-width rows.
 */
export function DecisionPicker({ value, choices, onChange, disabled = false, className }: DecisionPickerProps) {
  const options = choices ? choices.flatMap((choice) => OPTIONS.filter((option) => option.value === choice.value).map((option) => ({ ...option, ...choice }))) : OPTIONS
  return (
    <div className={cn('@container', className)}>
      <div role="radiogroup" aria-label="Decision" className={cn('grid gap-2.5', options.length === 3 ? '@2xl:grid-cols-3' : '@2xl:grid-cols-2')}>
        {options.map((option) => {
          const selected = value === option.value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-decision={option.value}
              disabled={disabled}
              onClick={() => onChange(selected ? 'undecided' : option.value)}
              className={cn(
                'flex min-w-0 items-start gap-2.5 rounded-xl border-fine bg-surface px-3.5 py-3 text-left text-ink transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-60',
                selected ? option.selectedClass : 'border-line hover:bg-hover',
              )}
            >
              <span
                aria-hidden
                className={cn('mt-0.5 size-4 shrink-0 rounded-full border-fine bg-paper', selected ? 'border-[5px] border-ink' : 'border-line')}
              />
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className={cn('flex items-center gap-1.5 text-sm font-bold [&_svg]:size-[15px] [&_svg]:stroke-[2.75]', option.titleClass)}>
                  <Icon aria-hidden />
                  {option.label}
                </span>
                <span className={cn('text-[12.5px] leading-[1.35] font-medium', selected ? 'text-ink' : 'text-ink-muted')}>{option.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
