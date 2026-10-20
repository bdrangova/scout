import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Actions are raised: fill + 1.5px line + a hard 2px shadow that the button presses into.
 * `ghost` and `link` are the flat exceptions. Icon-only buttons (`size="icon"`) need `aria-label` and `title`.
 */
const buttonVariants = cva(
  [
    'group/button press inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap select-none',
    'border-fine border-line bg-surface text-ink font-bold shadow-raised',
    'hover:bg-hover',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  ],
  {
    variants: {
      variant: {
        default: '',
        /** The one main action on a screen: yellow (blue in dark), hover flips to pink. */
        primary: 'border-fill-line bg-yellow text-on-yellow hover:bg-pink hover:text-hdr-ink',
        approve: 'border-fill-line bg-mint text-hdr-ink hover:bg-green hover:text-paper',
        reject: 'text-red hover:bg-red-solid hover:text-on-red',
        ghost: 'border-transparent bg-transparent shadow-none hover:bg-hover active:shadow-none',
        link: [
          'h-auto border-0 bg-transparent p-0 font-semibold text-focus shadow-none underline decoration-[1.5px] underline-offset-[3px]',
          'hover:bg-transparent hover:text-focus hover:translate-0 active:translate-0 active:shadow-none',
        ],
      },
      size: {
        default: 'h-10 rounded-xl px-[18px] text-sm',
        sm: 'h-8 rounded-lg px-3 text-[13px]',
        /** Square 40px (`.btn.sq`). */
        icon: 'size-10 rounded-xl p-0',
        /** Square 32px (`.btn.sq.sm`). */
        'icon-sm': 'size-8 rounded-lg p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants, type ButtonProps }
