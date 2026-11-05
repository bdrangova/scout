import { z } from 'zod'
import { SESSION_ID_RE } from '../constants.ts'
import { PrReviewStateSchema } from './pr-comments.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()

/** `owner/name`, as GitHub writes it. */
export const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
/** `org/team-slug`. */
export const GITHUB_TEAM_RE = GITHUB_REPO_RE

/**
 * A reviewing team. A PR counts as assigned to it when one of `githubTeams` is a requested reviewer,
 * or when any of `members` is (logins compared case-insensitively).
 */
export const GithubTeamSchema = z.object({
  /** Stable key: lowercase letters, digits and hyphens, unique within `teams`. */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  githubTeams: z.array(z.string().regex(GITHUB_TEAM_RE)).default([]),
  /** GitHub logins without the `@`. */
  members: z.array(z.string().min(1)).default([]),
})
export type GithubTeam = z.infer<typeof GithubTeamSchema>

/** `config.json` → `github`: the repos Scout follows for assigned PRs, and the teams to group them by. */
export const GithubSettingsSchema = z.object({
  repos: z.array(z.string().regex(GITHUB_REPO_RE)).default([]),
  teams: z.array(GithubTeamSchema).default([]),
})
export type GithubSettings = z.infer<typeof GithubSettingsSchema>

/** Where a PR review session stands: you set it from Scout, or Scout picks it up from your latest review on GitHub. */
export const PR_REVIEW_STATUSES = ['in-progress', 'commented', 'approved'] as const
export const PrReviewStatusSchema = z.enum(PR_REVIEW_STATUSES)
export type PrReviewStatus = z.infer<typeof PrReviewStatusSchema>

/**
 * `review/pr-status.json` (`PR_STATUS_FILE`) of a PR review session. `by: 'github'` was picked up from your latest review
 * (`setAt` is that review's time); a later review of yours replaces an older status, whoever set it. No file: in progress.
 */
export const PrReviewStatusFileSchema = z.object({ status: PrReviewStatusSchema, setAt: isoDate, by: z.enum(['you', 'github']) })
export type PrReviewStatusFile = z.infer<typeof PrReviewStatusFileSchema>

/** `PUT /sessions/:id/pr-status` body. Approved closes the session (archives it). */
export const SetPrReviewStatusRequestSchema = z.object({ status: PrReviewStatusSchema })
export type SetPrReviewStatusRequest = z.infer<typeof SetPrReviewStatusRequestSchema>

/**
 * A PR's status on the Assigned PRs tab. Open: `pending` (no review yet), `in-progress`, `commented`, `approved`
 * (it stays until merged, when it leaves the list). Closed: `done` (an older mark), `ignored` and `archived` (its review session was archived).
 */
export const PR_STATUSES = ['pending', 'in-progress', 'commented', 'approved', 'done', 'ignored', 'archived'] as const
export const PrStatusSchema = z.enum(PR_STATUSES)
export type PrStatus = z.infer<typeof PrStatusSchema>
export const CLOSED_PR_STATUSES: readonly PrStatus[] = ['done', 'ignored', 'archived']

/** An open PR in a followed repo, as Scout lists it. Computed live from `gh`, never stored. */
export const AssignedPrSchema = z.object({
  url: z.string().min(1),
  /** `owner/name` */
  repo: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  author: z.string(),
  isDraft: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
  headRef: z.string(),
  baseRef: z.string(),
  additions: nonNegativeInt,
  deletions: nonNegativeInt,
  changedFiles: nonNegativeInt,
  /** Pending review requests: user logins and `org/team-slug`s (GitHub drops a request once that person or team reviews). */
  requested: z.object({ users: z.array(z.string()), teams: z.array(z.string()) }),
  /** Each person's latest submitted review (bots and pending drafts left out), oldest first. */
  reviews: z.array(z.object({ login: z.string(), state: PrReviewStateSchema, submittedAt: isoDate.nullable() })),
  /**
   * Ignored (a mark in `<home>/github-done.json`) wins; then Approved (anyone's latest review approves it, or its session's
   * status says so), Done (a mark, or a review archived as Done), its live session's status (or Commented from your latest review), Archived (its newest session
   * is archived), else Pending. A reopen sets aside approvals given before it.
   */
  status: PrStatusSchema,
  /**
   * Scout's session for this PR: a live PR review (`/s/:id`), a not-started placeholder (`/pr/p/:id`), or an archived review
   * (restore it to open it again); null when none. A live session wins over a placeholder, which wins over an archived one.
   */
  session: z.object({ id: z.string().regex(SESSION_ID_RE), state: z.enum(['live', 'pending', 'archived']) }).nullable(),
})
export type AssignedPr = z.infer<typeof AssignedPrSchema>

/**
 * A row of "My PRs": a PR review session or placeholder you started that no other section covers (no PR, a repo Scout doesn't
 * follow, or a PR no longer open or assigned). `pr` is null for a review without a PR.
 */
