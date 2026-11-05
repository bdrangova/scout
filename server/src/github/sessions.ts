import { readReport } from '@scout/shared/pr-review/report'
import type { CodeReviewManifest, PrReviewStatus } from '@scout/shared'
import { readPrStatus } from '../store/pr-status.ts'
import { readPrComments } from '../store/review.ts'
import type { Store } from '../store/index.ts'
import { prKey } from './pr-url.ts'

/** The PR a PR-review session reviews: from its manifest (`init --pr`), the published report, or the synced comments file. */
export async function prUrlOf(dir: string, id: string, manifest: CodeReviewManifest): Promise<string | undefined> {
  if (manifest.pr !== undefined) return manifest.pr.url
  const report = await readReport(dir).catch(() => null)
  return report?.pr.url ?? (await readPrComments(dir, id).catch(() => null))?.pr.url
}

/** Keeps the newest id per PR key (ids start with their creation time); reads finish in any order, so ties settle here. */
function newestPerKey(found: readonly (readonly [string, string])[]): Map<string, string> {
  const ordered = new Map<string, string>()
  for (const [key, id] of found) {
    const current = ordered.get(key)
    if (current === undefined || id > current) ordered.set(key, id)
  }
  return ordered
}

/** Normalised PR key → session id of the newest live (non-archived) PR review for that PR. */
export async function livePrReviews(store: Store): Promise<Map<string, string>> {
  const found: [string, string][] = []
  await Promise.all(
    (await store.sessionIds()).map(async (id) => {
      const loaded = await store.readManifest(id)
      if (!loaded.ok || loaded.manifest.kind !== 'pr-review') return
      const key = prKey((await prUrlOf(store.paths.sessionDir(id), id, loaded.manifest)) ?? '')
      if (key !== null) found.push([key, id])
    }),
  )
  return newestPerKey(found)
}

/** The newest archived PR review of a PR: archived as Done, or with its review status (Approved closes a review). */
export interface ArchivedPrReview {
  id: string
  done: boolean
  prStatus: PrReviewStatus
}

/** Normalised PR key → the newest archived PR review for that PR. */
export async function archivedPrReviews(store: Store): Promise<Map<string, ArchivedPrReview>> {
  const found: [string, ArchivedPrReview][] = []
  await Promise.all(
    (await store.archivedIds()).map(async (id) => {
      const { result, marker } = await store.readArchived(id)
      if (!result.ok || result.manifest.kind !== 'pr-review') return
      const dir = store.paths.archivedSessionDir(id)
      const key = prKey((await prUrlOf(dir, id, result.manifest)) ?? '')
      if (key !== null) found.push([key, { id, done: marker.done === true, prStatus: await readPrStatus(dir) }])
    }),
  )
  const newest = new Map<string, ArchivedPrReview>()
  for (const [key, review] of found) {
    const current = newest.get(key)
    if (current === undefined || review.id > current.id) newest.set(key, review)
  }
  return newest
}

/** A PR review session, live or archived, with what "Other" shows of it. */
export interface PrReviewSessionInfo {
  id: string
  archived: boolean
  title: string
  updatedAt: string
  /** The PR it reviews, if known. */
  url: string | undefined
  /** Archived as Done. */
  done: boolean
  prStatus: PrReviewStatus
}

/** Every PR review session, live first, then archived. */
export async function prReviewSessions(store: Store): Promise<PrReviewSessionInfo[]> {
  const live = await Promise.all(
    (await store.sessionIds()).map(async (id): Promise<PrReviewSessionInfo | null> => {
      const loaded = await store.readManifest(id)
      if (!loaded.ok || loaded.manifest.kind !== 'pr-review') return null
      const dir = store.paths.sessionDir(id)
      const [url, prStatus] = await Promise.all([prUrlOf(dir, id, loaded.manifest), readPrStatus(dir)])
      return { id, archived: false, title: loaded.manifest.title, updatedAt: loaded.manifest.updatedAt, url, done: false, prStatus }
    }),
  )
  const archived = await Promise.all(
    (await store.archivedIds()).map(async (id): Promise<PrReviewSessionInfo | null> => {
      const { result, marker } = await store.readArchived(id)
      if (!result.ok || result.manifest.kind !== 'pr-review') return null
      const dir = store.paths.archivedSessionDir(id)
      const [url, prStatus] = await Promise.all([prUrlOf(dir, id, result.manifest), readPrStatus(dir)])
      return { id, archived: true, title: result.manifest.title, updatedAt: marker.archivedAt, url, done: marker.done === true, prStatus }
    }),
  )
  return [...live, ...archived].filter((info): info is PrReviewSessionInfo => info !== null)
}
