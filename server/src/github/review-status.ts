import { z } from 'zod'
import type { PrReviewState, PrReviewStatus, PrReviewStatusFile } from '@scout/shared'
import type { Store } from '../store/index.ts'
import { readPrStatusFile, writePrStatusFile } from '../store/pr-status.ts'
import type { BasePr } from './assigned.ts'
import type { GhRunner } from './gh.ts'
import { prKey } from './pr-url.ts'
import { prUrlOf } from './sessions.ts'

export const REVIEWS_CACHE_MS = 60_000

/** Your review's verdict as a session status; a dismissed review says nothing. */
export function statusOfReview(state: PrReviewState): PrReviewStatus | null {
  if (state === 'approved') return 'approved'
  if (state === 'commented' || state === 'changes-requested') return 'commented'
  return null
}

const GhReviewsSchema = z.object({
  latestReviews: z.array(z.object({ author: z.object({ login: z.string() }).nullable().optional(), state: z.string(), submittedAt: z.string().nullable().optional() })).optional(),
})
const GH_STATES: Record<string, PrReviewState | undefined> = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes-requested', COMMENTED: 'commented', DISMISSED: 'dismissed' }

type ViewerReview = { state: PrReviewState; submittedAt: string } | null

/**
 * Sets a PR review session's status, and closes (archives) it when Approved. Shared by the status menu and the GitHub pickup.
 */
export async function setReviewStatus(store: Store, id: string, file: PrReviewStatusFile, now: Date): Promise<void> {
  await writePrStatusFile(store.paths.sessionDir(id), file)
  if (file.status === 'approved') await store.archiveSession(id, now)
}

/**
 * Picks up your latest review on each live PR review session's PR: a review newer than the session's status replaces it
 * (Commented, or Approved, which closes the session). Reviews come from the assigned list when it has the PR, else from
 * `gh pr view` (cached per PR). A PR GitHub can't answer for is skipped.
 */
export class ReviewStatusSync {
  private cache = new Map<string, { at: number; review: ViewerReview }>()

  constructor(
    private readonly store: Store,
    private readonly gh: GhRunner,
    private readonly now: () => number = Date.now,
  ) {}

  async sync(viewer: string, known: readonly BasePr[]): Promise<void> {
    const knownByKey = new Map(known.flatMap((pr) => {
      const key = prKey(pr.url)
      return key === null ? [] : [[key, pr] as const]
    }))
    for (const id of await this.store.sessionIds()) {
      const loaded = await this.store.readManifest(id)
      if (!loaded.ok || loaded.manifest.kind !== 'pr-review') continue
      const dir = this.store.paths.sessionDir(id)
      const url = await prUrlOf(dir, id, loaded.manifest)
      const key = prKey(url ?? '')
      if (url === undefined || key === null) continue
      const pr = knownByKey.get(key)
      const review = pr ? fromReviews(pr.reviews, viewer) : await this.fetchReview(url, viewer)
      const detected = review && statusOfReview(review.state)
      if (!review || !detected) continue
      const current = await readPrStatusFile(dir)
      if (current !== null && Date.parse(current.setAt) >= Date.parse(review.submittedAt)) continue
      await setReviewStatus(this.store, id, { status: detected, setAt: review.submittedAt, by: 'github' }, new Date(this.now()))
    }
  }

  private async fetchReview(url: string, viewer: string): Promise<ViewerReview> {
    const cached = this.cache.get(url)
    if (cached && this.now() - cached.at < REVIEWS_CACHE_MS) return cached.review
    let review: ViewerReview = null
    try {
      const raw = GhReviewsSchema.parse(JSON.parse(await this.gh(['pr', 'view', url, '--json', 'latestReviews'], process.cwd())))
      const mine = (raw.latestReviews ?? [])
        .filter((entry) => entry.author?.login.toLowerCase() === viewer.toLowerCase() && GH_STATES[entry.state] !== undefined)
        .map((entry) => ({ login: viewer, state: GH_STATES[entry.state] as PrReviewState, submittedAt: entry.submittedAt ?? null }))
      review = fromReviews(mine, viewer)
    } catch {
      review = null
    }
    this.cache.set(url, { at: this.now(), review })
    return review
  }
}

function fromReviews(reviews: BasePr['reviews'], viewer: string): ViewerReview {
  const mine = reviews.findLast((review) => review.login.toLowerCase() === viewer.toLowerCase())
  return mine && mine.submittedAt !== null ? { state: mine.state, submittedAt: mine.submittedAt } : null
}
