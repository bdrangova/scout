import type { AssignedPr, AssignedPrsResponse, LocalPrReview, CreatePendingPrReviewResponse, PendingPrReview, PendingPrReviewDetail, PrReviewStatus } from '@scout/shared'
import { GITHUB_REPO_RE } from '@scout/shared'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, apiPut } from './api'
import { describeApiError } from './runs'

export function pendingPrRoute(id: string): string {
  return `/pr/p/${encodeURIComponent(id)}`
}

/** Where a PR's Scout session lives: `/s/:id` for a live review, the placeholder page for a not-started one. */
export function prSessionRoute(session: { id: string; state: 'live' | 'pending' | 'archived' }): string {
  return session.state === 'pending' ? pendingPrRoute(session.id) : `/s/${encodeURIComponent(session.id)}`
}

/** The command that turns a placeholder into a live review. */
export function publishPrReviewCommand(prUrl: string): string {
  return `/publish-pr-review ${prUrl}`
}

export function fetchAssignedPrs(refresh: boolean): Promise<AssignedPrsResponse> {
  return apiGet<AssignedPrsResponse>(refresh ? '/github/assigned?refresh=1' : '/github/assigned')
}

/** Ignore: skipped on purpose here; nothing changes on GitHub. */
export function ignorePr(url: string): Promise<void> {
  return apiPut<void>('/github/ignored', { url })
}

/** Reopens a closed PR: takes off Done and Ignore, sets aside your approvals so far, and restores its archived review session. */
export function reopenPr(url: string): Promise<void> {
  return apiPost<void>('/github/reopen', { url })
}

/** Sets a PR review session's status; Approved closes (archives) it. */
export function setPrReviewStatus(id: string, status: PrReviewStatus): Promise<void> {
  return apiPut<void>(`/sessions/${encodeURIComponent(id)}/pr-status`, { status })
}

export function createPendingPr(url: string): Promise<CreatePendingPrReviewResponse> {
  return apiPost<CreatePendingPrReviewResponse>('/pr-pending', { url })
}

export function fetchPendingPrs(): Promise<PendingPrReview[]> {
  return apiGet<PendingPrReview[]>('/pr-pending')
}

export function fetchPendingPr(id: string): Promise<PendingPrReviewDetail> {
  return apiGet<PendingPrReviewDetail>(`/pr-pending/${encodeURIComponent(id)}`)
}

function deletePendingPr(id: string): Promise<void> {
  return apiDelete<void>(`/pr-pending/${encodeURIComponent(id)}`)
}

/** Removes a placeholder and runs `onRemoved`; a failure is a toast. */
export async function removePendingPr(id: string, onRemoved: () => void): Promise<void> {
  try {
    await deletePendingPr(id)
    onRemoved()
  } catch (err) {
    toast.error("Couldn't remove the PR review", { description: describeApiError(err) })
  }
}

/** Every search word must appear in the PR's title, repo, number or author. */
export function matchesPrSearch(pr: Pick<AssignedPr, 'title' | 'repo' | 'number' | 'author'>, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const text = `${pr.title} ${pr.repo} #${pr.number} ${pr.number} ${pr.author}`.toLowerCase()
  return words.every((word) => text.includes(word))
}

/** "Other" search: every word in the title, or the PR's repo and number when it has one. */
export function matchesLocalSearch(row: LocalPrReview, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const text = `${row.title} ${row.pr ? `${row.pr.repo} #${row.pr.number} ${row.pr.number}` : ''}`.toLowerCase()
  return words.every((word) => text.includes(word))
}

/** `https://github.com/owner/name(/pull/1)` or `owner/name` → `owner/name`; null when it is neither. */
export function parseRepoInput(input: string): string | null {
  const text = input.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/i.exec(text)
  const repo = url ? `${url[1]}/${url[2]}` : text
  return GITHUB_REPO_RE.test(repo) ? repo : null
}

/** A team name as a stable id: lowercase words joined by hyphens, made unique among `taken` with `-2`, `-3`… */
export function teamIdFromName(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team'
  let id = base
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`
  return id
}
