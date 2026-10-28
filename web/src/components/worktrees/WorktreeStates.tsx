import { ScoutMascot } from '@/components/brand/Scout'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'

/** No folders are configured: points to Settings. */
export function NoFoldersState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <Panel className="items-center gap-2 border-dashed px-6 py-14 text-center">
      <ScoutMascot />
      <p className="m-0 text-base font-bold">No worktree folders</p>
      <p className="m-0 text-[13px] text-ink-muted">Tell Scout which folders hold your git worktrees.</p>
      <Button variant="primary" onClick={onOpenSettings} className="mt-2">Add folders in Settings</Button>
    </Panel>
  )
}

/** Folders are configured but no worktree was found in them. */
export function NoWorktreesState({ folders }: { folders: readonly string[] }) {
  return (
    <Panel className="items-center gap-2 border-dashed px-6 py-14 text-center">
      <ScoutMascot />
      <p className="m-0 text-base font-bold">No worktrees</p>
      <p className="m-0 text-[13px] text-ink-muted">
        Scout found no git worktrees in{' '}
        {folders.map((folder, index) => (
          <span key={folder}>
            {index > 0 && ', '}
            <code className="rounded-sm border-fine border-line bg-code px-1.5 py-0.5 font-mono text-xs text-ink">{folder}</code>
          </span>
        ))}
        .
      </p>
    </Panel>
  )
}
