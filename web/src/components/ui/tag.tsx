import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Tiny flat labels. Tinted tones (`neutral` `info` `warn` `ok` `err`) are the `.tag` family;
 * solid tones (`yellow` `mint` `coral` `blue` `pink` `sunken`) are the `.chip` family used for file status.
 */
const tagVariants = cva(
  'inline-flex items-center gap-[5px] whitespace-nowrap rounded-sm border-fine text-[11.5px] font-bold text-ink [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:stroke-[2.5]',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-paper-2',
        info: 'border-info-bd/50 bg-info-bg',
        warn: 'border-warn-bd/50 bg-warn-bg',
        ok: 'border-ok-bd/50 bg-ok-bg',
        err: 'border-err-bd/50 bg-err-bg',
        yellow: 'border-fill-line bg-yellow text-on-yellow',
        mint: 'border-fill-line bg-mint text-hdr-ink',
        coral: 'border-fill-line bg-coral text-hdr-ink',
        blue: 'border-fill-line bg-blue text-on-blue',
        pink: 'border-fill-line bg-pink text-hdr-ink',
        sunken: 'border-line bg-sunken',
      },
      size: {
        default: 'h-[22px] px-[9px]',
        sm: 'h-5 px-[7px] text-[11px]',
      },
      mono: {
        true: 'font-mono font-medium tracking-[.02em]',
      },
      pill: {
        true: 'rounded-full',
      },
      /** Icon only, 24px square; needs `aria-label` + `title`. */
      icon: {
        true: 'w-6 justify-center gap-0 px-0 [&_svg]:size-[13px]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'default' },
  },
)

type TagProps = ComponentProps<'span'> & VariantProps<typeof tagVariants>

function Tag({ className, tone = 'neutral', size = 'default', mono, pill, icon, ...props }: TagProps) {
  return (
    <span
      data-slot="tag"
      data-tone={tone}
      className={cn(tagVariants({ tone, size, mono, pill, icon }), className)}
      {...props}
    />
  )
}

export { Tag, tagVariants, type TagProps }
