import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { TEST_RUN_INDEX_FILE, TestRunIndexSchema, parseRunRef } from '@review-dash/shared'
import type { Panel, Scenario, TestRunDetail, TestRunIndex, TestRunManifest } from '@review-dash/shared'
import { errorMessage, formatZodError, invalidStoreFile } from '../errors.ts'
import { FileCache } from './cache.ts'
import { isMissing } from './fs.ts'

export type RunIndexResult =
  | { ok: true; index: TestRunIndex; warnings: string[] }
  | { ok: false; error: string }

function unsupportedWarnings(panels: readonly Panel[], where: string): string[] {
  const warnings: string[] = []
  panels.forEach((panel, i) => {
    if (panel.type === 'unsupported') {
      warnings.push(panel.reason === 'invalid-shape' ? `${where}[${i}]: "${panel.originalType}" panel has an invalid shape and is shown as a placeholder` : `${where}[${i}]: unknown panel type "${panel.originalType}"`)
    }
  })
  return warnings
}

function linkWarnings(index: TestRunIndex): string[] {
  const warnings: string[] = []
  const scenarioIds = new Set(index.scenarios.map((s) => s.id))
  const gapIds = new Set((index.gaps ?? []).map((g) => g.id))
  const bugSlugs = new Set((index.bugs ?? []).map((b) => b.slug))
  for (const scenario of index.scenarios) {
    for (const gap of scenario.links.gaps) if (!gapIds.has(gap)) warnings.push(`scenario ${scenario.id} links gap ${gap}, which is not in the index`)
    for (const bug of scenario.links.bugs) if (!bugSlugs.has(bug)) warnings.push(`scenario ${scenario.id} links bug ${bug}, which is not in the index`)
  }
  for (const gap of index.gaps ?? []) {
    for (const id of gap.scenarios) if (!scenarioIds.has(id)) warnings.push(`gap ${gap.id} names scenario ${id}, which is not in the index`)
  }
  for (const bug of index.bugs ?? []) {
    for (const id of bug.scenarios) if (!scenarioIds.has(id)) warnings.push(`bug ${bug.slug} names scenario ${id}, which is not in the index`)
  }
  return warnings
}

/** Parses `test-run.json`; the warnings are problems that leave the index usable. */
export function parseRunIndex(text: string): RunIndexResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `${TEST_RUN_INDEX_FILE} is not valid JSON: ${errorMessage(err)}` }
  }
  const result = TestRunIndexSchema.safeParse(json)
  if (!result.success) return { ok: false, error: `${TEST_RUN_INDEX_FILE} is invalid: ${formatZodError(result.error)}` }
  const index = result.data
  return { ok: true, index, warnings: [...unsupportedWarnings(index.overview, 'overview'), ...linkWarnings(index)] }
}

const indexCache = new FileCache<RunIndexResult>()

/** The parsed `<runPath>/test-run.json` (cached until its mtime or size changes); `null` when the file does not exist. */
export function loadRunIndex(runPath: string): Promise<RunIndexResult | null> {
  return indexCache.get(path.join(runPath, TEST_RUN_INDEX_FILE), parseRunIndex)
}

/** 16 hex of the index file's bytes, `null` when unreadable: pins what a send was made against. */
export async function indexFingerprint(runPath: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(path.join(runPath, TEST_RUN_INDEX_FILE))).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep)
}

/** `realpath`, or the lexical path when the target does not exist yet (its files then show up in `missing`). */
async function realpathOrSelf(target: string): Promise<string> {
  try {
    return await fs.realpath(target)
  } catch (err) {
    if (isMissing(err)) return target
    throw err
  }
}

/**
 * The absolute directory of every alias: `run.path` resolved against the index's relative roots (realpath'd).
 * Throws a 422 when `run.path` or a root escapes `run.repo`, so nothing outside the checkout is ever read.
 */
export async function resolveRoots(manifest: TestRunManifest, index: Pick<TestRunIndex, 'roots'>): Promise<Record<string, string>> {
  const { run } = manifest
  let repo: string
  let runPath: string
  try {
    ;[repo, runPath] = await Promise.all([fs.realpath(run.repo), fs.realpath(run.path)])
  } catch (err) {
    throw invalidStoreFile(`test run ${manifest.id}: run folder or checkout is not readable: ${errorMessage(err)}`)
  }
  if (!isInside(repo, runPath)) throw invalidStoreFile(`test run ${manifest.id}: run folder ${run.path} is not inside ${run.repo}`)
  const roots: Record<string, string> = {}
  for (const [alias, relative] of Object.entries(index.roots)) {
    const resolved = await realpathOrSelf(path.resolve(runPath, relative))
    if (!isInside(repo, resolved)) throw invalidStoreFile(`test run ${manifest.id}: root "${alias}" (${relative}) leaves ${run.repo}`)
    roots[alias] = resolved
  }
  return roots
}

/** `alias:path` with empty and `.` segments removed, or null for a malformed ref. */
export function normalizeRef(ref: string): string | null {
  const parsed = parseRunRef(ref)
  if (parsed === null) return null
  const segments = parsed.path.split(/[\\/]/).filter((s) => s !== '' && s !== '.')
  return segments.length === 0 ? null : `${parsed.alias}:${segments.join('/')}`
}

