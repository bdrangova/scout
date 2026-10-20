import type { AgentRunStatus, FileStatus, SessionStatus, Verdict } from '@review-dash/shared'
import {
  ArchiveIcon,
  ChevronDownIcon,
  ClockIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  SettingsIcon,
  TrashIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FileTypeDot } from '@/components/ui/file-type-dot'
import { Input } from '@/components/ui/input'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Notice } from '@/components/ui/notice'
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Pill, Segmented, SegmentedItem } from '@/components/ui/segmented'
import { StatusDot } from '@/components/ui/status-dot'
import { Tag } from '@/components/ui/tag'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FILE_TYPES, fileTypeClass } from '@/lib/file-type'
import { StatusPill } from '@/components/session/StatusPill'
import { STATUS_TONE, TONE_TEXT_CLASS } from '@/lib/status-tone'
import { VERDICT_STYLE, type VerdictKind } from '@/lib/verdict'
import { ThemeToggle } from '@/theme/ThemeToggle'

const SESSION_STATUSES: SessionStatus[] = ['unreviewed', 'in-progress', 'ready', 'sent', 'updated', 'approved', 'agent-working', 'run-failed']
const FILE_STATUSES: FileStatus[] = ['added', 'modified', 'deleted', 'renamed', 'copied', 'typechange']
const RUN_STATUSES: AgentRunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled']
const VERDICTS: VerdictKind[] = ['approved', 'rejected', 'commented', 'none']
const TAG_TONES = ['neutral', 'info', 'warn', 'ok', 'err', 'yellow', 'mint', 'coral', 'blue', 'pink', 'sunken'] as const
const NOTICE_TONES = ['info', 'warn', 'ok', 'err'] as const
const SWATCHES = ['paper', 'paper-2', 'surface', 'sunken', 'ink', 'ink-muted', 'yellow', 'blue', 'pink', 'cyan', 'coral', 'red', 'green', 'mint', 'hdr'] as const
const SWATCH_CLASS: Record<(typeof SWATCHES)[number], string> = {
  paper: 'bg-paper', 'paper-2': 'bg-paper-2', surface: 'bg-surface', sunken: 'bg-sunken', ink: 'bg-ink', 'ink-muted': 'bg-ink-muted',
  yellow: 'bg-yellow', blue: 'bg-blue', pink: 'bg-pink', cyan: 'bg-cyan', coral: 'bg-coral', red: 'bg-red', green: 'bg-green', mint: 'bg-mint', hdr: 'bg-hdr',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-wrap items-center gap-3">{children}</PanelBody>
    </Panel>
  )
}

