import type { AgentRun, AgentRunEvent } from '@review-dash/shared'
import { useEffect, useReducer } from 'react'
import { EMPTY_TRANSCRIPT, applyRunEvent, runEventsUrl, type Transcript } from './runs'

export interface RunEventsState {
  transcript: Transcript
  /** The final `AgentRun` sent with `event: end`; null while the run is still streaming. */
  finalRun: AgentRun | null
  /** The stream dropped and the browser is reconnecting (it resends `Last-Event-ID` itself). */
  reconnecting: boolean
}

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: AgentRunEvent }
  | { type: 'end'; run: AgentRun }
  | { type: 'connection'; reconnecting: boolean }

const INITIAL: RunEventsState = { transcript: EMPTY_TRANSCRIPT, finalRun: null, reconnecting: false }

function reduce(state: RunEventsState, action: Action): RunEventsState {
  switch (action.type) {
    case 'reset':
      return INITIAL
    case 'event':
      return { ...state, transcript: applyRunEvent(state.transcript, action.event), reconnecting: false }
    case 'end':
      return { ...state, finalRun: action.run, reconnecting: false }
    case 'connection':
      return state.reconnecting === action.reconnecting ? state : { ...state, reconnecting: action.reconnecting }
  }
}

function parse<T>(data: unknown): T | null {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

/**
 * Streams `/api/runs/:runId/events` into a transcript. Named `run` events are folded with
 * `applyRunEvent`; `end` carries the final run and closes the source (no reconnect afterwards).
 */
export function useRunEvents(runId: string | null): RunEventsState {
  const [state, dispatch] = useReducer(reduce, INITIAL)

  useEffect(() => {
    dispatch({ type: 'reset' })
    if (runId === null) return
    const source = new EventSource(runEventsUrl(runId))
    const onRun = (message: MessageEvent) => {
      const event = parse<AgentRunEvent>(message.data)
      if (event) dispatch({ type: 'event', event })
    }
    const onEnd = (message: MessageEvent) => {
      const run = parse<AgentRun>(message.data)
      source.close()
      if (run) dispatch({ type: 'end', run })
    }
    const onOpen = () => dispatch({ type: 'connection', reconnecting: false })
    const onError = () => {
      if (source.readyState !== EventSource.CLOSED) dispatch({ type: 'connection', reconnecting: true })
    }
    source.addEventListener('run', onRun)
    source.addEventListener('end', onEnd)
    source.addEventListener('open', onOpen)
    source.addEventListener('error', onError)
    return () => {
      source.removeEventListener('run', onRun)
      source.removeEventListener('end', onEnd)
      source.removeEventListener('open', onOpen)
      source.removeEventListener('error', onError)
      source.close()
    }
  }, [runId])

  return state
}
