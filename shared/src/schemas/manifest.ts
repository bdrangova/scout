import { z } from 'zod'
import { SCHEMA_VERSION, SESSION_ID_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

export const TicketSchema = z.object({
  key: z.string().min(1),
  url: z.string().nullable(),
})
export type Ticket = z.infer<typeof TicketSchema>

/**
 * `manifest.json`: written by `ai-review init` only. Everything else about a session (the diff,
 * the artifacts, the PR description) is read live from the repo working tree and the session folder.
 */
export const ManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().regex(SESSION_ID_RE),
  title: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  agent: z.object({
    type: z.literal('claude-code'),
    sessionId: z.string().nullable(),
    cliVersion: z.string().nullable(),
    entrypoint: z.string().nullable(),
  }),
  repo: z.object({
    /** Absolute path of the repository top level (posix separators). */
    path: z.string().min(1),
    remote: z.string().nullable(),
    branch: z.string().nullable(),
    /** A ref name (e.g. `origin/main`); the base SHA is `git merge-base <baseRef> HEAD`, computed live. */
    baseRef: z.string().min(1),
  }),
  tickets: z.array(TicketSchema),
})
export type Manifest = z.infer<typeof ManifestSchema>
