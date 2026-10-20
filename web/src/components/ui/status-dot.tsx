import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import type { Tone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

const statusDotVariants = cva('relative inline-flex shrink-0 rounded-full', {
  variants: {
    tone: {
      ok: 'bg-st-a',
      warn: 'bg-st-m',
      info: 'bg-st-r',
      err: 'bg-st-d',
      neutral: 'bg-ink-muted',
    } satisfies Record<Tone, string>,
    size: {
      sm: 'size-[7px]',
      default: 'size-[9px]',
      lg: 'size-3',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'default' },
})

type StatusDotProps = Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof statusDotVariants> & {
    /** Read by screen readers; the dot itself is decorative. */
    label: string
    /** Animated halo for live states (agent working, run in flight). */
    pulse?: boolean
  }

function StatusDot({ className, tone = 'neutral', size = 'default', label, pulse = false, ...props }: StatusDotProps) {
  return (
    <span data-slot="status-dot" data-tone={tone} className={cn(statusDotVariants({ tone, size }), className)} {...props}>
      {pulse && (
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-inherit opacity-60 motion-reduce:hidden" />
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export { StatusDot, statusDotVariants, type StatusDotProps }
