import type { Decision } from '@review-dash/shared'
import { cn } from '@/lib/utils'

interface Option {
  value: Exclude<Decision, 'undecided'>
  label: string
  hint: string
  labelClass: string
  activeClass: string
}

const OPTIONS: readonly Option[] = [
  {
    value: 'approve',
    label: 'Approve',
    hint: 'Ready for a PR to be opened.',
    labelClass: 'text-approve',
    activeClass: 'border-approve bg-approve/10',
  },
  {
    value: 'request-changes',
    label: 'Request changes',
    hint: 'Claude Code applies the open comments.',
    labelClass: 'text-warn-foreground',
    activeClass: 'border-warn bg-warn/15',
  },
  {
    value: 'reject',
    label: 'Reject',
    hint: 'Stop here; the approach needs rethinking.',
    labelClass: 'text-reject',
    activeClass: 'border-reject bg-reject/10',
  },
]

export interface DecisionPickerProps {
  value: Decision
  onChange: (decision: Decision) => void
  disabled?: boolean
  className?: string
}

/** Approve / request changes / reject as a radio group; clicking the chosen one again clears it. */
export function DecisionPicker({ value, onChange, disabled = false, className }: DecisionPickerProps) {
  return (
    <div role="radiogroup" aria-label="Decision" className={cn('flex gap-3', className)}>
      {OPTIONS.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(selected ? 'undecided' : option.value)}
            className={cn(
              'flex flex-1 items-start gap-2.5 rounded-lg border-2 bg-card px-3.5 py-3 text-left transition outline-none',
              'hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60',
              selected ? option.activeClass : 'border-border',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 size-4 shrink-0 rounded-full border-2 bg-background',
                selected ? 'border-[5px] border-current' : 'border-muted-foreground/40',
                selected && option.labelClass,
              )}
            />
            <span className="flex flex-col gap-0.5">
              <span className={cn('text-[13px] font-semibold', option.labelClass)}>{option.label}</span>
              <span className="text-xs leading-snug text-muted-foreground">{option.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
