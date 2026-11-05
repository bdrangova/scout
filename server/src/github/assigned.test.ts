import { describe, expect, it } from 'vitest'
import type { GithubSettings } from '@scout/shared'
import { ASSIGNED_CACHE_MS, AssignedPrs, viewerReview } from './assigned.ts'
import type { BasePr } from './assigned.ts'
import { GhCommandError } from './gh.ts'
import type { GhRunner } from './gh.ts'

const NO_SESSION = { session: null, status: 'pending' } as const

type Request = { __typename: string; login?: string; name?: string; slug?: string }
type Review = { author: { login: string } | null; state: string; submittedAt: string | null }

function ghPr(number: number, requests: Request[], updatedAt = '2026-10-01T10:00:00Z', latestReviews?: Review[]) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/web/pull/${number}`,
    author: { login: 'dev' },
    isDraft: false,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt,
    headRefName: `feat-${number}`,
    baseRefName: 'main',
    additions: 1,
    deletions: 2,
    changedFiles: 3,
    reviewRequests: requests,
    ...(latestReviews && { latestReviews }),
  }
}

const settings: GithubSettings = {
  repos: ['acme/web', 'acme/api'],
  teams: [
    { id: 'core', name: 'Core', githubTeams: ['acme/Core-Team'], members: ['Carol'] },
    { id: 'empty', name: 'Empty', githubTeams: [], members: [] },
  ],
}

function fakeGh(handlers: { viewer?: () => string; lists?: Record<string, () => unknown> }) {
  const calls: string[][] = []
  const gh: GhRunner = async (args) => {
    calls.push([...args])
    if (args[0] === 'api') return `${handlers.viewer?.() ?? 'Me'}\n`
    const repo = args[args.indexOf('--repo') + 1] as string
    const list = handlers.lists?.[repo]
    if (!list) throw new GhCommandError('no', { stderr: 'HTTP 404: Not Found', missing: false })
    return JSON.stringify(list())
  }
  return { gh, calls }
}

const none = () => NO_SESSION

describe('AssignedPrs', () => {
  it('groups mine, teams by github team and by member, case-insensitively, newest update first', async () => {
    const { gh } = fakeGh({
      lists: {
        'acme/web': () => [
          ghPr(1, [{ __typename: 'User', login: 'me' }], '2026-10-01T10:00:00Z'),
          ghPr(2, [{ __typename: 'Team', name: 'Core', slug: 'acme/core-team' }], '2026-10-03T10:00:00Z'),
          ghPr(3, [{ __typename: 'User', login: 'CAROL' }], '2026-10-02T10:00:00Z'),
          ghPr(4, [{ __typename: 'Team', name: 'Other', slug: 'other' }]),
          ghPr(5, []),
        ],
        'acme/api': () => [],
      },
    })
    const res = await new AssignedPrs(gh).get(settings, false, none)
    expect(res.viewer).toBe('Me')
    expect(res.problem).toBeNull()
    expect(res.assignedToMe.map((p) => p.number)).toEqual([1])
    expect(res.teams.map((t) => [t.id, t.prs.map((p) => p.number)])).toEqual([
      ['core', [2, 3]],
      ['empty', []],
    ])
    expect(res.teams[0]?.prs[0]?.requested).toEqual({ users: [], teams: ['acme/core-team'] })
    expect(res.errors).toEqual([])
  })

  it('lists the other repos when one fails, and reports the failure', async () => {
    const { gh } = fakeGh({ lists: { 'acme/web': () => [ghPr(1, [{ __typename: 'User', login: 'Me' }])] } })
    const res = await new AssignedPrs(gh).get(settings, false, none)
    expect(res.assignedToMe.map((p) => p.number)).toEqual([1])
    expect(res.errors).toEqual([{ repo: 'acme/api', error: 'HTTP 404: Not Found' }])
  })

  it('reports no-repos without calling gh', async () => {
    const { gh, calls } = fakeGh({})
    const res = await new AssignedPrs(gh).get({ repos: [], teams: settings.teams }, false, none)
    expect(res.problem).toBe('no-repos')
    expect(res.teams.map((t) => t.prs)).toEqual([[], []])
    expect(calls).toEqual([])
  })

  it('reports gh-missing and not-authenticated', async () => {
    const missing = new AssignedPrs(async () => {
      throw new GhCommandError('gh not found', { stderr: '', missing: true })
    })
    expect((await missing.get(settings, false, none)).problem).toBe('gh-missing')
    const signedOut = new AssignedPrs(async () => {
      throw new GhCommandError('failed', { stderr: 'To get started with GitHub CLI, please run:  gh auth login', missing: false })
    })
    expect((await signedOut.get(settings, false, none)).problem).toBe('not-authenticated')
  })

  it('caches the answer for a minute, bypasses it on refresh, and looks sessions up on every request', async () => {
    let clock = 1_000_000
    const { gh, calls } = fakeGh({ lists: { 'acme/web': () => [ghPr(1, [{ __typename: 'User', login: 'Me' }])], 'acme/api': () => [] } })
    const assigned = new AssignedPrs(gh, () => clock)
    const listCalls = () => calls.filter((c) => c[0] === 'pr').length
    let session: { id: string; state: 'live' | 'pending' } | null = null
    const lookup = () => ({ session, status: 'pending' as const })

    expect((await assigned.get(settings, false, lookup)).assignedToMe[0]?.session).toBeNull()
    expect(listCalls()).toBe(2)
    session = { id: '20261001-1000-pr-1-abcd', state: 'pending' }
    expect((await assigned.get(settings, false, lookup)).assignedToMe[0]?.session).toEqual(session)
    expect(listCalls()).toBe(2)
    await assigned.get(settings, true, lookup)
    expect(listCalls()).toBe(4)
    clock += ASSIGNED_CACHE_MS + 1
    await assigned.get(settings, false, lookup)
    expect(listCalls()).toBe(6)
    // The viewer is asked once.
    expect(calls.filter((c) => c[0] === 'api')).toHaveLength(1)
  })

  it('does not reuse the cache after the settings change', async () => {
    const { gh, calls } = fakeGh({ lists: { 'acme/web': () => [], 'acme/api': () => [] } })
    const assigned = new AssignedPrs(gh)
    await assigned.get(settings, false, none)
    await assigned.get({ ...settings, repos: ['acme/web'] }, false, none)
    expect(calls.filter((c) => c[0] === 'pr')).toHaveLength(3)
  })

  it('includes PRs already reviewed by the viewer or a team member, whose request GitHub dropped', async () => {
    const review = (login: string, state: string, submittedAt: string | null): Review => ({ author: { login }, state, submittedAt })
    const { gh } = fakeGh({
      lists: {
        'acme/web': () => [
          ghPr(1, [], '2026-10-01T10:00:00Z', [review('ME', 'APPROVED', '2026-10-01T09:00:00Z')]),
          ghPr(2, [], '2026-10-02T10:00:00Z', [review('carol', 'COMMENTED', '2026-10-02T09:00:00Z')]),
          ghPr(3, [], '2026-10-03T10:00:00Z', [review('stranger', 'APPROVED', '2026-10-03T09:00:00Z')]),
          ghPr(4, [], '2026-10-04T10:00:00Z', [review('Me', 'PENDING', null), review('dependabot[bot]', 'APPROVED', '2026-10-04T09:00:00Z'), review('copilot-pull-request-reviewer', 'COMMENTED', '2026-10-04T09:00:00Z')]),
        ],
        'acme/api': () => [],
      },
    })
    const res = await new AssignedPrs(gh).get(settings, false, none)
    expect(res.assignedToMe.map((p) => p.number)).toEqual([1])
    expect(res.teams[0]?.prs.map((p) => p.number)).toEqual([2])
    // Pending drafts and bot reviews are dropped; the rest keep their time.
    expect(res.assignedToMe[0]?.reviews).toEqual([{ login: 'ME', state: 'approved', submittedAt: '2026-10-01T09:00:00Z' }])
  })

  it('sorts each PR\'s reviews oldest first', async () => {
    const review = (login: string, submittedAt: string): Review => ({ author: { login }, state: 'COMMENTED', submittedAt })
    const { gh } = fakeGh({ lists: { 'acme/web': () => [ghPr(1, [{ __typename: 'User', login: 'Me' }], undefined, [review('b', '2026-10-02T00:00:00Z'), review('a', '2026-10-01T00:00:00Z')])], 'acme/api': () => [] } })
    const res = await new AssignedPrs(gh).get(settings, false, none)
    expect(res.assignedToMe[0]?.reviews.map((r) => r.login)).toEqual(['a', 'b'])
  })

  it('passes the viewer to the lookup and attaches its status', async () => {
    const { gh } = fakeGh({ lists: { 'acme/web': () => [ghPr(1, [{ __typename: 'User', login: 'Me' }])], 'acme/api': () => [] } })
    const seen: (string | null)[] = []
    const res = await new AssignedPrs(gh).get(settings, false, (_pr, viewer) => {
      seen.push(viewer)
      return { session: null, status: 'commented' }
    })
    expect(seen).toEqual(['Me'])
    expect(res.assignedToMe[0]?.status).toBe('commented')
  })

  it('exposes the cached PRs without sessions, only for the same settings', async () => {
    const { gh } = fakeGh({ lists: { 'acme/web': () => [ghPr(1, [{ __typename: 'User', login: 'Me' }]), ghPr(2, [{ __typename: 'User', login: 'Carol' }])], 'acme/api': () => [] } })
    const assigned = new AssignedPrs(gh)
    expect(assigned.cachedPrs(settings)).toBeNull()
    await assigned.get(settings, false, none)
    expect(assigned.cachedPrs(settings)?.map((p) => p.number).sort()).toEqual([1, 2])
    expect(assigned.cachedPrs({ ...settings, repos: ['acme/web'] })).toBeNull()
  })
})

describe('viewerReview', () => {
  const reviews: BasePr['reviews'] = [
    { login: 'Me', state: 'commented', submittedAt: '2026-10-01T00:00:00Z' },
    { login: 'other', state: 'approved', submittedAt: '2026-10-02T00:00:00Z' },
  ]
  it('finds the viewer case-insensitively, and nothing for no viewer or no review', () => {
    expect(viewerReview({ reviews }, 'me')?.state).toBe('commented')
    expect(viewerReview({ reviews }, 'nobody')).toBeNull()
    expect(viewerReview({ reviews }, null)).toBeNull()
  })
})
