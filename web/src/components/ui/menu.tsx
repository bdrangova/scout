import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A popover menu surface (the panel look at a smaller scale) for dropdowns and multiselects.
 * Compose: `<Menu><MenuTrigger render={<Button />}>…</MenuTrigger><MenuContent><MenuCheckboxItem …/></MenuContent></Menu>`.
 */
function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} alignOffset={alignOffset} side={side} sideOffset={sideOffset} className="isolate z-50">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            'z-50 flex min-w-44 origin-(--transform-origin) flex-col gap-0.5 rounded-xl border-fine border-line bg-surface p-1.5 text-[13px] text-ink shadow-panel outline-none',
            'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

const ITEM_CLASS =
  'relative flex h-8 cursor-default items-center gap-2 rounded-md px-2 font-semibold outline-none select-none data-highlighted:bg-hover data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*="size-"])]:size-3.5 [&_svg]:shrink-0'

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item data-slot="menu-item" className={cn(ITEM_CLASS, className)} {...props} />
}

/** A checkbox row (`role="menuitemcheckbox"`, `aria-checked`) with a check mark in a fixed-width box. */
function MenuCheckboxItem({ className, children, ...props }: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem data-slot="menu-checkbox-item" className={cn(ITEM_CLASS, className)} {...props}>
      <span
        aria-hidden
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border-fine border-line bg-paper in-data-[checked]:border-ink in-data-[checked]:bg-ink in-data-[checked]:text-paper"
      >
        <MenuPrimitive.CheckboxItemIndicator data-slot="menu-checkbox-indicator">
          <CheckIcon className="size-3 stroke-[3]" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator data-slot="menu-separator" className={cn('-mx-1.5 my-1 h-[1.5px] bg-line', className)} {...props} />
}

function MenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

function MenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-label"
      className={cn('px-2 pt-1.5 pb-1 text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase', className)}
      {...props}
    />
  )
}

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuCheckboxItem, MenuSeparator, MenuGroup, MenuLabel }
