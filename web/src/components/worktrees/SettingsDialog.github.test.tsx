import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { json, stubApi } from '@/test/worktree-api'
import { SettingsDialog } from './SettingsDialog'

const STORED = {
  worktreeFolders: ['/Users/me/worktrees'],
  github: { repos: ['acme/app'], teams: [{ id: 'backend', name: 'Backend', githubTeams: ['acme/backend'], members: ['octocat'] }] },
}

function setup(settings = STORED) {
  const puts: unknown[] = []
  stubApi({
    'GET /api/settings': () => json(200, settings),
    'PUT /api/settings': (init) => {
      const body: unknown = JSON.parse(String(init?.body))
      puts.push(body)
      return json(200, body)
    },
  })
  const onSaved = vi.fn()
  render(<SettingsDialog open onOpenChange={() => {}} section="github" onSaved={onSaved} />)
  return { puts, onSaved, user: userEvent.setup() }
}

describe('SettingsDialog GitHub section', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('edits repos and teams and saves them together with the worktree folders', async () => {
    const { puts, onSaved, user } = setup()
    const repos = await screen.findByRole('region', { name: 'Followed repositories' })
    expect(within(repos).getByText('acme/app')).toBeInTheDocument()

    await user.type(within(repos).getByRole('textbox', { name: 'New repository' }), 'https://github.com/octo/hello.git{Enter}')
    await user.type(within(repos).getByRole('textbox', { name: 'New repository' }), 'not a repo{Enter}')
    expect(within(repos).getByRole('alert')).toHaveTextContent('Use owner/name')
    await user.click(within(repos).getByRole('button', { name: 'Remove acme/app' }))

    const teams = screen.getByRole('region', { name: 'Teams' })
    expect(teams).toHaveTextContent('A PR shows under a team when one of its GitHub teams or any of its people is asked to review.')
    await user.type(within(teams).getByRole('textbox', { name: 'New team name' }), 'Web Team{Enter}')
    await user.type(within(teams).getByRole('textbox', { name: 'New team name' }), 'Web team{Enter}')
    const lists = within(teams).getAllByRole('list', { name: 'Review teams' })
    const webTeam = within(lists[0]!).getAllByRole('listitem').filter((item) => within(item).queryByDisplayValue('Web Team'))[0]!
    await user.type(within(webTeam).getByRole('textbox', { name: 'New GitHub team' }), 'acme/web{Enter}')
    await user.type(within(webTeam).getByRole('textbox', { name: 'New person' }), '@hubot{Enter}')
    await user.clear(within(webTeam).getByRole('textbox', { name: 'Team name' }))
    await user.type(within(webTeam).getByRole('textbox', { name: 'Team name' }), 'Frontend')
    await user.click(screen.getByRole('button', { name: 'Remove team Backend' }))

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(puts).toEqual([
      {
        worktreeFolders: ['/Users/me/worktrees'],
        github: {
          repos: ['octo/hello'],
          teams: [
            { id: 'web-team', name: 'Frontend', githubTeams: ['acme/web'], members: ['hubot'] },
            { id: 'web-team-2', name: 'Web team', githubTeams: [], members: [] },
          ],
        },
      },
    ])
  })

  it('blocks saving a team without a name', async () => {
    const { user } = setup()
    await user.clear(await screen.findByRole('textbox', { name: 'Team name' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('switches between the Worktrees and GitHub sections', async () => {
    const { user } = setup()
    await screen.findByRole('region', { name: 'Followed repositories' })
    await user.click(screen.getByRole('button', { name: 'Worktrees' }))
    expect(screen.getByRole('region', { name: 'Worktree folders' })).toBeInTheDocument()
  })
})
