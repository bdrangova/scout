// `ai-review run-index merge`: applies one publish skill's patch to `<run>/test-run.json`, enforcing which keys that skill owns.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { TEST_RUN_INDEX_FILE, TEST_RUN_INDEX_SCHEMA_VERSION } from '@scout/shared'
import { deriveFeatureArea } from './init-test-run.ts'

export const INDEX_OWNERS = ['plan', 'data-setup', 'run'] as const
export type IndexOwner = (typeof INDEX_OWNERS)[number]

type Obj = Record<string, unknown>

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const PUBLISHED_BY_KEY: Record<IndexOwner, 'plan' | 'dataSetup' | 'run'> = { plan: 'plan', 'data-setup': 'dataSetup', run: 'run' }

const TOP_KEYS: Record<IndexOwner, readonly string[]> = {
  plan: ['title', 'feature', 'area', 'roots', 'scenarios', 'overview', 'removePanels', 'hashes'],
  'data-setup': ['dataSetup', 'pages', 'removePages', 'hashes'],
  run: ['scenarios', 'gaps', 'bugs', 'logs', 'roots', 'pages', 'removePages', 'overview', 'removePanels', 'hashes'],
}
const SCENARIO_KEYS: Record<IndexOwner, readonly string[]> = {
  plan: ['id', 'title', 'order', 'steps'],
  'data-setup': [],
  run: ['id', 'status', 'layers', 'steps', 'evidence', 'logs', 'links', 'notes'],
}
/** A run patch may name `title`/`order` only for a scenario the index does not have yet. */
const NEW_SCENARIO_EXTRA_KEYS = ['title', 'order']
const ROOT_KEYS: Record<IndexOwner, readonly string[]> = { plan: ['plan', 'run'], 'data-setup': [], run: ['bugs'] }
const PAGE_KEYS: Record<IndexOwner, readonly string[]> = { plan: [], 'data-setup': ['data-setup'], run: ['gaps', 'logs'] }

/** Panel titles in dashboard order; a title an owner owns is replaced by title, any other panel is kept. */
const PANEL_ORDER = ['Plan summary', 'Plan', 'Test split', 'Results', 'Layer results', 'Run notes and deviations', 'Scenarios'] as const
const PANEL_TITLES: Record<IndexOwner, readonly string[]> = {
  plan: ['Plan summary', 'Plan', 'Test split'],
  'data-setup': [],
  run: ['Results', 'Layer results', 'Run notes and deviations', 'Scenarios'],
}

const STEP_RESULT_KEYS = ['observed', 'result']

function unowned(keys: Iterable<string>, owned: readonly string[]): string[] {
  return [...keys].filter((key) => !owned.includes(key))
}

