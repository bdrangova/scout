import { ApiRequestError, apiDelete, apiPost } from './api'

/** `POST /api/sessions/:id/archive`: moves the session to `archive/`; the list refetches on `session.removed`. */
export function archiveSession(id: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>(`/sessions/${encodeURIComponent(id)}/archive`)
}

/** `POST /api/sessions/:id/unarchive`: moves it back; the list refetches on `session.added`. */
export function unarchiveSession(id: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>(`/sessions/${encodeURIComponent(id)}/unarchive`)
}

/** `DELETE /api/sessions/archived/:id`: removes the archived folder for good (no event; the caller reloads the archived list). */
export function deleteArchivedSession(id: string): Promise<{ id: string }> {
  return apiDelete<{ id: string }>(`/sessions/archived/${encodeURIComponent(id)}`)
}

export const RUN_ACTIVE_MESSAGE = 'Claude Code is still working on this session'

/** The toast wording for a failed archive: the 409 `run-active` case gets a plain sentence, the rest the server's message. */
export function archiveErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 409) {
    const body = err.body as { error?: unknown } | null
    if (body?.error === 'run-active') return RUN_ACTIVE_MESSAGE
  }
  return err instanceof Error ? err.message : String(err)
}
