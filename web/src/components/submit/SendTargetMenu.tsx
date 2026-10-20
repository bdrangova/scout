import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { SEND_TARGET_HINTS, SEND_TARGET_LABELS, type SendTarget } from '@/lib/runs'

export interface SendTargetMenuProps {
  value: SendTarget
  onChange: (target: SendTarget) => void
  /** Without a recorded agent session there is nothing to continue, so "Current session" is off. */
  canContinue: boolean
  disabled?: boolean
}

const TARGETS = Object.keys(SEND_TARGET_LABELS) as SendTarget[]

/** The caret half of the Submit split button: picks the session the feedback is sent to. */
export function SendTargetMenu({ value, onChange, canContinue, disabled = false }: SendTargetMenuProps) {
  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        render={
          <Button
            variant="primary"
            size="icon"
            aria-label="Send options"
            title="Send options"
            className="rounded-l-none border-l-fine border-l-fill-line"
          />
        }
      >
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuContent side="top" align="end" className="min-w-72">
        <MenuPrimitive.RadioGroup value={value} onValueChange={(next: SendTarget) => onChange(next)}>
          <MenuLabel>Submit to</MenuLabel>
          {TARGETS.map((target) => (
            <MenuPrimitive.RadioItem
              key={target}
              value={target}
              closeOnClick
              disabled={target === 'current' && !canContinue}
              data-slot="menu-radio-item"
              className="relative flex min-h-8 cursor-default items-start gap-2 py-1.5 rounded-md px-2 font-semibold outline-none select-none data-highlighted:bg-hover data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <MenuPrimitive.RadioItemIndicator keepMounted className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
                {value === target && <CheckIcon className="size-3.5 stroke-[3]" />}
              </MenuPrimitive.RadioItemIndicator>
              <span className="flex flex-col">
                <span>{SEND_TARGET_LABELS[target]}</span>
                <span className="text-xs font-medium text-ink-muted">{SEND_TARGET_HINTS[target]}</span>
              </span>
            </MenuPrimitive.RadioItem>
          ))}
        </MenuPrimitive.RadioGroup>
      </MenuContent>
    </Menu>
  )
}
