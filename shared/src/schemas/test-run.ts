import { z } from 'zod'
import { TEST_RUN_INDEX_SCHEMA_VERSION } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

const REF_RE = /^[a-z][a-z0-9-]*:[^\0]+$/
const ALIAS_RE = /^[a-z][a-z0-9-]*$/

/** Splits a relative path on both separators; empty segments are dropped. */
function segmentsOf(path: string): string[] {
  return path.split(/[\\/]/).filter((segment) => segment !== '')
}

/** `alias:relative/path`: the alias names a `roots` entry; the path is relative, never absolute and without `..`. */
export type RunRef = { alias: string; path: string }

/** Splits a run ref, or null when it is malformed (bad alias, absolute path, `..` segment, NUL). */
export function parseRunRef(ref: string): RunRef | null {
  if (!REF_RE.test(ref)) return null
  const colon = ref.indexOf(':')
  const path = ref.slice(colon + 1)
  if (path.startsWith('/') || path.startsWith('\\') || segmentsOf(path).includes('..')) return null
  return { alias: ref.slice(0, colon), path }
}

export const RunRefSchema = z.string().refine((ref) => parseRunRef(ref) !== null, { message: 'expected alias:relative/path without ".." segments or a leading "/"' })

export const SCENARIO_STATUSES = ['planned', 'pass', 'fail', 'uncertain', 'gap', 'na', 'blocked'] as const
export const ScenarioStatusSchema = z.enum(SCENARIO_STATUSES)
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>

export const TEST_RUN_PAGES = ['gaps', 'data-setup', 'logs'] as const
export const TestRunPageSchema = z.enum(TEST_RUN_PAGES)
export type TestRunPage = z.infer<typeof TestRunPageSchema>

/** One piece of evidence; `atSec` is a chapter on the video's timeline. */
export const EvidenceRefSchema = z.object({
  path: RunRefSchema,
  caption: z.string().optional(),
  layer: z.string().optional(),
  atSec: z.number().nonnegative().optional(),
})
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>

export const LogExcerptSchema = z
  .object({
    path: RunRefSchema,
    from: z.number().int().min(1),
    to: z.number().int().min(1),
    label: z.string().optional(),
  })
  .check((ctx) => {
    if (ctx.value.to < ctx.value.from) {
      ctx.issues.push({ code: 'custom', message: 'to is before from', path: ['to'], input: ctx.value.to })
    }
  })
export type LogExcerpt = z.infer<typeof LogExcerptSchema>

export const StepSchema = z.object({
  label: z.string().optional(),
  action: z.string().optional(),
  expected: z.string().optional(),
  observed: z.string().optional(),
  result: z.string().optional(),
})
export type Step = z.infer<typeof StepSchema>

const panelBase = {
  title: z.string().optional(),
  span: z.union([z.literal(1), z.literal(2)]).optional(),
}

const toneSchema = z.enum(['good', 'bad', 'warn', 'neutral'])

const KnownPanelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('markdown'), ...panelBase, markdown: z.string() }),
  z.object({
    type: z.literal('stats'),
    ...panelBase,
    items: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]), tone: toneSchema.optional(), hint: z.string().optional() })),
  }),
  z.object({
    type: z.literal('table'),
    ...panelBase,
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  }),
  z.object({
    type: z.literal('key-value'),
    ...panelBase,
    items: z.array(z.object({ key: z.string(), value: z.string() })),
  }),
  z.object({ type: z.literal('gallery'), ...panelBase, items: z.array(EvidenceRefSchema) }),
  z.object({
    type: z.literal('video'),
    ...panelBase,
    path: RunRefSchema,
    caption: z.string().optional(),
    chapters: z.array(z.object({ atSec: z.number().nonnegative(), label: z.string() })).optional(),
  }),
  z.object({ type: z.literal('log'), ...panelBase, path: RunRefSchema, from: z.number().int().min(1), to: z.number().int().min(1), label: z.string().optional() }),
  z.object({
    type: z.literal('links'),
    ...panelBase,
    items: z.array(z.object({ label: z.string(), scenario: z.string().optional(), ref: RunRefSchema.optional(), url: z.string().optional() })),
  }),
  z.object({
    type: z.literal('scenario-list'),
    ...panelBase,
    /** Only these scenarios (index order); all when absent. */
    ids: z.array(z.string()).optional(),
    statuses: z.array(ScenarioStatusSchema).optional(),
  }),
])

const KNOWN_PANEL_TYPES: ReadonlySet<string> = new Set(KnownPanelSchema.options.map((option) => option.shape.type.value))

/**
 * A panel the dashboard cannot render: a type it does not know (`unknown-type`) or a known type with a broken shape
 * (`invalid-shape`). The index stays valid; the dashboard shows a placeholder and the server reports a warning.
 */
const UnsupportedPanelSchema = z.looseObject({ type: z.string() }).transform((original) => ({
  type: 'unsupported' as const,
  originalType: original.type,
  reason: KNOWN_PANEL_TYPES.has(original.type) ? ('invalid-shape' as const) : ('unknown-type' as const),
  original: original as Record<string, unknown>,
}))

