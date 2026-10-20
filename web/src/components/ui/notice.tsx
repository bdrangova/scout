import { cva, type VariantProps } from 'class-variance-authority'
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Informational, not clickable: tinted fill, half-strength border, a round solid icon. */
const noticeVariants = cva(
  'inline-flex min-h-[30px] items-center gap-2 rounded-md border py-[3px] pr-3 pl-1 text-[12.5px] font-semibold text-ink',
  {
    variants: {
      tone: {
        info: 'bg-info-bg border-info-bd/50 [--n-ic:var(--info-ic)]',
        warn: 'bg-warn-bg border-warn-bd/50 [--n-ic:var(--warn-ic)]',
        ok: 'bg-ok-bg border-ok-bd/50 [--n-ic:var(--ok-ic)]',
        err: 'bg-err-bg border-err-bd/50 [--n-ic:var(--err-ic)]',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

const DEFAULT_ICON: Record<NonNullable<VariantProps<typeof noticeVariants>['tone']>, LucideIcon> = {
  info: InfoIcon,
  warn: TriangleAlertIcon,
  ok: CircleCheckIcon,
  err: CircleAlertIcon,
}

type NoticeProps = Omit<ComponentProps<'div'>, 'children'> &
  VariantProps<typeof noticeVariants> & {
    /** Replaces the tone's default icon; pass `null` for no icon. */
    icon?: ReactNode | null
    children?: ReactNode
  }

/** `role="status"` (polite) by default, `role="alert"` for `err`; pass `role` to override. */
function Notice({ className, tone = 'info', icon, role, children, ...props }: NoticeProps) {
  const resolvedTone = tone ?? 'info'
  const Icon = DEFAULT_ICON[resolvedTone]
  return (
    <div
      data-slot="notice"
      data-tone={resolvedTone}
      role={role ?? (resolvedTone === 'err' ? 'alert' : 'status')}
      className={cn(noticeVariants({ tone: resolvedTone }), className)}
      {...props}
    >
      {icon === null ? null : (
        <span
          data-slot="notice-icon"
          aria-hidden
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-(--n-ic) text-hdr-ink [&_svg]:size-3 [&_svg]:stroke-[3]"
        >
          {icon ?? <Icon />}
        </span>
      )}
      {children}
    </div>
  )
}

export { Notice, noticeVariants, type NoticeProps }