/** Dev-only gallery of every primitive, tone and token in the current theme. Route: `/__kit`. */
export function KitPage() {
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('deck')
  const [checked, setChecked] = useState<Record<string, boolean>>({ ts: true, react: true, css: false })

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <header className="flex min-h-hdr flex-wrap items-center gap-3 border-b-fine border-line bg-hdr px-5 py-2.5 text-hdr-ink">
          <h1 className="m-0 text-2xl font-bold tracking-[-.01em]">review-dash kit</h1>
          <span className="text-xs font-medium">fine border retro · every primitive, both themes</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto flex max-w-[1130px] flex-col gap-[18px] px-6 pt-7 pb-14">
          <Section title="Tokens">
            {SWATCHES.map((name) => (
              <div key={name} className="flex flex-col items-center gap-1 text-[11px] font-semibold text-ink-muted">
                <span className={`size-9 rounded-md border-fine border-line ${SWATCH_CLASS[name]}`} />
                {name}
              </div>
            ))}
            <div className="flex w-full flex-wrap gap-3 pt-2">
              <span className="font-sans text-sm font-bold">Space Grotesk 700</span>
              <span className="font-sans text-sm">Space Grotesk 400</span>
              <span className="font-mono text-sm">Geist Mono · const x = 1</span>
              <span className="font-mono text-xs"><span className="tk-k">export</span> <span className="tk-f">fn</span>(<span className="tk-p">a</span>: <span className="tk-t">T</span>) = <span className="tk-s">'s'</span> + <span className="tk-n">42</span></span>
            </div>
          </Section>

          <Section title="Buttons">
            <Button>Default</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="approve">Approve</Button>
            <Button variant="reject">Reject</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="sm" variant="primary">
              <SendIcon /> Send
            </Button>
            <Button size="icon" aria-label="Settings" title="Settings">
              <SettingsIcon />
            </Button>
            <Button size="icon-sm" aria-label="Archive" title="Archive">
              <ArchiveIcon />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete" title="Delete">
              <TrashIcon />
            </Button>
          </Section>

          <Section title="Segmented + Pills">
            <Segmented aria-label="View">
              {['deck', 'grid', 'scroll'].map((v) => (
                <SegmentedItem key={v} pressed={view === v} onClick={() => setView(v)}>
                  {v}
                </SegmentedItem>
              ))}
            </Segmented>
            <Segmented aria-label="Filter by status" variant="pills">
              <SegmentedItem pressed={filter === 'all'} count={2} onClick={() => setFilter('all')} aria-label="All" title="All">
                <ListIcon />
              </SegmentedItem>
              <SegmentedItem pressed={filter === 'awaiting'} count={1} onClick={() => setFilter('awaiting')}>
                <ClockIcon /> Awaiting
              </SegmentedItem>
              <SegmentedItem pressed={filter === 'sent'} count={0} onClick={() => setFilter('sent')}>
                <SendIcon /> Changes sent
              </SegmentedItem>
            </Segmented>
            <Pill pressed={false} count={0}>
              <ArchiveIcon /> Archived
            </Pill>
          </Section>

          <Section title="Notices">
            {NOTICE_TONES.map((tone) => (
              <Notice key={tone} tone={tone}>
                {tone} notice
              </Notice>
            ))}
            <Notice tone="warn" icon={<RefreshCwIcon />}>
              Updated · 2 open comments
            </Notice>
            <Notice tone="info" className="pr-1" aria-label="Awaiting review" title="Awaiting review" />
          </Section>

          <Section title="Tags">
            {TAG_TONES.map((tone) => (
              <Tag key={tone} tone={tone}>
                {tone}
              </Tag>
            ))}
            <Tag mono>origin/master</Tag>
            <Tag pill tone="info">
              pill
            </Tag>
            <Tag size="sm" tone="yellow">
              sm
            </Tag>
            <Tag tone="mint" icon aria-label="Added" title="Added">
              <PlusIcon />
            </Tag>
            <Badge>12</Badge>
            <Badge variant="ink">3</Badge>
            <Badge variant="neutral">0</Badge>
            <Badge variant="yellow">7</Badge>
            <Badge variant="coral">2</Badge>
          </Section>

          <Section title="Session states (both themes)">
            {(['light', 'dark'] as const).map((theme) => (
              <div key={theme} className={`${theme === 'dark' ? 'dark ' : ''}flex w-full flex-wrap items-center gap-3 rounded-xl border-fine border-line bg-paper p-3 text-ink`}>
                <span className="w-12 text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase">{theme}</span>
                {SESSION_STATUSES.map((status) => (
                  <StatusPill key={status} showWord summary={{ status, progress: { reviewed: 3, total: 3 }, openComments: 0, lastSend: status === 'agent-working' || status === 'run-failed' ? { at: '2026-10-01T10:00:00.000Z', decision: 'request-changes' } : null }} />
                ))}
              </div>
            ))}
          </Section>

          <Section title="Status tones">
            <div className="grid w-full grid-cols-3 gap-4 text-[13px]">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <li className="text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase">File</li>
                {FILE_STATUSES.map((s) => {
                  const spec = STATUS_TONE.file(s)
                  return (
                    <li key={s} className="flex items-center gap-2">
                      <StatusDot tone={spec.tone} label={spec.label} /> {spec.label}
                    </li>
                  )
                })}
              </ul>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <li className="text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase">Run</li>
                {RUN_STATUSES.map((s) => {
                  const spec = STATUS_TONE.run(s)
                  return (
                    <li key={s} className={`flex items-center gap-2 ${TONE_TEXT_CLASS[spec.tone]}`}>
                      <StatusDot tone={spec.tone} pulse={spec.pulse} label={spec.label} /> {spec.label}
                    </li>
                  )
                })}
              </ul>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <li className="text-[11px] font-bold tracking-[.08em] text-ink-muted uppercase">Verdict</li>
                {VERDICTS.map((v) => {
                  const style = VERDICT_STYLE[v]
                  const Icon = style.icon
                  return (
                    <li key={v} className={`flex items-center gap-2 ${style.className}`}>
                      <Icon className="size-4" /> {style.label}
                      <Tag className={style.tagClassName}>{style.label}</Tag>
                    </li>
                  )
                })}
                <li className="text-ink-muted">stored verdicts: {(['none', 'approved', 'rejected'] satisfies Verdict[]).join(', ')}</li>
              </ul>
            </div>
          </Section>

          <Section title="File types">
            {FILE_TYPES.map((type) => (
              <div key={type.id} className={`${fileTypeClass(type.id)} flex items-center gap-2 rounded-md border-fine border-fill-line bg-ft px-3 py-1.5 text-[13px] font-bold text-hdr-ink`}>
                <FileTypeDot type={type.id} /> {type.label}
                <span className="font-mono text-[11px] font-medium">{type.exts.join(' ') || '*'}</span>
              </div>
            ))}
          </Section>

          <Section title="Progress, Kbd, Tooltip">
            <Progress value={1} max={12} aria-label="Review progress">
              <ProgressLabel>Reviewed</ProgressLabel>
              <ProgressValue>{() => '1 / 12'}</ProgressValue>
            </Progress>
            <Progress value={12} max={12} aria-label="Done" />
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>
            <Kbd>J</Kbd>
            <Tooltip>
              <TooltipTrigger render={<Button size="sm" />}>Hover me</TooltipTrigger>
              <TooltipContent>
                Next file <Kbd>J</Kbd>
              </TooltipContent>
            </Tooltip>
          </Section>

          <Section title="Fields, Menu, Dialog">
            <Input placeholder="Filter files…" className="max-w-60" aria-label="Filter files" />
            <Textarea placeholder="Leave a comment…" className="max-w-md" aria-label="Comment" />
            <Menu>
              <MenuTrigger render={<Button size="sm" />}>
                File types <ChevronDownIcon />
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Show</MenuLabel>
                {['ts', 'react', 'css'].map((id) => (
                  <MenuCheckboxItem key={id} checked={checked[id] ?? false} onCheckedChange={(on) => setChecked((c) => ({ ...c, [id]: on }))}>
                    {id}
                  </MenuCheckboxItem>
                ))}
                <MenuSeparator />
                <MenuItem>Reset</MenuItem>
              </MenuContent>
            </Menu>
            <Dialog>
              <DialogTrigger render={<Button size="sm" variant="reject" />}>Open dialog</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Discard review?</DialogTitle>
                  <DialogDescription>Your verdicts and comments on this session will be removed.</DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton>
                  <Button variant="reject">Discard</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Section>

          <div className="grid grid-cols-2 gap-5">
            <Panel>
              <PanelHeader>
                <PanelTitle>Panel</PanelTitle>
                <Badge className="ml-auto">4</Badge>
              </PanelHeader>
              <PanelBody>Line and radius only: cards are flat.</PanelBody>
              <PanelFooter className="flex justify-end gap-2">
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
                <Button size="sm" variant="primary">
                  Save
                </Button>
              </PanelFooter>
            </Panel>
            <Panel className="ft-react">
              <PanelHeader className="bg-ft text-ch-ink">
                <PanelTitle className="font-mono">TrialBar.tsx</PanelTitle>
                <Tag tone="mint" icon aria-label="Added" title="Added">
                  <PlusIcon />
                </Tag>
              </PanelHeader>
              <PanelBody>A file-type header: the review card.</PanelBody>
            </Panel>
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