export const PanelSchema = z.union([KnownPanelSchema, UnsupportedPanelSchema])
export type Panel = z.infer<typeof PanelSchema>

export const LayerSchema = z.object({ name: z.string(), status: ScenarioStatusSchema, note: z.string().optional() })
export type Layer = z.infer<typeof LayerSchema>

export const ScenarioSchema = z.object({
  /** Unique within the index; the key of the verdict in `review.files` and the `ref` of a `scenario` comment. */
  id: z.string().regex(/^[A-Za-z][\w-]*$/),
  title: z.string().min(1),
  status: ScenarioStatusSchema,
  layers: z.array(LayerSchema).optional(),
  /** Structured steps, or free markdown; the server never parses `steps.md`. */
  steps: z.array(StepSchema).optional(),
  stepsMarkdown: z.string().optional(),
  evidence: z
    .object({
      videos: z.array(EvidenceRefSchema).default([]),
      screenshots: z.array(EvidenceRefSchema).default([]),
      data: z.array(EvidenceRefSchema).default([]),
    })
    .default({ videos: [], screenshots: [], data: [] }),
  logs: z.array(LogExcerptSchema).default([]),
  links: z.object({ gaps: z.array(z.string()).default([]), bugs: z.array(z.string()).default([]) }).default({ gaps: [], bugs: [] }),
  notes: z.string().optional(),
  order: z.number().int().nonnegative(),
})
export type Scenario = z.infer<typeof ScenarioSchema>

export const GapSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  scenarios: z.array(z.string()).default([]),
  markdown: z.string().optional(),
})
export type Gap = z.infer<typeof GapSchema>

export const BugSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  /** The bug's markdown file. */
  path: RunRefSchema,
  jira: z.string().optional(),
  screenshots: z.array(RunRefSchema).default([]),
  scenarios: z.array(z.string()).default([]),
})
export type Bug = z.infer<typeof BugSchema>

export const DataSetupSchema = z.object({
  steps: z.array(StepSchema).default([]),
  videos: z.array(EvidenceRefSchema).default([]),
  screenshots: z.array(EvidenceRefSchema).default([]),
  /** A path on the reviewer's machine to copy, not a run ref. */
  snapshotPath: z.string().optional(),
  notes: z.string().optional(),
})
export type DataSetup = z.infer<typeof DataSetupSchema>

export const RunLogSchema = z.object({ path: RunRefSchema, label: z.string().min(1) })
export type RunLog = z.infer<typeof RunLogSchema>

const PublishedBySchema = z.object({
  at: isoDate,
  /** Hashes of the sources the publisher read, so a rerun rewrites only what changed. */
  hashes: z.record(z.string(), z.string()).optional(),
})

/** Root values are relative to the run folder and stay inside it: no leading `/`, no drive letter, no `..` segment, no NUL. */
function rootIsValid(value: string): boolean {
  if (value === '' || value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value)) return false
  return !segmentsOf(value).includes('..')
}

/**
 * `<run>/test-run.json`, written by the publish skills. Paths inside are `alias:relative/path`, the alias naming a `roots`
 * entry (`run` is always `.`: the run folder). A scenario's verdict is keyed by its id in `review.files`.
 */
export const TestRunIndexSchema = z
  .object({
    schemaVersion: z.literal(TEST_RUN_INDEX_SCHEMA_VERSION),
    runId: z.string().min(1),
    title: z.string().min(1),
    feature: z.string().nullable(),
    area: z.string().nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    publishedBy: z.object({ plan: PublishedBySchema.optional(), dataSetup: PublishedBySchema.optional(), run: PublishedBySchema.optional() }),
    roots: z.record(z.string().regex(ALIAS_RE), z.string()),
    pages: z.array(TestRunPageSchema).default([]),
    overview: z.array(PanelSchema).default([]),
    scenarios: z.array(ScenarioSchema),
    gaps: z.array(GapSchema).optional(),
    bugs: z.array(BugSchema).optional(),
    dataSetup: DataSetupSchema.optional(),
    logs: z.array(RunLogSchema).optional(),
  })
  .check((ctx) => {
    const { roots, scenarios } = ctx.value
    for (const [alias, value] of Object.entries(roots)) {
      if (!rootIsValid(value)) {
        ctx.issues.push({ code: 'custom', message: `root "${alias}" must be a relative path inside the run folder (no leading "/", no ".." segment)`, path: ['roots', alias], input: value })
      }
    }
    if (roots['run'] !== '.') {
      ctx.issues.push({ code: 'custom', message: 'roots.run must exist and be "."', path: ['roots', 'run'], input: roots['run'] })
    }
    const seen = new Set<string>()
    scenarios.forEach((scenario, index) => {
      if (seen.has(scenario.id)) {
        ctx.issues.push({ code: 'custom', message: `duplicate scenario id ${scenario.id}`, path: ['scenarios', index, 'id'], input: scenario.id })
      }
      seen.add(scenario.id)
    })
  })
export type TestRunIndex = z.infer<typeof TestRunIndexSchema>
