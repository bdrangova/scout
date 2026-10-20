import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/theme/useTheme'

/** Toasts styled as small panels; follows the app theme through `ThemeProvider`. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme()

  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-green" />,
        info: <InfoIcon className="size-4 text-st-r" />,
        warning: <TriangleAlertIcon className="size-4 text-st-m" />,
        error: <OctagonXIcon className="size-4 text-red" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--line)',
          '--border-radius': '12px',
          fontFamily: 'inherit',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'border-fine! shadow-panel! font-semibold!',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
