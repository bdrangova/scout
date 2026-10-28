import type { PickFolderResponse, PutSettingsRequest, Settings } from '@review-dash/shared'
import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiPut } from '@/lib/api'

export interface SettingsState {
  settings: Settings | null
  error: Error | null
  loading: boolean
}

/** `GET /api/settings`, loaded fresh every time the component using it mounts (the dialog's form). */
export function useSettings(): SettingsState {
  const [state, setState] = useState<Omit<SettingsState, 'loading'>>({ settings: null, error: null })
  useEffect(() => {
    let cancelled = false
    apiGet<Settings>('/settings').then(
      (settings) => {
        if (!cancelled) setState({ settings, error: null })
      },
      (reason: unknown) => {
        if (!cancelled) setState({ settings: null, error: reason instanceof Error ? reason : new Error(String(reason)) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  return { ...state, loading: state.settings === null && state.error === null }
}

/** `PUT /api/settings`: the whole object; resolves to what the server stored (`~` expanded). */
export function saveSettings(settings: PutSettingsRequest): Promise<Settings> {
  return apiPut<Settings>('/settings', settings)
}

/** `POST /api/settings/pick-folder`: the native folder chooser on this Mac; `path` is null when cancelled. */
export function pickFolder(): Promise<PickFolderResponse> {
  return apiPost<PickFolderResponse>('/settings/pick-folder')
}
