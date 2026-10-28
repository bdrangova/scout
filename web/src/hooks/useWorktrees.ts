import type { WorktreeDetail, WorktreeListResponse } from '@scout/shared'
import { apiDelete, apiGet } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useRefetchOnFocus } from './useRefetchOnFocus'

export interface WorktreeListState {
  data: WorktreeListResponse | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/** `GET /api/worktrees`; refetched when the window regains focus. */
export function useWorktrees(): WorktreeListState {
  const state = useAsync('worktrees', () => apiGet<WorktreeListResponse>('/worktrees'))
  useRefetchOnFocus(state.reload)
  return state
}

export interface WorktreeState {
  worktree: WorktreeDetail | null
  loading: boolean
  error: Error | null
  reload: () => void
}

function worktreeApiPath(id: string): string {
  return `/worktrees/${encodeURIComponent(id)}`
}

/** `GET /api/worktrees/:id`: the summary plus the linked live sessions; refetched when the window regains focus. */
export function useWorktree(id: string | undefined): WorktreeState {
  const state = useAsync(id ? `worktree:${id}` : null, () => apiGet<WorktreeDetail>(worktreeApiPath(id ?? '')))
  useRefetchOnFocus(state.reload)
  return { worktree: state.data, loading: state.loading, error: state.error, reload: state.reload }
}

/** `GET /api/worktrees/:id` once, for the linked session ids the delete flow has to archive. */
export function fetchWorktree(id: string): Promise<WorktreeDetail> {
  return apiGet<WorktreeDetail>(worktreeApiPath(id))
}

/** `DELETE /api/worktrees/:id` (204). A refusal is a 409 `ApiRequestError` with `reason` `dirty` or `sessions`. */
export function deleteWorktree(id: string): Promise<null> {
  return apiDelete<null>(worktreeApiPath(id))
}
