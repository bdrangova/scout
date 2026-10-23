import { ScoutMascot } from '@/components/brand/Scout'
import type { CodeReviewDetail } from '@review-dash/shared'
import { ArrowLeftIcon, FileTextIcon, ImageIcon, PackageIcon, SendIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'

export interface ReviewCompleteProps {
  sessionId: string
  /** The section counts, as the header tabs show them; an empty section gets no button. */
  detail: Pick<CodeReviewDetail, 'evidence' | 'spec' | 'extras'>
  /** Leave the end state and return to the files. */
  onBack: () => void
  /** The current view (cards, list or grid), kept behind the panel, blurred and inert. */
  children: ReactNode
}

const SECTIONS: readonly { to: 'evidence' | 'spec' | 'extras'; label: string; icon: LucideIcon }[] = [
  { to: 'evidence', label: 'Evidence', icon: ImageIcon },
  { to: 'spec', label: 'Spec', icon: FileTextIcon },
  { to: 'extras', label: 'Extras', icon: PackageIcon },
]

/**
 * The end of the review: the view stays on screen but blurred and out of reach (inert, hidden
 * from assistive tech), under a centered panel that leads to the other sections, Submit first.
 */
export function ReviewComplete({ sessionId, detail, onBack, children }: ReviewCompleteProps) {
  const base = `/s/${encodeURIComponent(sessionId)}`
  const sections = SECTIONS.map((section) => ({ ...section, count: detail[section.to].length })).filter((section) => section.count > 0)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-paper" data-review-complete>
      <div inert aria-hidden className="pointer-events-none flex min-h-0 flex-1 scale-[1.02] flex-col blur-[7px] select-none">
        {children}
      </div>
      <div aria-hidden className="absolute inset-0 bg-sunken/55" />
      <section aria-labelledby="review-complete-title" className="absolute inset-0 flex items-center justify-center p-6">
        <Panel className="w-full max-w-[460px]">
          <PanelHeader className="min-h-[52px] justify-center">
            <PanelTitle id="review-complete-title" className="text-lg">
              Review complete
            </PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col items-center gap-5 px-7 pt-[26px] pb-[22px]">
            <ScoutMascot mode="ready" />
            <Notice tone="ok" data-status="ready">
              Ready to submit
            </Notice>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {sections.map(({ to, label, icon: Icon, count }) => (
                <Link key={to} to={`${base}/${to}`} aria-label={`${label} ${count}`} title={label} className={buttonVariants({ variant: 'default' })}>
                  <Icon aria-hidden />
                  <span className="text-xs font-semibold text-ink-muted tabular-nums">{count}</span>
                </Link>
              ))}
              <Link to={`${base}/submit`} className={buttonVariants({ variant: 'primary' })}>
                <SendIcon aria-hidden />
                Submit
              </Link>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Back to files" title="Back to files" onClick={onBack} className="text-ink-muted shadow-none hover:text-ink">
              <ArrowLeftIcon aria-hidden />
            </Button>
          </PanelBody>
        </Panel>
      </section>
    </div>
  )
}
