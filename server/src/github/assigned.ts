import { z } from 'zod'
import type { AssignedPr, AssignedPrsProblem, AssignedPrsResponse, GithubSettings, PrReviewState } from '@scout/shared'
import { HttpError, errorMessage } from '../errors.ts'
import { GhCommandError, classifyGhFailure } from './gh.ts'
import type { GhRunner } from './gh.ts'
import { prKey } from './pr-url.ts'

export const ASSIGNED_CACHE_MS = 60_000

const LIST_FIELDS = 'number,title,url,author,isDraft,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,changedFiles,reviewRequests,latestReviews'

/** `reviewRequests` entries: `{__typename:'User', login}` or `{__typename:'Team', name, slug}`; gh gives the team slug as `org/slug` already. */
const GhPrSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  author: z.object({ login: z.string().optional() }).nullable().optional(),
  isDraft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  headRefName: z.string(),
  baseRefName: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  reviewRequests: z.array(z.object({ __typename: z.string().optional(), login: z.string().optional(), slug: z.string().optional() })),
  latestReviews: z.array(z.object({ author: z.object({ login: z.string() }).nullable().optional(), state: z.string(), submittedAt: z.string().nullable().optional() })).optional(),
})

export type BasePr = Omit<AssignedPr, 'session' | 'status'>

/** The GitHub part of the PR reviews page: everything but "Other", which the route adds from local data. */
export type AssignedGroups = Omit<AssignedPrsResponse, 'other'>

/** A PR's session and status from what Scout knows (sessions, marks) and its reviews; looked up fresh on every request. */
export type SessionLookup = (pr: Pick<BasePr, 'url' | 'reviews'>, viewer: string | null) => Pick<AssignedPr, 'session' | 'status'>

function toBasePr(repo: string, raw: z.infer<typeof GhPrSchema>): BasePr {
  const org = repo.split('/')[0] as string
  const users: string[] = []
  const teams: string[] = []
  for (const request of raw.reviewRequests) {
    if (request.login !== undefined) users.push(request.login)
    else if (request.slug !== undefined) teams.push(request.slug.includes('/') ? request.slug : `${org}/${request.slug}`)
  }
  return {
    url: raw.url,
    repo,
    number: raw.number,
    title: raw.title,
    // GitHub reports a deleted account (ghost) as no author.
    author: raw.author?.login ?? 'ghost',
    isDraft: raw.isDraft,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    headRef: raw.headRefName,
    baseRef: raw.baseRefName,
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    requested: { users, teams },
    reviews: (raw.latestReviews ?? [])
      .filter((review) => review.author?.login !== undefined && !isBot(review.author.login) && REVIEW_STATES[review.state] !== undefined)
      .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
      .map((review) => ({ login: review.author?.login as string, state: REVIEW_STATES[review.state] as PrReviewState, submittedAt: review.submittedAt ?? null })),
  }
}

/** `viewer`'s latest submitted review on the PR, if any. */
export function viewerReview(pr: Pick<BasePr, 'reviews'>, viewer: string | null): BasePr['reviews'][number] | null {
  if (viewer === null) return null
  return pr.reviews.findLast((review) => review.login.toLowerCase() === viewer.toLowerCase()) ?? null
}

/** `[bot]` accounts and Copilot's reviewer: their reviews aren't a person's verdict. */
function isBot(login: string): boolean {
  return login.endsWith('[bot]') || login.startsWith('copilot-')
}

/** GitHub's review states; a PENDING (unsubmitted draft) review is left out. */
const REVIEW_STATES: Record<string, PrReviewState | undefined> = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes-requested', COMMENTED: 'commented', DISMISSED: 'dismissed' }

const lower = (values: readonly string[]): Set<string> => new Set(values.map((v) => v.toLowerCase()))

/** Requested from one of the teams or people, or already reviewed by one of the people (GitHub drops the request once they review). */
function requestedBy(pr: BasePr, githubTeams: readonly string[], members: readonly string[]): boolean {
  const wantedTeams = lower(githubTeams)
  const wantedUsers = lower(members)
  return (
    pr.requested.teams.some((t) => wantedTeams.has(t.toLowerCase())) ||
    pr.requested.users.some((u) => wantedUsers.has(u.toLowerCase())) ||
    pr.reviews.some((review) => wantedUsers.has(review.login.toLowerCase()))
  )
}

/** Pure grouping: `authored` (yours, kept out of the rest), `assignedToMe` and one entry per configured team, newest update first. Exported for tests. */
export function groupAssigned(prs: readonly BasePr[], viewer: string | null, settings: GithubSettings): { authored: BasePr[]; assignedToMe: BasePr[]; teams: { id: string; name: string; prs: BasePr[] }[] } {
  const all = [...prs].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const yours = (pr: BasePr) => viewer !== null && pr.author.toLowerCase() === viewer.toLowerCase()
  const sorted = all.filter((pr) => !yours(pr))
  return {
    authored: all.filter(yours),
    assignedToMe: viewer === null ? [] : sorted.filter((pr) => requestedBy(pr, [], [viewer])),
    teams: settings.teams.map((team) => ({ id: team.id, name: team.name, prs: sorted.filter((pr) => requestedBy(pr, team.githubTeams, team.members)) })),
  }
}

