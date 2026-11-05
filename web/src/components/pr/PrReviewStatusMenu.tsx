import type { PrReviewStatus } from '@scout/shared'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { useSetPrReviewStatus } from '@/hooks/useSetPrReviewStatus'
import { PR_REVIEW_STATUS_OPTIONS, PR_STATUS_SPEC } from '@/lib/pr-status'
import { PrStatusLabel } from './PrStatusLabel'

/** The status menu's items: In progress, Commented, Approved (closes the review), the current one checked. */
export function PrReviewStatusItems({ current, busy, onSet }: { current: PrReviewStatus; busy: boolean; onSet: (status: PrReviewStatus) => void }) {
  return (
    <MenuGroup>
      <MenuLabel>Review status</MenuLabel>
      {PR_REVIEW_STATUS_OPTIONS.map((status) => {
        const spec = PR_STATUS_SPEC[status]
        const Icon = spec.icon
        return (
          <MenuItem key={status} disabled={busy} onClick={() => onSet(status)}>
            <Icon aria-hidden className={spec.textClass} />
            {spec.label}
            {status === 'approved' && <span className="text-[11px] text-ink-muted">closes it</span>}
            {status === current && <Check aria-label="Current status" className="ml-auto" />}
          </MenuItem>
        )
      })}
    </MenuGroup>
  )
}

/** A PR review session's status that opens the menu to change it; clicks stay off the card it sits on. */
export function PrReviewStatusMenu({ id, title, status }: { id: string; title: string; status: PrReviewStatus }) {
  const { busy, set } = useSetPrReviewStatus(id)
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Review status of ${title}: ${PR_STATUS_SPEC[status].label}. Change it`}
        title="Change the review status"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="-mx-1.5 -my-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
      >
        <PrStatusLabel status={status} />
        <ChevronDown aria-hidden className="size-3.5 text-ink-muted" />
      </MenuTrigger>
      <MenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <PrReviewStatusItems current={status} busy={busy} onSet={(next) => void set(next)} />
      </MenuContent>
    </Menu>
  )
}
