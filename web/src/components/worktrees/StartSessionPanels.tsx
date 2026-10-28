import { CopyButton } from '@/components/common/CopyButton'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'

const STARTS: readonly { title: string; command: string }[] = [
  { title: 'Development', command: '/publish-review' },
  { title: 'PR review', command: '/publish-pr-review <PR-URL>' },
  { title: 'Test run', command: '/publish-test-run <run-folder>' },
]

function CopyLine({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code title={value} className="min-w-0 flex-1 truncate rounded-md border-fine border-line bg-code px-2.5 py-1.5 font-mono text-xs text-ink">{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  )
}

/** Three copy-only recipes for starting a session in the worktree; nothing is launched from here. */
export function StartSessionPanels() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
      {STARTS.map((start) => (
        <Panel key={start.title} role="group" aria-label={start.title}>
          <PanelHeader>
            <PanelTitle>{start.title}</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-2.5">
            <p className="m-0 text-[13px] text-ink-muted">Open a new Claude Code session in the folder above, then run:</p>
            <CopyLine value={start.command} label="command" />
          </PanelBody>
        </Panel>
      ))}
    </div>
  )
}
