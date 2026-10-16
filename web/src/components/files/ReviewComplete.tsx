import type { SessionDetail } from '@review-dash/shared'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'

export interface ReviewCompleteProps {
  sessionId: string
  /** The section counts, as the header tabs show them; an empty section gets no button. */
  detail: Pick<SessionDetail, 'evidence' | 'spec' | 'extras'>
  /** Leave the end state and return to the files. */
  onBack: () => void
  /** The current view (cards, list or grid), kept behind the panel, blurred and inert. */
  children: ReactNode
}

/**
 * The end of the review: the view stays on screen but blurred and out of reach (inert, hidden
 * from assistive tech), under a centered panel that leads to the other sections, Submit first.
 */
export function ReviewComplete({ sessionId, detail, onBack, children }: ReviewCompleteProps) {
  const base = `/s/${encodeURIComponent(sessionId)}`
  const sections = [
    { to: 'evidence', label: 'Evidence', count: detail.evidence.length },
    { to: 'spec', label: 'Spec', count: detail.spec.length },
    { to: 'extras', label: 'Extras', count: detail.extras.length },
  ].filter((section) => section.count > 0)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-review-complete>
      <div inert aria-hidden className="pointer-events-none flex min-h-0 flex-1 flex-col opacity-80 blur-xl saturate-50 select-none">
        {children}
      </div>
      <section aria-labelledby="review-complete-title" className="absolute inset-0 flex items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border bg-card px-8 py-7 shadow-[0_12px_40px_rgba(27,26,23,0.12)]">
          <h2 id="review-complete-title" className="text-lg font-semibold">
            Review complete
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {sections.map((section) => (
              <Link key={section.to} to={`${base}/${section.to}`} className={buttonVariants({ variant: 'outline' })}>
                {section.label}
                <span className="text-xs opacity-70 tabular-nums">{section.count}</span>
              </Link>
            ))}
            <Link to={`${base}/submit`} className={buttonVariants()}>
              Submit
            </Link>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack} className="-mb-2 text-muted-foreground">
            Back to files
          </Button>
        </div>
      </section>
    </div>
  )
}