function stringList(value: unknown, where: string, errors: string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${where}: expected an array of strings`)
    return []
  }
  return value as string[]
}

function hasStepResult(step: unknown): boolean {
  return isObj(step) && STEP_RESULT_KEYS.some((key) => step[key] !== undefined)
}

function planSteps(existing: unknown, patch: unknown[]): unknown[] {
  const old = Array.isArray(existing) ? existing : []
  const merged = patch.map((step, i) => {
    const before = old[i]
    if (!hasStepResult(before) || !isObj(before) || !isObj(step)) return step
    const next: Obj = { ...before }
    for (const key of ['action', 'expected']) if (step[key] !== undefined) next[key] = step[key]
    return next
  })
  return [...merged, ...old.slice(patch.length).filter(hasStepResult)]
}

function runSteps(existing: unknown, patch: unknown[]): unknown[] {
  const old = Array.isArray(existing) ? existing : []
  return patch.map((step, i) => (isObj(old[i]) && isObj(step) ? { ...old[i], ...step } : step))
}

function newScenario(id: string, position: number): Obj {
  return { id, title: id, status: 'planned', order: position, evidence: { videos: [], screenshots: [], data: [] }, logs: [], links: { gaps: [], bugs: [] } }
}

function mergeScenarios(owner: IndexOwner, index: Obj, patch: unknown[], errors: string[]): void {
  const existing = Array.isArray(index['scenarios']) ? (index['scenarios'] as unknown[]) : []
  const scenarios: unknown[] = [...existing]
  const seen = new Set<string>()
  patch.forEach((raw, i) => {
    const where = `scenarios.${i}`
    if (!isObj(raw) || typeof raw['id'] !== 'string') {
      errors.push(`${where}: expected an object with a string id`)
      return
    }
    const id = raw['id']
    if (seen.has(id)) errors.push(`${where}: duplicate id ${id}`)
    seen.add(id)
    const at = scenarios.findIndex((scenario) => isObj(scenario) && scenario['id'] === id)
    const isNew = at === -1
    const owned = owner === 'run' && isNew ? [...SCENARIO_KEYS.run, ...NEW_SCENARIO_EXTRA_KEYS] : SCENARIO_KEYS[owner]
    const bad = unowned(Object.keys(raw), owned)
    if (bad.length > 0) {
      errors.push(`${where} (${id}): the ${owner} owner cannot set ${bad.join(', ')}`)
      return
    }
    if (raw['steps'] !== undefined && !Array.isArray(raw['steps'])) {
      errors.push(`${where} (${id}): steps must be an array`)
      return
    }
    const current = !isNew && isObj(scenarios[at]) ? { ...(scenarios[at] as Obj) } : newScenario(id, scenarios.length)
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'id' || value === undefined) continue
      if (key === 'steps') current[key] = (owner === 'plan' ? planSteps : runSteps)(current[key], value as unknown[])
      else if (key === 'evidence' || key === 'links') current[key] = { ...(isObj(current[key]) ? current[key] : {}), ...(isObj(value) ? value : {}) }
      else current[key] = value
    }
    if (isNew) scenarios.push(current)
    else scenarios[at] = current
  })
  index['scenarios'] = scenarios
}

function panelRank(title: unknown): number {
  const at = PANEL_ORDER.findIndex((known) => known === title)
  return at === -1 ? PANEL_ORDER.length : at
}

function mergePanels(owner: IndexOwner, index: Obj, patch: unknown, remove: unknown, errors: string[]): void {
  const owned = PANEL_TITLES[owner]
  const incoming: Obj[] = []
  if (patch !== undefined) {
    if (!Array.isArray(patch)) errors.push('overview: expected an array of panels')
    else {
      patch.forEach((panel, i) => {
        const title = isObj(panel) ? panel['title'] : undefined
        if (!isObj(panel) || typeof title !== 'string') errors.push(`overview.${i}: a panel needs a title`)
        else if (!owned.includes(title)) errors.push(`overview.${i}: the ${owner} owner cannot set the panel "${title}" (owns ${owned.join(', ') || 'none'})`)
        else if (incoming.some((other) => other['title'] === title)) errors.push(`overview.${i}: duplicate panel "${title}"`)
        else incoming.push(panel)
      })
    }
  }
  const removed = stringList(remove, 'removePanels', errors)
  for (const title of removed) if (!owned.includes(title)) errors.push(`removePanels: the ${owner} owner cannot remove "${title}"`)
  if (errors.length > 0) return
  const dropTitles = new Set([...removed, ...incoming.map((panel) => panel['title'])])
  const old = Array.isArray(index['overview']) ? (index['overview'] as unknown[]) : []
  const kept = old.filter((panel) => !(isObj(panel) && dropTitles.has(panel['title'])))
  const all = [...kept, ...incoming].map((panel, position) => ({ panel, position }))
  all.sort((a, b) => panelRank(isObj(a.panel) ? a.panel['title'] : undefined) - panelRank(isObj(b.panel) ? b.panel['title'] : undefined) || a.position - b.position)
  index['overview'] = all.map((entry) => entry.panel)
}

function mergePages(owner: IndexOwner, index: Obj, patch: Obj, errors: string[]): void {
  const add = stringList(patch['pages'], 'pages', errors)
  const remove = stringList(patch['removePages'], 'removePages', errors)
  for (const page of add) if (!PAGE_KEYS[owner].includes(page)) errors.push(`pages: the ${owner} owner cannot add "${page}"`)
  for (const page of remove) if (!PAGE_KEYS[owner].includes(page)) errors.push(`removePages: the ${owner} owner cannot remove "${page}"`)
  if (errors.length > 0) return
  const pages = new Set<unknown>(Array.isArray(index['pages']) ? (index['pages'] as unknown[]) : [])
  for (const page of add) pages.add(page)
  for (const page of remove) if (!add.includes(page)) pages.delete(page)
  index['pages'] = [...pages]
}

/** The index a first publish starts from. */
export function indexSkeleton(runPath: string, nowIso: string): Obj {
  const { feature, area } = deriveFeatureArea(runPath)
  const name = path.basename(runPath)
  return {
    schemaVersion: TEST_RUN_INDEX_SCHEMA_VERSION,
    runId: name,
    title: name,
    feature,
    area,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedBy: {},
    roots: { run: '.', plan: '../..' },
    pages: [],
    overview: [],
    scenarios: [],
  }
}

export interface MergeResult {
  /** The merged object, or null when the patch was rejected. */
  index: Obj | null
  errors: string[]
}

/** Applies `patch` as `owner` to `existing` (or a fresh skeleton). Pure; reports every rejected key and writes nothing. */
export function mergeRunIndex(options: { runPath: string; owner: IndexOwner; existing: Obj | null; patch: unknown; now: Date }): MergeResult {
  const { owner, patch } = options
  const nowIso = options.now.toISOString()
  if (!isObj(patch)) return { index: null, errors: ['patch: expected a JSON object'] }
  const errors: string[] = []
  const badTop = unowned(Object.keys(patch), TOP_KEYS[owner])
  if (badTop.length > 0) errors.push(`patch: the ${owner} owner cannot set ${badTop.join(', ')} (owns ${TOP_KEYS[owner].join(', ')})`)

  const index: Obj = structuredClone(options.existing ?? indexSkeleton(options.runPath, nowIso))
  for (const key of ['title', 'feature', 'area'] as const) {
    if (patch[key] === undefined || badTop.includes(key)) continue
    index[key] = patch[key]
  }
  if (isObj(patch['roots'])) {
    const badRoots = unowned(Object.keys(patch['roots']), ROOT_KEYS[owner])
    if (badRoots.length > 0) errors.push(`roots: the ${owner} owner cannot set ${badRoots.join(', ')}`)
    else index['roots'] = { ...(isObj(index['roots']) ? index['roots'] : {}), ...patch['roots'] }
  } else if (patch['roots'] !== undefined && !badTop.includes('roots')) errors.push('roots: expected an object')
  index['roots'] = { ...(isObj(index['roots']) ? index['roots'] : {}), run: '.' }

  if (patch['scenarios'] !== undefined && !badTop.includes('scenarios')) {
    if (Array.isArray(patch['scenarios'])) mergeScenarios(owner, index, patch['scenarios'], errors)
    else errors.push('scenarios: expected an array')
  }
  if (owner === 'run') {
    for (const key of ['gaps', 'bugs', 'logs'] as const) {
      if (patch[key] === undefined) continue
      if (Array.isArray(patch[key])) index[key] = patch[key]
      else errors.push(`${key}: expected an array`)
    }
  }
  if (owner === 'data-setup' && patch['dataSetup'] !== undefined) {
    if (patch['dataSetup'] === null) delete index['dataSetup']
    else if (isObj(patch['dataSetup'])) index['dataSetup'] = patch['dataSetup']
    else errors.push('dataSetup: expected an object or null')
  }
  if (TOP_KEYS[owner].includes('overview')) mergePanels(owner, index, patch['overview'], patch['removePanels'], errors)
  if (TOP_KEYS[owner].includes('pages')) mergePages(owner, index, patch, errors)

  const hashes = patch['hashes']
  if (hashes !== undefined && !isObj(hashes)) errors.push('hashes: expected an object of key to hash')
  if (errors.length > 0) return { index: null, errors }

  const published = isObj(index['publishedBy']) ? { ...index['publishedBy'] } : {}
  published[PUBLISHED_BY_KEY[owner]] = hashes === undefined ? { at: nowIso } : { at: nowIso, hashes }
  index['publishedBy'] = published
  index['updatedAt'] = nowIso
  return { index, errors: [] }
}

/** Reads `<run>/test-run.json`; null when it does not exist, an error string when it is not a JSON object. */
export async function readIndexFile(runPath: string): Promise<{ index: Obj | null; error: string | null }> {
  const file = path.join(runPath, TEST_RUN_INDEX_FILE)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return { index: null, error: null }
    return { index: null, error: `${file}: cannot read (${(error as { code?: string }).code ?? String(error)})` }
  }
  try {
    const json: unknown = JSON.parse(text)
    return isObj(json) ? { index: json, error: null } : { index: null, error: `${file}: expected a JSON object` }
  } catch (error) {
    return { index: null, error: `${file}: invalid JSON (${error instanceof Error ? error.message : String(error)})` }
  }
}

/** 2-space JSON to `test-run.json.tmp`, then a rename over `test-run.json`. */
export async function writeIndexFile(runPath: string, index: Obj): Promise<void> {
  const file = path.join(runPath, TEST_RUN_INDEX_FILE)
  await mkdir(runPath, { recursive: true })
  await writeFile(`${file}.tmp`, `${JSON.stringify(index, null, 2)}\n`)
  await rename(`${file}.tmp`, file)
}
