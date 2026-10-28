import type { SessionDetail } from '@scout/shared'
import { BookOpen, Bug, CircleAlert, Database, FileText, Files, Image, LayoutDashboard, ListChecks, Package, ScrollText, Send, Check, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { isTestRunDetail } from '@/lib/detail-kind'
import { PrTab } from './PrTab'
import { useShellConfig, visibleSectionsOf, type ShellConfig } from './shell-config'
import { useCurrentSection } from './useCurrentSection'
import { cn } from '@/lib/utils'

interface SectionTab {
  to: string
  label: string
  icon: LucideIcon
  /** Shown when > 0 (Files and Review always show their count). */
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

const SECTION_ICONS: Record<string, LucideIcon> = {
  spec: FileText,
  extras: Package,
  journal: BookOpen,
  evidence: Image,
  files: Files,
  submit: Send,
  overview: LayoutDashboard,
  review: ListChecks,
  gaps: Bug,
  'data-setup': Database,
  logs: ScrollText,
}

/** Sections whose tab shows its count even at zero. */
const ALWAYS_COUNTED: ReadonlySet<string> = new Set(['files', 'review'])

/** Tabs in the kind's section order (also the number-hotkey order), only the visible ones; the PR link is not one of them. */
function sectionTabs(config: ShellConfig, detail: SessionDetail, submit: SubmitTab): SectionTab[] {
  return visibleSectionsOf(config, detail).map((section) => ({
    to: section,
    label: config.sectionLabel(section),
    icon: SECTION_ICONS[section] ?? FileText,
    count: section === 'submit' ? submit.openComments : config.sectionCount?.(section, detail),
    state: section === 'submit' ? submit.state : undefined,
  }))
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
  return tab.count !== undefined && (ALWAYS_COUNTED.has(tab.to) || tab.count > 0)
}

/**
 * Section tabs in the bar as arrow-shaped steps (purely visual; every tab is a plain link): icon, full label and count on every tab. Below 1024px the
 * inactive tabs fall back to icon and count (the active one keeps its word). Each link is named `Label count` for assistive technology.
 * Submit counts the open comments and, while another page is open, turns green with a check when the review is ready and red when the last run failed.
 */
export function SectionTabs({ detail, submit }: { detail: SessionDetail; submit: SubmitTab }) {
  const location = useLocation()
  const config = useShellConfig()
  const onFiles = useCurrentSection() === 'files'
  const tabs = sectionTabs(config, detail, submit)
  return (
    <nav aria-label="Sections" className="ml-1 flex items-stretch [filter:drop-shadow(2px_2px_0_var(--sh))]">
      {tabs.map((tab) => {
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
                    <span className={cn(isActive ? 'max-[520px]:sr-only' : config.kind === 'test-run' ? 'max-2xl:sr-only' : 'max-lg:sr-only')}>{tab.label}</span>
                    {counted && <span className={cn('text-[11.5px] font-semibold tabular-nums max-md:hidden', isActive || signal ? 'opacity-85' : 'text-ink-muted')}>{tab.count}</span>}
                  </span>
                </span>
              )
            }}
          </NavLink>
        )
      })}
      {!isTestRunDetail(detail) && detail.pr && <PrTab pr={detail.pr} />}
    </nav>
  )
}
