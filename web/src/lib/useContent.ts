import { apiGet } from './api'
import { useAsync } from './hooks'
import { artifactPath } from './paths'

export interface ContentState {
  content: string | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/** Text of an extras or spec file (`GET /api/sessions/:id/<extras|spec>/*path`). */
export function useContent(sessionId: string, kind: 'extras' | 'spec', path: string): ContentState {
  const state = useAsync(`content:${sessionId}:${kind}:${path}`, () => apiGet<string>(artifactPath(sessionId, kind, path)))
  return { content: state.data, loading: state.loading, error: state.error, reload: state.reload }
}