interface Cached {
  key: string
  at: number
  value: Omit<AssignedPrsResponse, 'other' | 'authored' | 'assignedToMe' | 'teams'> & { authored: BasePr[]; assignedToMe: BasePr[]; teams: { id: string; name: string; prs: BasePr[] }[] }
}

/** The assigned-PR list: `gh` calls, a 60 s cache of the whole answer, and a cached viewer login. */
export class AssignedPrs {
  private viewer: string | null = null
  private cached: Cached | null = null

  constructor(
    private readonly gh: GhRunner,
    private readonly now: () => number = Date.now,
  ) {}

  /** The signed-in login; throws `GhCommandError` when gh is missing or signed out. */
  async viewerLogin(): Promise<string> {
    if (this.viewer !== null) return this.viewer
    const login = (await this.gh(['api', 'user', '--jq', '.login'], process.cwd())).trim()
    if (login === '') throw new GhCommandError('gh api user returned no login', { stderr: '', missing: false })
    this.viewer = login
    return login
  }

  /** The cached PRs without sessions (null when nothing is cached for these settings), for reading reviews without a `gh` call. */
  cachedPrs(settings: GithubSettings): BasePr[] | null {
    if (this.cached === null || this.cached.key !== JSON.stringify(settings)) return null
    return [...this.cached.value.authored, ...this.cached.value.assignedToMe, ...this.cached.value.teams.flatMap((team) => team.prs)]
  }

  async get(settings: GithubSettings, refresh: boolean, sessionFor: SessionLookup): Promise<AssignedGroups> {
    const key = JSON.stringify(settings)
    if (!refresh && this.cached !== null && this.cached.key === key && this.now() - this.cached.at < ASSIGNED_CACHE_MS) {
      return this.withSessions(this.cached.value, sessionFor)
    }
    const value = await this.build(settings)
    // A problem is cheap to recompute and fixable at once (sign in, add a repo): never cache it.
    this.cached = value.problem === null ? { key, at: this.now(), value } : null
    return this.withSessions(value, sessionFor)
  }

  private withSessions(value: Cached['value'], sessionFor: SessionLookup): AssignedGroups {
    const attach = (pr: BasePr): AssignedPr => ({ ...pr, ...sessionFor(pr, value.viewer) })
    return { ...value, authored: value.authored.map(attach), assignedToMe: value.assignedToMe.map(attach), teams: value.teams.map((team) => ({ ...team, prs: team.prs.map(attach) })) }
  }

  private async build(settings: GithubSettings): Promise<Cached['value']> {
    const fetchedAt = new Date(this.now()).toISOString()
    const empty = (problem: AssignedPrsProblem, viewer: string | null): Cached['value'] => ({
      viewer,
      fetchedAt,
      problem,
      authored: [],
      assignedToMe: [],
      teams: settings.teams.map((team) => ({ id: team.id, name: team.name, prs: [] })),
      errors: [],
    })
    if (settings.repos.length === 0) return empty('no-repos', null)
    let viewer: string
    try {
      viewer = await this.viewerLogin()
    } catch (err) {
      const failure = classifyGhFailure(err)
      if (failure === 'gh-missing' || failure === 'not-authenticated') return empty(failure, null)
      throw new HttpError(502, 'could not ask GitHub who you are', errorMessage(err))
    }
    const settled = await Promise.all(settings.repos.map((repo) => this.listRepo(repo)))
    const prs: BasePr[] = []
    const errors: AssignedPrsResponse['errors'] = []
    const seen = new Set<string>()
    for (const result of settled) {
      if (!result.ok) {
        errors.push({ repo: result.repo, error: result.error })
        continue
      }
      for (const pr of result.prs) {
        const id = prKey(pr.url) ?? pr.url
        if (!seen.has(id)) {
          seen.add(id)
          prs.push(pr)
        }
      }
    }
    return { viewer, fetchedAt, problem: null, ...groupAssigned(prs, viewer, settings), errors }
  }

  private async listRepo(repo: string): Promise<{ ok: true; prs: BasePr[] } | { ok: false; repo: string; error: string }> {
    try {
      const out = await this.gh(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', LIST_FIELDS], process.cwd())
      const raw = z.array(GhPrSchema).parse(JSON.parse(out))
      return { ok: true, prs: raw.map((pr) => toBasePr(repo, pr)) }
    } catch (err) {
      const message = err instanceof GhCommandError ? err.stderr.trim() || err.message : errorMessage(err)
      return { ok: false, repo, error: message }
    }
  }
}
