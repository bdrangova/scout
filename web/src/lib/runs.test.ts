import type { AgentRunEvent } from '@review-dash/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { runEventFactory } from '@/test/mock-event-source'
import {
  EMPTY_TRANSCRIPT,
  applyRunEvent,
  formatElapsed,
  formatRunFooter,
  isDeniedResult,
  toolInputSummary,
  type Transcript,
} from './runs'

let ev = runEventFactory()
beforeEach(() => {
  ev = runEventFactory()
})

function fold(events: AgentRunEvent[]): Transcript {
  return events.reduce(applyRunEvent, EMPTY_TRANSCRIPT)
}

describe('applyRunEvent', () => {
  it('grows one paragraph from partials and finalises it with assistant_text', () => {
    const t = fold([
      ev({ type: 'partial', text: 'Six comm' }),
      ev({ type: 'partial', text: 'ents.' }),
      ev({ type: 'assistant_text', text: 'Six comments. Starting with the day count.' }),
    ])
    expect(t.items).toEqual([
      { kind: 'text', key: '1', text: 'Six comments. Starting with the day count.', streaming: false },
    ])
  })

  it('attaches tool results to their call and keeps status and result', () => {
    const t = fold([
      ev({ type: 'status', status: 'running' }),
      ev({ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'git commit -am x' } }),
      ev({ type: 'tool_result', toolUseId: 'toolu_1', text: 'permission denied', isError: true }),
      ev({ type: 'result', isError: false, text: 'done', costUsd: 0.42, numTurns: 6, durationMs: 134_000 }),
    ])
    expect(t.status).toBe('running')
    expect(t.items[0]).toMatchObject({ kind: 'tool', name: 'Bash', result: { text: 'permission denied', isError: true } })
    expect(t.result?.costUsd).toBe(0.42)
    expect(t.lastSeq).toBe(4)
  })

  it('ignores replayed events with an older seq', () => {
    const first = ev({ type: 'assistant_text', text: 'a' })
    const t = applyRunEvent(applyRunEvent(EMPTY_TRANSCRIPT, first), first)
    expect(t.items).toHaveLength(1)
  })
})

describe('formatting', () => {
  it('renders the result footer', () => {
    expect(formatRunFooter({ numTurns: 6, costUsd: 0.42, durationMs: 134_000 })).toBe('turn 6 · $0.42 · 2m 14s')
    expect(formatRunFooter({ numTurns: null, costUsd: null, durationMs: 9_000 })).toBe('9s')
    expect(formatElapsed(3_900_000)).toBe('1h 05m')
  })

  it('summarises tool inputs and spots denied results', () => {
    expect(toolInputSummary({ file_path: 'src/a.ts', old_string: 'x' })).toBe('src/a.ts')
    expect(toolInputSummary({ command: 'npm test\n' })).toBe('npm test')
    expect(toolInputSummary({ other: 1 })).toBe('{"other":1}')
    expect(isDeniedResult('Claude requested permissions to use Bash, but you haven\'t granted it yet.')).toBe(true)
    expect(isDeniedResult('13 passed')).toBe(false)
  })
})
