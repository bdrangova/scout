import { z } from 'zod'
import { RUN_ID_RE, SESSION_ID_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()

export const AgentRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>

export const AgentAdapterNameSchema = z.enum(['claude-code', 'fake'])
export type AgentAdapterName = z.infer<typeof AgentAdapterNameSchema>

export const AgentRunSchema = z.object({
  id: z.string().regex(RUN_ID_RE),
  sessionId: z.string().regex(SESSION_ID_RE),
  sentAt: isoDate,
  adapter: AgentAdapterNameSchema,
  status: AgentRunStatusSchema,
  pid: z.number().int().positive().nullable(),
  argv: z.array(z.string()),
  startedAt: isoDate,
  endedAt: isoDate.nullable(),
  exitCode: z.number().int().nullable(),
  agentSessionId: z.string().nullable(),
  numTurns: nonNegativeInt.nullable(),
  costUsd: z.number().nonnegative().nullable(),
  resultText: z.string().nullable(),
  error: z.string().nullable(),
  resolvedComments: z.array(z.string()),
})
export type AgentRun = z.infer<typeof AgentRunSchema>

const eventBase = { seq: nonNegativeInt, at: isoDate }

export const AgentRunEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('status'), status: AgentRunStatusSchema }),
  z.object({ ...eventBase, type: z.literal('init'), model: z.string(), sessionId: z.string() }),
  z.object({ ...eventBase, type: z.literal('assistant_text'), text: z.string() }),
  z.object({ ...eventBase, type: z.literal('partial'), text: z.string() }),
  z.object({ ...eventBase, type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.unknown() }),
  z.object({
    ...eventBase,
    type: z.literal('tool_result'),
    toolUseId: z.string(),
    text: z.string(),
    isError: z.boolean(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('result'),
    isError: z.boolean(),
    text: z.string(),
    costUsd: z.number().nonnegative().nullable(),
    numTurns: nonNegativeInt.nullable(),
    durationMs: nonNegativeInt.nullable(),
  }),
  z.object({ ...eventBase, type: z.literal('stderr'), line: z.string() }),
  z.object({ ...eventBase, type: z.literal('error'), message: z.string() }),
])
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>
