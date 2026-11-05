import { z } from 'zod'
import { SCHEMA_VERSION, SESSION_ID_RE, SESSION_RUN_DIR } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

export const TicketSchema = z.object({
  key: z.string().min(1),
  url: z.string().nullable(),
})
export type Ticket = z.infer<typeof TicketSchema>

const baseFields = {
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
  tickets: z.array(TicketSchema),
}

/**
 * `manifest.json` of a code review: written by `ai-review init` only. Everything else about a session (the diff,
 * the artifacts, the PR description) is read live from the repo working tree and the session folder.
 * `kind` is absent from manifests written before test runs existed.
 */
export const CodeReviewManifestSchema = z.object({
  ...baseFields,
  kind: z.enum(['code-review', 'pr-review']).optional(),
  repo: z.object({
    /** Absolute path of the repository top level (posix separators). */
    path: z.string().min(1),
    remote: z.string().nullable(),
    branch: z.string().nullable(),
    /** A ref name (e.g. `origin/main`); the base SHA is `git merge-base <baseRef> HEAD`, computed live. */
    baseRef: z.string().min(1),
  }),
  /** pr-review: the PR being reviewed (`ai-review init --pr`), so Scout can link it before a report is published. */
  pr: z.object({ url: z.string().min(1) }).optional(),
})
export type CodeReviewManifest = z.infer<typeof CodeReviewManifestSchema>

/**
 * `manifest.json` of a test run. The run folder is not stored: it is always `<session folder>/run` (see `runFolderOf`), so it
 * moves with the session when it is archived. The content is read live from there (`run/test-run.json` and the files it names).
 */
export const TestRunManifestSchema = z.object({
  ...baseFields,
  kind: z.literal('test-run'),
  run: z.object({
    /** Absolute path of the checkout (repository top level) the run belongs to; where the agent runs. */
    repo: z.string().min(1),
    feature: z.string().nullable(),
    area: z.string().nullable(),
    /** Where the copies in the run folder came from, recorded by `ai-review run-file add` so `refresh` can copy them again. */
    sources: z
      .object({
        /** Absolute path of the test plan file copied to `run/plan/test-plan.md`. */
        plan: z.string().min(1).optional(),
        /** Bug slug to the absolute path of the bug folder copied to `run/bugs/<slug>`. */
        bugs: z.record(z.string(), z.string().min(1)).optional(),
      })
      .optional(),
  }),
})
export type TestRunManifest = z.infer<typeof TestRunManifestSchema>

export const ManifestSchema = z.union([CodeReviewManifestSchema, TestRunManifestSchema])
export type Manifest = z.infer<typeof ManifestSchema>

export type ManifestKind = 'code-review' | 'test-run' | 'pr-review'

export function isTestRun(manifest: Manifest): manifest is TestRunManifest {
  return manifest.kind === 'test-run'
}

export function manifestKind(manifest: Manifest): ManifestKind {
  return manifest.kind ?? 'code-review'
}

/** The run folder of a test-run session: `<session folder>/run`, for the folder the session currently lives in. */
export function runFolderOf(sessionFolder: string): string {
  return `${sessionFolder.replace(/[\\/]+$/, '')}/${SESSION_RUN_DIR}`
}

/** The directory the agent works in: the repo of a code review, the checkout of a test run. */
export function agentCwd(manifest: Manifest): string {
  return isTestRun(manifest) ? manifest.run.repo : manifest.repo.path
}
