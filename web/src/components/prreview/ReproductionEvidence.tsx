import { useState } from 'react'
import type { PrFinding } from '@scout/shared'
import { ChevronRight, Focus, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { Notice } from '@/components/ui/notice'
import { useCurrentPrReport } from './pr-review-context'
import { EvidenceLog } from './EvidenceLog'
import { useEvidenceSrc } from './finding-comments'
import { ReproductionFocus } from './ReproductionFocus'
import { orderedEvidence, type EvidenceItem } from './reproduction-evidence'

/** One evidence item per row: screenshots and videos as a thumbnail beside the caption, logs as a full-width code box that collapses. */
function EvidenceRow({ src, item, onOpen }: { src: string; item: EvidenceItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  const caption = <><span className="font-mono font-semibold">Step {item.stepId}</span> · {item.caption} · {new Date(item.capturedAt).toLocaleString()}</>
  if (item.kind === 'video') return <li className="flex items-center gap-3">
    <Button variant="ghost" className="relative h-auto shrink-0 p-1" aria-label={`Play ${item.caption}`} onClick={onOpen}>
      <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="h-14 w-24 rounded-md bg-sunken object-cover object-top" />
      <span className="absolute inset-0 flex items-center justify-center"><Play aria-hidden className="size-6 rounded-full bg-ink/70 p-1.5 text-paper" /></span>
    </Button>
    <span className="min-w-0 flex-1 text-xs text-ink-muted"><Tag>video</Tag> {caption}</span>
  </li>
  if (item.kind !== 'screenshot') return <li><details open className="group flex flex-col gap-1.5">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-ink-muted"><ChevronRight aria-hidden className="size-3.5 shrink-0 transition-transform group-open:rotate-90" /><Tag>{item.kind}</Tag><span className="min-w-0 flex-1">{caption}</span></summary>
    <EvidenceLog src={src} className="mt-1.5 max-h-72 w-full" />
  </details></li>
  return <li className="flex items-center gap-3">
    {failed ? <Notice tone="warn">Screenshot unavailable</Notice> : <Button variant="ghost" className="h-auto shrink-0 p-1" aria-label={`Focus ${item.caption}`} onClick={onOpen}><img src={src} alt={item.caption} onError={() => setFailed(true)} className="h-14 w-24 rounded-md object-cover object-top" /></Button>}
    <span className="min-w-0 flex-1 text-xs text-ink-muted">{caption}</span>
  </li>
}

function FindingReproduction({ finding, srcOf }: { finding: PrFinding; srcOf: (item: EvidenceItem) => string }) {
  const [focus, setFocus] = useState<number | null>(null)
  const r = finding.reproduction
  const items = orderedEvidence(r)
  return <section id={`reproduction-${encodeURIComponent(finding.id)}`} aria-label={`Reproduction: ${finding.title}`} className="flex flex-col gap-2 rounded-xl border-fine border-line p-3">
    <div className="flex flex-wrap items-center gap-2"><strong>{finding.title}</strong><Tag tone={r.status === 'reproduced' ? 'ok' : 'warn'}>{r.status}</Tag>
      {items.length > 0 && <Button size="sm" className="ml-auto" title="Step through the evidence full screen" onClick={() => setFocus(0)}><Focus aria-hidden />Focus</Button>}</div>
    <p className="m-0 text-xs text-ink-muted">{r.environment} · revision <code>{r.revision.slice(0, 12)}</code></p>
    {r.prerequisites.length > 0 && <ul className="list-disc pl-5">{r.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    <ol className="list-decimal pl-5">{r.steps.map((step) => <li key={step.id}>{step.instruction}</li>)}</ol>
    <p className="m-0"><strong>Expected:</strong> {r.expected}</p><p className="m-0"><strong>Actual:</strong> {r.actual}</p>
    {r.limitation && <Notice tone="warn">{r.limitation}</Notice>}
    <ul className="m-0 flex list-none flex-col gap-2 border-t-fine border-line p-0 pt-2">{items.map((e, i) => <EvidenceRow key={e.path} src={srcOf(e)} item={e} onOpen={() => setFocus(i)} />)}</ul>
    <ReproductionFocus finding={finding} items={items} srcOf={srcOf} index={focus} onIndexChange={setFocus} />
  </section>
}

export function ReproductionEvidence({ findings }: { findings: readonly PrFinding[] }) {
  const { report } = useCurrentPrReport()
  const srcOf = useEvidenceSrc()
  if (!report || findings.length === 0) return null
  return <section aria-label="Reproduction and evidence" className="flex flex-col gap-4 border-t-fine border-line bg-surface p-4 font-sans text-sm text-ink">
    <h3 className="m-0 font-bold">Reproduction & evidence</h3>
    {findings.map((f) => <FindingReproduction key={f.id} finding={f} srcOf={srcOf} />)}
  </section>
}
