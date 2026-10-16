import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEND_TARGET_LABELS, type SendTarget } from '@/lib/runs'
import { cn } from '@/lib/utils'

export interface SendTargetMenuProps {
  value: SendTarget
  onChange: (target: SendTarget) => void
  /** Without a recorded agent session there is nothing to continue, so "Current session" is off. */
  canContinue: boolean
  disabled?: boolean
}

/** The caret half of the Submit split button: picks the session the feedback is sent to. */
export function SendTargetMenu({ value, onChange, canContinue, disabled = false }: SendTargetMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        render={<Button size="icon" aria-label="Send options" className="rounded-l-none border-l border-l-primary-foreground/30" />}
      >
        <ChevronDown />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="end" sideOffset={6} className="isolate z-50">
          <Menu.Popup className="min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <Menu.RadioGroup value={value} onValueChange={(next: SendTarget) => onChange(next)}>
              {(Object.keys(SEND_TARGET_LABELS) as SendTarget[]).map((target) => (
                <Menu.RadioItem
                  key={target}
                  value={target}
                  closeOnClick
                  disabled={target === 'current' && !canContinue}
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none',
                    'data-highlighted:bg-muted data-disabled:opacity-50',
                  )}
                >
                  <Menu.RadioItemIndicator keepMounted className="flex size-3.5 items-center justify-center">
                    {value === target && <Check className="size-3.5" />}
                  </Menu.RadioItemIndicator>
                  {SEND_TARGET_LABELS[target]}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
