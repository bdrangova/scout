import { useState } from 'react'
import type { PrFinding } from '@review-dash/shared'
import { hashPrBody } from '@review-dash/shared'
import { ImageViewer } from '@/components/evidence/ImageViewer'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tag } from '@/components/ui/tag'
import { Notice } from '@/components/ui/notice'
import { encodePath } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { useCurrentPrReport } from './pr-review-context'

function EvidenceImage({ src, caption }: { src: string; caption: string }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  return <>
    {failed ? <Notice tone="warn">Screenshot unavailable: {caption}</Notice> : <Button variant="ghost" className="h-auto max-w-full p-1" aria-label={`Enlarge ${caption}`} onClick={() => setOpen(true)}><img src={src} alt={caption} onError={() => setFailed(true)} className="max-h-40 max-w-full rounded-lg object-contain" /></Button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="h-[80dvh] sm:max-w-5xl grid-rows-[auto_minmax(0,1fr)]"><DialogHeader><DialogTitle>{caption}</DialogTitle><DialogDescription>Captured reproduction evidence</DialogDescription></DialogHeader><ImageViewer src={src} alt={caption} /></DialogContent></Dialog>
  </>
}
export function ReproductionEvidence({ findings }: { findings: readonly PrFinding[] }) {
  const { sessionId } = useSessionContext()
  const { report } = useCurrentPrReport()
  if (!report || findings.length === 0) return null
  const revision = hashPrBody(JSON.stringify(report))
  return <section aria-label="Reproduction and evidence" className="flex flex-col gap-4 border-t-fine border-line bg-surface p-4 font-sans text-sm text-ink">
    <h3 className="m-0 font-bold">Reproduction & evidence</h3>
    {findings.map((f) => {
      const r = f.reproduction
      return <section key={f.id} id={`reproduction-${encodeURIComponent(f.id)}`} aria-label={`Reproduction: ${f.title}`} className="flex flex-col gap-2 rounded-xl border-fine border-line p-3">
        <div className="flex flex-wrap items-center gap-2"><strong>{f.title}</strong><Tag tone={r.status === 'reproduced' ? 'ok' : 'warn'}>{r.status}</Tag></div>
        <p className="m-0 text-xs text-ink-muted">{r.environment} · revision <code>{r.revision.slice(0, 12)}</code></p>
        {r.prerequisites.length > 0 && <ul className="list-disc pl-5">{r.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        <ol className="list-decimal pl-5">{r.steps.map((step) => <li key={step.id}>{step.instruction}</li>)}</ol>
        <p className="m-0"><strong>Expected:</strong> {r.expected}</p><p className="m-0"><strong>Actual:</strong> {r.actual}</p>
        {r.limitation && <Notice tone="warn">{r.limitation}</Notice>}
        <div className="flex flex-wrap gap-3">{r.evidence.map((e, i) => {
          const src = `/api/sessions/${encodeURIComponent(sessionId)}/pr-review/media/${encodePath(e.path)}?revision=${revision}`
          return <figure key={i} className="m-0 flex max-w-full flex-col gap-1">
            {e.kind === 'screenshot' ? <EvidenceImage src={src} caption={e.caption} /> : <a href={src} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Open {e.kind}</a>}
            <figcaption className="text-xs text-ink-muted">Step {e.stepId}: {e.caption} · {new Date(e.capturedAt).toLocaleString()}</figcaption>
          </figure>
        })}</div>
      </section>
    })}
  </section>
}
