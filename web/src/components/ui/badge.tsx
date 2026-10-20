import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A count badge: a small round pill, pink by default (the sidebar's file count). For labels use `Tag`. */
const badgeVariants = cva(
  'inline-flex h-5 min-w-[22px] shrink-0 items-center justify-center rounded-full border-fine px-1.5 text-[11.5px] font-bold whitespace-nowrap tabular-nums',
  {
    variants: {
      variant: {
        default: 'border-line bg-pink text-hdr-ink',
        ink: 'border-ink bg-ink text-paper',
        neutral: 'border-line bg-sunken text-ink',
        yellow: 'border-fill-line bg-yellow text-on-yellow',
        coral: 'border-fill-line bg-coral text-hdr-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants, type BadgeProps }
