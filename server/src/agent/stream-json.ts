import { errorMessage } from '../errors.ts'
import type { AdapterEvent } from './adapter.ts'

/** Tool results longer than this are cut (the full text stays in the run's `.jsonl`). */
export const TOOL_RESULT_MAX_CHARS = 4096
const TRUNCATION_SUFFIX = '\n… [truncated]'

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function truncate(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text
  return text.slice(0, TOOL_RESULT_MAX_CHARS - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
}

/** A `tool_result.content` is a string or an array of content blocks; keep the text ones. */
export function flattenToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content === undefined || content === null ? '' : JSON.stringify(content)
  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (typeof block.type === 'string') parts.push(`[${block.type}]`)
  }
  return parts.join('\n')
}

function assistantEvents(message: unknown): AdapterEvent[] {
  if (!isRecord(message) || !Array.isArray(message.content)) return []
  const events: AdapterEvent[] = []
  for (const block of message.content) {
    if (!isRecord(block)) continue
    if (block.type === 'text') {
      const text = str(block.text) ?? ''
      if (text.length > 0) events.push({ type: 'assistant_text', text })
    } else if (block.type === 'tool_use') {
      events.push({ type: 'tool_use', id: str(block.id) ?? '', name: str(block.name) ?? 'unknown', input: block.input })
    }
  }
  return events
}

function userEvents(message: unknown): AdapterEvent[] {
  if (!isRecord(message) || !Array.isArray(message.content)) return []
  const events: AdapterEvent[] = []
  for (const block of message.content) {
    if (!isRecord(block) || block.type !== 'tool_result') continue
    events.push({
      type: 'tool_result',
      toolUseId: str(block.tool_use_id) ?? '',
      text: truncate(flattenToolResultContent(block.content)),
      isError: block.is_error === true,
    })
  }
  return events
}

function streamEvents(event: unknown): AdapterEvent[] {
  if (!isRecord(event) || event.type !== 'content_block_delta' || !isRecord(event.delta)) return []
  if (event.delta.type !== 'text_delta') return []
  const text = str(event.delta.text) ?? ''
  return text.length > 0 ? [{ type: 'partial', text }] : []
}

function resultEvent(msg: Rec): AdapterEvent {
  const errors = Array.isArray(msg.errors) ? msg.errors.filter((e): e is string => typeof e === 'string') : []
  const text = str(msg.result) ?? (errors.length > 0 ? errors.join('\n') : (str(msg.subtype) ?? ''))
  return {
    type: 'result',
    isError: msg.is_error === true,
    text,
    costUsd: num(msg.total_cost_usd),
    numTurns: num(msg.num_turns),
    durationMs: num(msg.duration_ms),
  }
}

/**
 * Maps one line of `claude -p --output-format stream-json --verbose --include-partial-messages`
 * to zero or more `AdapterEvent`s. Unknown message types (status, rate limits, summaries,
 * non-text deltas) map to nothing; a line that is not JSON maps to one `error` event.
 */
export function parseStreamJsonLine(line: string): AdapterEvent[] {
  const trimmed = line.trim()
  if (trimmed === '') return []
  let msg: unknown
  try {
    msg = JSON.parse(trimmed)
  } catch (err) {
    return [{ type: 'error', message: `unparsable stream-json line: ${errorMessage(err)}` }]
  }
  if (!isRecord(msg) || typeof msg.type !== 'string') return []
  switch (msg.type) {
    case 'system':
      if (msg.subtype !== 'init') return []
      return [{ type: 'init', model: str(msg.model) ?? 'unknown', sessionId: str(msg.session_id) ?? '' }]
    case 'assistant':
      return assistantEvents(msg.message)
    case 'user':
      return userEvents(msg.message)
    case 'stream_event':
      return streamEvents(msg.event)
    case 'result':
      return [resultEvent(msg)]
    default:
      return []
  }
}