function panelRefs(panel: Panel): string[] {
  switch (panel.type) {
    case 'gallery':
      return panel.items.map((item) => item.path)
    case 'video':
    case 'log':
      return [panel.path]
    case 'links':
      return panel.items.flatMap((item) => (item.ref === undefined ? [] : [item.ref]))
    default:
      return []
  }
}

function scenarioEvidenceRefs(scenario: Scenario): string[] {
  const { videos, screenshots, data } = scenario.evidence
  return [...videos, ...screenshots, ...data].map((item) => item.path)
}

/** Every ref the index names, in no particular order and not normalised. */
function allRefs(index: TestRunIndex): string[] {
  const refs: string[] = []
  for (const panel of index.overview) refs.push(...panelRefs(panel))
  for (const scenario of index.scenarios) {
    refs.push(...scenarioEvidenceRefs(scenario))
    refs.push(...scenario.logs.map((log) => log.path))
  }
  refs.push(...(index.logs ?? []).map((log) => log.path))
  for (const bug of index.bugs ?? []) refs.push(bug.path, ...bug.screenshots)
  const setup = index.dataSetup
  if (setup) refs.push(...setup.videos.map((v) => v.path), ...setup.screenshots.map((s) => s.path))
  return refs
}

/**
 * The exact set of files the dashboard may serve: every ref the index names (evidence of all kinds, panel sources,
 * log excerpts, logs, bugs and their screenshots, data-setup media) whose alias is in `roots`. Nothing is inferred from the file system.
 */
export function servablePaths(index: TestRunIndex, roots: Readonly<Record<string, string>>): Set<string> {
  const set = new Set<string>()
  for (const ref of allRefs(index)) {
    const normal = normalizeRef(ref)
    if (normal === null) continue
    if (normal.slice(0, normal.indexOf(':')) in roots) set.add(normal)
  }
  return set
}

export type RefStat = { size: number } | null

/**
 * 16 hex over the scenario's sorted evidence refs with their sizes (`missing` for an absent file), the step text and the status.
 * Never over logs, so a growing log does not mark the scenario as updated.
 */
export function scenarioFingerprint(scenario: Scenario, statsByRef: ReadonlyMap<string, RefStat>): string {
  const { videos, screenshots, data } = scenario.evidence
  const sized = [...videos, ...screenshots, ...data].map((item) => normalizeRef(item.path) ?? item.path)
  const evidence = sized.map((ref) => `${ref}\t${statsByRef.get(ref)?.size ?? 'missing'}`).sort()
  const steps = JSON.stringify(scenario.steps ?? null)
  const text = [...evidence, `steps\t${steps}`, `markdown\t${scenario.stepsMarkdown ?? ''}`, `status\t${scenario.status}`].join('\n')
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** Joins a normalised ref onto its root: `null` when the alias is unknown. */
export function refToAbsolute(roots: Readonly<Record<string, string>>, ref: string): { root: string; relative: string } | null {
  const normal = normalizeRef(ref)
  if (normal === null) return null
  const colon = normal.indexOf(':')
  const root = roots[normal.slice(0, colon)]
  return root === undefined ? null : { root, relative: normal.slice(colon + 1) }
}

async function statRef(roots: Readonly<Record<string, string>>, ref: string): Promise<RefStat> {
  const target = refToAbsolute(roots, ref)
  if (target === null) return null
  try {
    const stat = await fs.lstat(path.join(target.root, ...target.relative.split('/')))
    return stat.isFile() ? { size: stat.size } : null
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

/**
 * The live detail of a test run: the parsed index, its warnings, each scenario with its fingerprint and the refs whose file is absent
 * (or is not a regular file). 422 when `test-run.json` is missing or invalid, or a root escapes the checkout.
 */
export async function deriveRunDetail(manifest: TestRunManifest, now: () => string = () => new Date().toISOString()): Promise<TestRunDetail> {
  const loaded = await loadRunIndex(manifest.run.path)
  if (loaded === null) throw invalidStoreFile(`test run ${manifest.id}: ${TEST_RUN_INDEX_FILE} is missing from ${manifest.run.path} (publish in progress?)`)
  if (!loaded.ok) throw invalidStoreFile(`test run ${manifest.id}: ${loaded.error}`)
  const { index } = loaded
  const roots = await resolveRoots(manifest, index)
  const warnings = [...loaded.warnings]

  const refs = [...new Set(allRefs(index).map((ref) => normalizeRef(ref) ?? ref))].sort()
  const stats = new Map<string, RefStat>()
  await Promise.all(
    refs.map(async (ref) => {
      stats.set(ref, await statRef(roots, ref))
    }),
  )
  const missing: string[] = []
  for (const ref of refs) {
    const alias = ref.slice(0, ref.indexOf(':'))
    if (!(alias in roots)) warnings.push(`${ref}: no root named "${alias}" in the index`)
    else if (stats.get(ref) === null) missing.push(ref)
  }

  const scenarios = index.scenarios
    .map((scenario, position) => ({ scenario, position }))
    .sort((a, b) => a.scenario.order - b.scenario.order || a.position - b.position)
    .map(({ scenario }) => ({ ...scenario, fingerprint: scenarioFingerprint(scenario, stats) }))
  return { kind: 'test-run', manifest, index, warnings, scenarios, missing, computedAt: now() }
}