export const LocalPrReviewSchema = z.object({
  session: z.object({ id: z.string().regex(SESSION_ID_RE), state: z.enum(['live', 'pending', 'archived']) }),
  title: z.string(),
  pr: z.object({ url: z.string().min(1), repo: z.string(), number: z.number().int().positive() }).nullable(),
  status: PrStatusSchema,
  updatedAt: isoDate,
})
export type LocalPrReview = z.infer<typeof LocalPrReviewSchema>

/** Why the assigned list could not be built at all. Per-repo failures go to `errors` instead. */
export const ASSIGNED_PRS_PROBLEMS = ['gh-missing', 'not-authenticated', 'no-repos'] as const
export type AssignedPrsProblem = (typeof ASSIGNED_PRS_PROBLEMS)[number]

/**
 * `GET /github/assigned[?refresh=1]`, the whole PR reviews page. `authored` ("My PRs"): open PRs you wrote. `other` ("Other"): your review
 * sessions no other section covers, built from local data even when GitHub can't be asked (`problem`). `assignedToMe`: PRs requesting or reviewed by the signed-in
 * user. `teams`: one entry per configured team, in settings order, even when `prs` is empty. Newest first. Drafts are included.
 * GitHub's answer is served from a short cache unless `refresh=1`.
 */
export const AssignedPrsResponseSchema = z.object({
  viewer: z.string().nullable(),
  fetchedAt: isoDate,
  problem: z.enum(ASSIGNED_PRS_PROBLEMS).nullable(),
  other: z.array(LocalPrReviewSchema),
  /** Open PRs you wrote in followed repos: the "My PRs" section, never in `assignedToMe` or a team. */
  authored: z.array(AssignedPrSchema),
  assignedToMe: z.array(AssignedPrSchema),
  teams: z.array(z.object({ id: z.string(), name: z.string(), prs: z.array(AssignedPrSchema) })),
  errors: z.array(z.object({ repo: z.string(), error: z.string() })),
})
export type AssignedPrsResponse = z.infer<typeof AssignedPrsResponseSchema>

/**
 * A not-started PR review, `<home>/pr-pending/<id>.json` (`PR_PENDING_DIR`). Created from the Assigned PRs tab;
 * `scout init --kind pr-review --pr <url>` claims it: the new session takes this `id` and the file is removed.
 */
export const PendingPrReviewSchema = z.object({
  id: z.string().regex(SESSION_ID_RE),
  createdAt: isoDate,
  pr: z.object({
    url: z.string().min(1),
    repo: z.string().min(1),
    number: z.number().int().positive(),
    title: z.string(),
    author: z.string(),
    isDraft: z.boolean(),
    headRef: z.string(),
    baseRef: z.string(),
  }),
})
export type PendingPrReview = z.infer<typeof PendingPrReviewSchema>

/** `GET /pr-pending/:id`: the placeholder plus local checkouts of its repo (worktrees and their main checkouts whose origin is the PR's repo). */
export const PendingPrReviewDetailSchema = PendingPrReviewSchema.extend({
  checkouts: z.array(z.string()),
})
export type PendingPrReviewDetail = z.infer<typeof PendingPrReviewDetailSchema>

/** `POST /pr-pending` body. */
export const CreatePendingPrReviewRequestSchema = z.object({ url: z.string().min(1) })
export type CreatePendingPrReviewRequest = z.infer<typeof CreatePendingPrReviewRequestSchema>

/** `POST /pr-pending` result: the new or existing placeholder, or the live session that already reviews this PR. */
export const CreatePendingPrReviewResponseSchema = z.object({ id: z.string().regex(SESSION_ID_RE), state: z.enum(['live', 'pending']) })
export type CreatePendingPrReviewResponse = z.infer<typeof CreatePendingPrReviewResponseSchema>

/** `<home>/github-done.json` (`GITHUB_DONE_FILE`): PRs marked Done (`prs`) or Ignored (`ignored`) from the Assigned PRs tab, keyed by URL; `undone` were reopened after your approval closed them. */
export const GithubDoneSchema = z.object({
  prs: z.array(z.object({ url: z.string().min(1), doneAt: isoDate })),
  ignored: z.array(z.object({ url: z.string().min(1), doneAt: isoDate })).default([]),
  /** Reopened by hand after your approval closed them: that approval no longer counts. */
  undone: z.array(z.object({ url: z.string().min(1), doneAt: isoDate })).default([]),
})
export type GithubDone = z.infer<typeof GithubDoneSchema>

/** `PUT /github/done`, `PUT /github/ignored` and `POST /github/reopen` body. Done also archives a live review session as Done and removes a not-started one; reopen undoes whatever closed the PR. */
export const GithubDoneRequestSchema = z.object({ url: z.string().min(1) })
export type GithubDoneRequest = z.infer<typeof GithubDoneRequestSchema>
