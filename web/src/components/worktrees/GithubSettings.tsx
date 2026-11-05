import { GITHUB_TEAM_RE, type GithubSettings, type GithubTeam } from '@scout/shared'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Eyebrow } from '@/components/common/Eyebrow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/ui/tag'
import { parseRepoInput, teamIdFromName } from '@/lib/github'

interface ChipsEditorProps {
  label: string
  /** One item, singular: names the input and the add button. */
  noun: string
  items: readonly string[]
  /** The cleaned value of what was typed, or null when it is not valid. */
  parse: (input: string) => string | null
  invalid: string
  placeholder: string
  onChange: (items: string[]) => void
}

/** A removable list of short values with an input to add more; Enter adds. */
function ChipsEditor({ label, noun, items, parse, invalid, placeholder, onChange }: ChipsEditorProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (draft.trim() === '') return
    const value = parse(draft)
    if (value === null) {
      setError(invalid)
      return
    }
    if (!items.some((item) => item.toLowerCase() === value.toLowerCase())) onChange([...items, value])
    setDraft('')
    setError(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      {items.length > 0 && (
        <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {items.map((item) => (
            <li key={item}>
              <Tag mono className="gap-1 pr-0.5">
                {item}
                <button type="button" title={`Remove ${item}`} aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((candidate) => candidate !== item))} className="inline-flex size-4 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-ink-muted hover:bg-hover hover:text-ink"><X aria-hidden /></button>
              </Tag>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          aria-label={`New ${noun}`}
          aria-invalid={error !== null}
          placeholder={placeholder}
          className="font-mono text-xs"
        />
        <Button size="sm" onClick={add} disabled={draft.trim() === ''} aria-label={`Add ${noun}`}><Plus aria-hidden />Add</Button>
      </div>
      {error !== null && <p role="alert" className="m-0 text-xs font-medium text-red">{error}</p>}
    </div>
  )
}

const parseTeamSlug = (input: string) => (GITHUB_TEAM_RE.test(input.trim()) ? input.trim() : null)
const parseLogin = (input: string) => {
  const login = input.trim().replace(/^@/, '')
  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(login) ? login : null
}

function TeamEditor({ team, onChange, onRemove }: { team: GithubTeam; onChange: (team: GithubTeam) => void; onRemove: () => void }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border-fine border-line bg-paper-2 p-3">
      <div className="flex items-center gap-2">
        <Input value={team.name} onChange={(event) => onChange({ ...team, name: event.target.value })} aria-label="Team name" aria-invalid={team.name.trim() === ''} className="font-bold" />
        <Button variant="ghost" size="icon-sm" title="Remove team" aria-label={`Remove team ${team.name}`} onClick={onRemove}><X aria-hidden /></Button>
      </div>
      <ChipsEditor label="GitHub teams" noun="GitHub team" items={team.githubTeams} parse={parseTeamSlug} invalid="Use org/team-slug, like acme/reviewers." placeholder="org/team-slug" onChange={(githubTeams) => onChange({ ...team, githubTeams })} />
      <ChipsEditor label="People" noun="person" items={team.members} parse={parseLogin} invalid="Use a GitHub username, like octocat." placeholder="username" onChange={(members) => onChange({ ...team, members })} />
    </li>
  )
}

interface GithubSettingsSectionProps {
  value: GithubSettings
  onChange: (value: GithubSettings) => void
}

/** Settings → GitHub: the repos Scout follows and the reviewing teams the Assigned PRs tab groups by. */
export function GithubSettingsSection({ value, onChange }: GithubSettingsSectionProps) {
  const [newTeam, setNewTeam] = useState('')
  const addTeam = () => {
    const name = newTeam.trim()
    if (name === '') return
    onChange({ ...value, teams: [...value.teams, { id: teamIdFromName(name, value.teams.map((team) => team.id)), name, githubTeams: [], members: [] }] })
    setNewTeam('')
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Followed repositories" className="flex min-w-0 flex-col gap-2.5">
        <Eyebrow as="h3">Followed repositories</Eyebrow>
        <p className="m-0 text-xs text-ink-muted">Scout lists the open PRs of these repositories. Paste a GitHub link or write owner/name.</p>
        <ChipsEditor label="Repositories" noun="repository" items={value.repos} parse={parseRepoInput} invalid="Use owner/name, like octocat/hello-world." placeholder="owner/name" onChange={(repos) => onChange({ ...value, repos })} />
      </section>
      <section aria-label="Teams" className="flex min-w-0 flex-col gap-2.5">
        <Eyebrow as="h3">Teams</Eyebrow>
        <p className="m-0 text-xs text-ink-muted">A PR shows under a team when one of its GitHub teams or any of its people is asked to review.</p>
        {value.teams.length > 0 && (
          <ul aria-label="Review teams" className="m-0 flex list-none flex-col gap-2.5 p-0">
            {value.teams.map((team) => (
              <TeamEditor key={team.id} team={team} onChange={(next) => onChange({ ...value, teams: value.teams.map((candidate) => (candidate.id === team.id ? next : candidate)) })} onRemove={() => onChange({ ...value, teams: value.teams.filter((candidate) => candidate.id !== team.id) })} />
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Input value={newTeam} onChange={(event) => setNewTeam(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTeam() } }} aria-label="New team name" placeholder="Team name" />
          <Button size="sm" onClick={addTeam} disabled={newTeam.trim() === ''}><Plus aria-hidden />Add team</Button>
        </div>
      </section>
    </div>
  )
}
