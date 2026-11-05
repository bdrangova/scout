import type { AssignedPr, AssignedPrsResponse, PendingPrReview } from '@scout/shared'

export const PENDING_ID = '20261030-1000-fix-trial-bar-ab12'
export const LIVE_ID = '20261030-0900-live-pr-cd34'

export function assignedPr(overrides: Partial<AssignedPr> = {}): AssignedPr {
  return {
    url: 'https://github.com/acme/app/pull/12',
    repo: 'acme/app',
    number: 12,
    title: 'Fix the trial bar',
    author: 'octocat',
    isDraft: false,
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
    headRef: 'fix-trial-bar',
    baseRef: 'main',
    additions: 120,
    deletions: 4,
    changedFiles: 3,
    requested: { users: ['bojana'], teams: ['acme/reviewers'] },
    reviews: [{ login: 'reviewer-1', state: 'approved', submittedAt: '2026-10-30T09:00:00.000Z' }],
    session: null,
    status: 'pending',
    ...overrides,
  }
}

export function assignedResponse(overrides: Partial<AssignedPrsResponse> = {}): AssignedPrsResponse {
  return { viewer: 'bojana', fetchedAt: '2026-10-30T10:05:00.000Z', problem: null, other: [], authored: [], assignedToMe: [], teams: [], errors: [], ...overrides }
}

export function pendingReview(overrides: Partial<PendingPrReview['pr']> = {}, id = PENDING_ID): PendingPrReview {
  const { url, repo, number, title, author, isDraft, headRef, baseRef } = assignedPr()
  return { id, createdAt: '2026-10-30T10:00:00.000Z', pr: { url, repo, number, title, author, isDraft, headRef, baseRef, ...overrides } }
}
