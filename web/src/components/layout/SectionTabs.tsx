import { SECTIONS, type SessionDetail } from '@review-dash/shared'
import { CircleAlert, FileText, Files, Image, Package, Send, Check, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { PrTab } from './PrTab'
import { useCurrentSection } from './useCurrentSection'
import { cn } from '@/lib/utils'

interface SectionTab {
  to: string
  label: string
  icon: LucideIcon
  /** Shown when > 0 (Files always shows its count). */
  count?: number
  /** Submit only: the review is ready to send, or the last run failed. */
  state?: SubmitState
}

/** Submit's own signal: green with a check when ready, red when the last run failed. */
export type SubmitState = 'ready' | 'failed' | null

export interface SubmitTab {
  /** The open comments, the number Submit sends. */
  openComments: number
  state: SubmitState
}

/** Tabs in the shared `SECTIONS` order (also the `1–5` hotkey order); the PR link is not one of them. */
function sectionTabs(detail: SessionDetail, submit: SubmitTab): SectionTab[] {
  const tabs: Record<(typeof SECTIONS)[number], SectionTab> = {
    spec: { to: 'spec', label: 'Spec', icon: FileText, count: detail.spec.length },
    extras: { to: 'extras', label: 'Extras', icon: Package, count: detail.extras.length },
    evidence: { to: 'evidence', label: 'Evidence', icon: Image, count: detail.evidence.length },
    files: { to: 'files', label: 'Files', icon: Files, count: detail.tree.files.length },
    submit: { to: 'submit', label: 'Submit', icon: Send, count: submit.openComments, state: submit.state },
  }
  return SECTIONS.map((section) => tabs[section])
}

const STATE_CLASS = { ready: { link: 'text-paper', fill: 'bg-st-ready' }, failed: { link: 'text-paper', fill: 'bg-st-failed' } } as const
const STATE_ICON = { ready: Check, failed: CircleAlert } as const
const STATE_WORDS = { ready: 'ready', failed: 'last run failed' } as const

/** `Spec 4`, `Submit, ready, 2 open comments`: what a tab says to assistive technology. */
function tabName(tab: SectionTab, counted: boolean): string {
  if (tab.to !== 'submit') return counted ? `${tab.label} ${tab.count}` : tab.label
  const parts = [tab.label]
  if (tab.state) parts.push(STATE_WORDS[tab.state])
  if (counted) parts.push(`${tab.count} open ${tab.count === 1 ? 'comment' : 'comments'}`)
  return parts.join(', ')
}

function showsCount(tab: SectionTab): tab is SectionTab & { count: number } {
  return tab.count !== undefined && (tab.to === 'files' || tab.count > 0)
}

/**
 * Section tabs in the bar as arrow-shaped steps (purely visual; every tab is a plain link): icon, full label and count on every tab. Below 1024px the
 * inactive tabs fall back to icon and count (the active one keeps its word). Each link is named `Label count` for assistive technology.
 * Submit counts the open comments and, while another page is open, turns green with a check when the review is ready and red when the last run failed.
 */
export function SectionTabs({ detail, submit }: { detail: SessionDetail; submit: SubmitTab }) {
  const location = useLocation()
  const onFiles = useCurrentSection() === 'files'
  return (
    <nav aria-label="Sections" className="ml-1 flex items-stretch [filter:drop-shadow(2px_2px_0_var(--sh))]">
      {sectionTabs(detail, submit).map((tab) => {
        const counted = showsCount(tab)
        return (
          <NavLink
            key={tab.to}
            to={tab.to === 'files' && onFiles ? { pathname: tab.to, search: location.search } : tab.to}
            aria-label={tabName(tab, counted)}
            title={tab.label}
            className={({ isActive }) => {
              const signal = isActive ? null : tab.state
              return cn('step-tab text-[13px] font-bold whitespace-nowrap', '[&_svg]:size-[15px] [&_svg]:shrink-0', isActive ? 'text-hdr' : signal ? STATE_CLASS[signal].link : 'text-ink')
            }}
          >
            {({ isActive }) => {
              const signal = isActive ? null : tab.state
              const Icon = signal ? STATE_ICON[signal] : tab.icon
              return (
                <span className={cn('step-tab-in', isActive ? 'bg-hdr-ink' : signal ? STATE_CLASS[signal].fill : 'bg-surface')}>
                  <span className="step-tab-c">
                    <Icon aria-hidden className={signal ? 'stroke-[3]' : undefined} />
                    <span className={cn(isActive ? 'max-[520px]:sr-only' : 'max-lg:sr-only')}>{tab.label}</span>
                    {counted && <span className={cn('text-[11.5px] font-semibold tabular-nums max-md:hidden', isActive || signal ? 'opacity-85' : 'text-ink-muted')}>{tab.count}</span>}
                  </span>
                </span>
              )
            }}
          </NavLink>
        )
      })}
      {detail.pr && <PrTab pr={detail.pr} />}
    </nav>
  )
}
