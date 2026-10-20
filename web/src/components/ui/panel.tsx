import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** The only big surfaces: 1.5px line and a 14px radius. Flat: cards carry no shadow (only raised buttons do). */
function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="panel" className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border-fine border-line bg-surface text-ink', className)} {...props} />
}

/** Tinted strip with the title; put actions last with `ml-auto`. */
function PanelHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-header"
      className={cn('flex min-h-[46px] flex-wrap items-center gap-2.5 border-b-fine border-line bg-paper-2 px-4 py-[9px]', className)}
      {...props}
    />
  )
}

function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="panel-title" className={cn('m-0 text-[15px] font-bold', className)} {...props} />
}

function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="panel-body" className={cn('p-4', className)} {...props} />
}

function PanelFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="panel-footer" className={cn('border-t-fine border-line bg-surface px-4 pt-3 pb-3.5', className)} {...props} />
  )
}

export { Panel, PanelHeader, PanelTitle, PanelBody, PanelFooter }
