import fs from 'node:fs'
import { AgentRunEventSchema } from '@review-dash/shared'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SAMPLE_PATH } from './fake.ts'
import { TOOL_RESULT_MAX_CHARS, flattenToolResultContent, parseStreamJsonLine } from './stream-json.ts'

const lines = fs.readFileSync(DEFAULT_SAMPLE_PATH, 'utf8').split('\n').filter((l) => l.trim() !== '')
const events = lines.flatMap(parseStreamJsonLine)
const ofType = <T extends ReturnType<typeof parseStreamJsonLine>[number]['type']>(type: T) =>
  events.filter((e): e is Extract<(typeof events)[number], { type: T }> => e.type === type)

describe('parseStreamJsonLine on fixtures/agent-run.sample.jsonl', () => {
  it('maps system/init to one init event', () => {
    const inits = ofType('init')
    expect(inits).toHaveLength(1)
    expect(inits[0]).toMatchObject({ model: 'claude-sonnet-5' })
    expect(inits[0]?.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('maps assistant tool_use blocks and user tool_result blocks in order', () => {
    const uses = ofType('tool_use')
    expect(uses.map((u) => u.name)).toEqual(['Bash', 'Edit', 'Edit', 'Bash', 'Bash'])
    expect(uses[0]?.input).toMatchObject({ command: 'echo review-dash-sample' })
    expect(JSON.stringify(uses[3]?.input)).toContain('ai-review resolve 20260101-0900-fixture-abcd --comment c1 --status resolved')

    const results = ofType('tool_result')
    expect(results.map((r) => r.toolUseId)).toEqual(uses.map((u) => u.id))
    expect(results[0]).toMatchObject({ text: 'review-dash-sample', isError: false })
    const denied = results.filter((r) => r.isError)
    expect(denied).toHaveLength(1)
    expect(denied[0]?.text).toMatch(/^Permission denied/)
  })

  it('maps text deltas to partial events and text blocks to assistant_text', () => {
    const partial = ofType('partial').map((p) => p.text).join('')
    expect(partial).toContain('done')
    expect(partial).toContain('Republish the session with /publish-review')
    const texts = ofType('assistant_text').map((t) => t.text)
    expect(texts[0]).toBe('done')
    expect(texts.at(-1)).toMatch(/^Done\. Addressed c1/)
  })

  it('maps the final result with cost, turns and duration', () => {
    const results = ofType('result')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ isError: false, costUsd: 0.42, numTurns: 6, durationMs: 134000 })
    expect(results[0]?.text).toMatch(/^Done\./)
  })

  it('produces events that validate as AgentRunEvent once numbered', () => {
    expect(events.length).toBeGreaterThan(20)
    events.forEach((event, index) => {
      expect(() => AgentRunEventSchema.parse({ seq: index + 1, at: '2026-09-26T18:47:36.000Z', ...event })).not.toThrow()
      expect('raw' in event).toBe(false)
    })
  })

  it('ignores status, rate-limit, summary and non-text stream lines', () => {
    const ignored = lines.filter((line) => {
      const o = JSON.parse(line) as { type: string; subtype?: string; event?: { type: string; delta?: { type: string } } }
      return (
        (o.type === 'system' && o.subtype !== 'init') ||
        o.type === 'rate_limit_event' ||
        (o.type === 'stream_event' && !(o.event?.type === 'content_block_delta' && o.event.delta?.type === 'text_delta'))
      )
    })
    expect(ignored.length).toBeGreaterThan(10)
    for (const line of ignored) expect(parseStreamJsonLine(line)).toEqual([])
  })
})

describe('parseStreamJsonLine edge cases', () => {
  it('answers invalid JSON with one error event and blank or unknown lines with nothing', () => {
    const bad = parseStreamJsonLine('{not json')
    expect(bad).toHaveLength(1)
    expect(bad[0]).toMatchObject({ type: 'error' })
    expect(parseStreamJsonLine('')).toEqual([])
    expect(parseStreamJsonLine('   ')).toEqual([])
    expect(parseStreamJsonLine('{"type":"something_new"}')).toEqual([])
    expect(parseStreamJsonLine('[1,2]')).toEqual([])
    expect(parseStreamJsonLine('"str"')).toEqual([])
  })

  it('flattens array tool_result content and truncates long results', () => {
    const line = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] },
          { type: 'tool_result', tool_use_id: 't2', content: 'x'.repeat(10_000), is_error: true },
        ],
      },
    })
    const [first, second] = parseStreamJsonLine(line)
    expect(first).toEqual({ type: 'tool_result', toolUseId: 't1', text: 'a\n[image]\nb', isError: false })
    expect(second).toMatchObject({ type: 'tool_result', toolUseId: 't2', isError: true })
    if (second?.type !== 'tool_result') throw new Error('expected a tool_result')
    expect(second.text.length).toBe(TOOL_RESULT_MAX_CHARS)
    expect(second.text.endsWith('[truncated]')).toBe(true)
    expect(flattenToolResultContent(undefined)).toBe('')
    expect(flattenToolResultContent({ odd: true })).toBe('{"odd":true}')
  })

  it('maps an error result without result text', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 80, duration_ms: 10, errors: ['max turns reached'] })
    expect(parseStreamJsonLine(line)).toEqual([
      { type: 'result', isError: true, text: 'max turns reached', costUsd: null, numTurns: 80, durationMs: 10 },
    ])
  })

  it('skips empty text blocks and deltas', () => {
    expect(parseStreamJsonLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '' }] } }))).toEqual([])
    expect(parseStreamJsonLine(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '' } } }))).toEqual([])
  })
})
