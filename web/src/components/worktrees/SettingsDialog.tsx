import type { Settings } from '@scout/shared'
import { FolderOpen, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Eyebrow } from '@/components/common/Eyebrow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { pickFolder, saveSettings, useSettings } from '@/hooks/useSettings'
import { GithubSettingsSection } from './GithubSettings'

const ABSOLUTE_PATH = /^(\/|~(\/|$))/

type SettingsSection = 'worktrees' | 'github'

interface SettingsFormProps {
  initial: Settings
  section: SettingsSection
  onSaved: () => void
}

function SettingsForm({ initial, section: initialSection, onSaved }: SettingsFormProps) {
  const [section, setSection] = useState(initialSection)
  const [folders, setFolders] = useState<readonly string[]>(initial.worktreeFolders)
  const [github, setGithub] = useState(initial.github)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add() {
    const path = draft.trim().replace(/(.)\/+$/, '$1')
    if (path === '') return
    if (!ABSOLUTE_PATH.test(path)) {
      setDraftError('Use an absolute path, like /Users/you/worktrees.')
      return
    }
    if (!folders.includes(path)) setFolders([...folders, path])
    setDraft('')
    setDraftError(null)
  }

  async function browse() {
    setPicking(true)
    setDraftError(null)
    try {
      const { path } = await pickFolder()
      if (path !== null) setFolders((current) => (current.includes(path) ? current : [...current, path]))
    } catch (err) {
      setDraftError(`Couldn't open the folder picker: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPicking(false)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await saveSettings({ worktreeFolders: [...folders], github })
      onSaved()
    } catch (err) {
      setError(`Couldn't save the settings: ${err instanceof Error ? err.message : String(err)}`)
      setSaving(false)
    }
  }

  const blankTeam = github.teams.some((team) => team.name.trim() === '')
  return (
    <>
      <Segmented aria-label="Settings section">
        <SegmentedItem pressed={section === 'worktrees'} onClick={() => setSection('worktrees')}>Worktrees</SegmentedItem>
        <SegmentedItem pressed={section === 'github'} onClick={() => setSection('github')}>GitHub</SegmentedItem>
      </Segmented>
      <div className="max-h-[55vh] overflow-y-auto">
        {section === 'github' ? <GithubSettingsSection value={github} onChange={setGithub} /> : (
        <section aria-label="Worktree folders" className="flex min-w-0 flex-col gap-2.5">
          <Eyebrow as="h3">Worktree folders</Eyebrow>
          <p className="m-0 text-xs text-ink-muted">Scout lists the git worktrees it finds inside these folders. Browse to pick one, or paste a path.</p>
          {folders.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-ink-muted">No folders yet.</p>
          ) : (
            <ul aria-label="Folders" className="m-0 flex list-none flex-col gap-1.5 p-0">
              {folders.map((folder) => (
                <li key={folder} className="flex items-center gap-2 rounded-lg border-fine border-line bg-paper-2 py-1 pr-1 pl-2.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs" title={folder}>{folder}</code>
                  <Button variant="ghost" size="icon-sm" title="Remove folder" aria-label={`Remove ${folder}`} onClick={() => setFolders(folders.filter((candidate) => candidate !== folder))}><X aria-hidden /></Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setDraftError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  add()
                }
              }}
              aria-label="New folder path"
              aria-invalid={draftError !== null}
              placeholder="/Users/you/worktrees"
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={add} disabled={draft.trim() === ''}><Plus aria-hidden />Add</Button>
            <Button size="sm" onClick={() => void browse()} disabled={picking} aria-busy={picking} title="Choose a folder on this computer"><FolderOpen aria-hidden />{picking ? 'Choosing…' : 'Browse…'}</Button>
          </div>
          {draftError !== null && <p role="alert" className="m-0 text-xs font-medium text-red">{draftError}</p>}
        </section>
        )}
      </div>
      {error !== null && <Notice tone="err">{error}</Notice>}
      <DialogFooter>
        <DialogClose disabled={saving} render={<Button />}>Cancel</DialogClose>
        <Button variant="primary" disabled={saving || blankTeam} aria-busy={saving} title={blankTeam ? 'Every team needs a name' : undefined} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </>
  )
}

function LoadedForm({ section, onSaved }: { section: SettingsSection; onSaved: () => void }) {
  const { settings, error, loading } = useSettings()
  if (error) return <><Notice tone="err">{`Couldn't load the settings: ${error.message}`}</Notice><DialogFooter showCloseButton /></>
  if (loading || settings === null) return <p className="m-0 text-[13px] font-medium text-ink-muted" aria-busy="true">Loading settings…</p>
  return <SettingsForm initial={settings} section={section} onSaved={onSaved} />
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The section the dialog opens on (Worktrees by default). */
  section?: SettingsSection
  /** Called after a successful save, when the dialog has closed. */
  onSaved?: () => void
}

/** Scout's settings: the folders it scans for git worktrees, and the GitHub repos and teams of the PR reviews. The form loads fresh each time the dialog opens. */
export function SettingsDialog({ open, onOpenChange, section = 'worktrees', onSaved }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved on this computer, in Scout's own folder.</DialogDescription>
        </DialogHeader>
        <LoadedForm
          section={section}
          onSaved={() => {
            onOpenChange(false)
            onSaved?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
