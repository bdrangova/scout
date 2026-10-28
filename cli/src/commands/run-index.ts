// `ai-review run-index validate|show <runPath>`: checks `<runPath>/test-run.json` (the index the publish skills write).
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { parseRunRef, TestRunIndexSchema, TEST_RUN_INDEX_FILE, type TestRunIndex } from '@scout/shared'

export interface RunIndexReport {
  /** Zod and alias problems; any entry makes the index invalid. */
  errors: string[]
  /** Unsupported panels, dangling gap/bug links and referenced files that do not exist. */
  warnings: string[]
  scenarios: number
  refs: number
  missing: number
  index: TestRunIndex | null
}

function zodIssueLines(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.')}: ${issue.message}`)
}

/** Every `alias:path` the index mentions, each with where it appears. */
function collectRefs(index: TestRunIndex): Map<string, string> {
  const refs = new Map<string, string>()
  const add = (ref: string | undefined, where: string): void => {
    if (ref !== undefined && !refs.has(ref)) refs.set(ref, where)
  }
  index.overview.forEach((panel, i) => {
    const where = `overview.${i}`
    if (panel.type === 'gallery') panel.items.forEach((item) => add(item.path, where))
    else if (panel.type === 'video' || panel.type === 'log') add(panel.path, where)
    else if (panel.type === 'links') panel.items.forEach((item) => add(item.ref, where))
  })
  for (const scenario of index.scenarios) {
    const where = `scenarios.${scenario.id}`
    for (const items of [scenario.evidence.videos, scenario.evidence.screenshots, scenario.evidence.data]) {
      items.forEach((item) => add(item.path, where))
    }
    scenario.logs.forEach((log) => add(log.path, where))
  }
  for (const bug of index.bugs ?? []) {
    add(bug.path, `bugs.${bug.slug}`)
    bug.screenshots.forEach((ref) => add(ref, `bugs.${bug.slug}`))
  }
  index.dataSetup?.videos.forEach((item) => add(item.path, 'dataSetup'))
  index.dataSetup?.screenshots.forEach((item) => add(item.path, 'dataSetup'))
  index.logs?.forEach((log) => add(log.path, 'logs'))
  return refs
}

function linkWarnings(index: TestRunIndex): string[] {
  const warnings: string[] = []
  const gapIds = new Set((index.gaps ?? []).map((gap) => gap.id))
  const bugSlugs = new Set((index.bugs ?? []).map((bug) => bug.slug))
  const scenarioIds = new Set(index.scenarios.map((scenario) => scenario.id))
  for (const scenario of index.scenarios) {
    for (const id of scenario.links.gaps) if (!gapIds.has(id)) warnings.push(`scenarios.${scenario.id}.links.gaps: unknown gap ${id}`)
    for (const slug of scenario.links.bugs) if (!bugSlugs.has(slug)) warnings.push(`scenarios.${scenario.id}.links.bugs: unknown bug ${slug}`)
  }
  for (const gap of index.gaps ?? []) {
    for (const id of gap.scenarios) if (!scenarioIds.has(id)) warnings.push(`gaps.${gap.id}.scenarios: unknown scenario ${id}`)
  }
  for (const bug of index.bugs ?? []) {
    for (const id of bug.scenarios) if (!scenarioIds.has(id)) warnings.push(`bugs.${bug.slug}.scenarios: unknown scenario ${id}`)
  }
  return warnings
}

async function isFile(file: string): Promise<boolean> {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  )
}

/** Parses the index and checks aliases and files; never throws for a bad index (see `errors`). */
export async function checkRunIndex(runPath: string): Promise<RunIndexReport> {
  const file = path.join(runPath, TEST_RUN_INDEX_FILE)
  const report: RunIndexReport = { errors: [], warnings: [], scenarios: 0, refs: 0, missing: 0, index: null }
  let json: unknown
  try {
    json = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    report.errors.push(error instanceof SyntaxError ? `${file}: invalid JSON (${error.message})` : `${file}: cannot read (${(error as { code?: string }).code ?? String(error)})`)
    return report
  }
  const parsed = TestRunIndexSchema.safeParse(json)
  if (!parsed.success) {
    report.errors.push(...zodIssueLines(parsed.error))
    return report
  }
  const index = parsed.data
  report.index = index
  report.scenarios = index.scenarios.length
  index.overview.forEach((panel, i) => {
    if (panel.type === 'unsupported') report.warnings.push(`overview.${i}: unsupported panel "${panel.originalType}" (${panel.reason})`)
  })
  report.warnings.push(...linkWarnings(index))
  const refs = collectRefs(index)
  report.refs = refs.size
  for (const [ref, where] of refs) {
    const parsedRef = parseRunRef(ref)
    const root = parsedRef === null ? undefined : index.roots[parsedRef.alias]
    if (parsedRef === null || root === undefined) {
      report.errors.push(`${where}: ref "${ref}" uses an alias that is not in roots (${Object.keys(index.roots).join(', ')})`)
      continue
    }
    if (!(await isFile(path.resolve(runPath, root, parsedRef.path)))) {
      report.missing += 1
      report.warnings.push(`${where}: missing file ${ref}`)
    }
  }
  return report
}

/** `S1  pass  Title  [L1-2 pass, L3 pass]  3v 4s 1r 2d 1l` */
export function formatScenarioTable(index: TestRunIndex): string {
  const rows = [...index.scenarios]
    .sort((a, b) => a.order - b.order)
    .map((scenario) => {
      const layers = scenario.layers?.map((layer) => `${layer.name} ${layer.status}`).join(', ') ?? ''
      const e = scenario.evidence
      const evidence = `${e.videos.length}v ${e.screenshots.length}s ${e.data.length}d ${scenario.logs.length}l`
      return [scenario.id, scenario.status, scenario.title, layers, evidence]
    })
  const header = ['id', 'status', 'title', 'layers', 'evidence']
  const widths = header.map((_, col) => Math.max(...[header, ...rows].map((row) => (row[col] ?? '').length)))
  const line = (row: string[]): string => row.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  ').trimEnd()
  return [line(header), ...rows.map(line)].join('\n')
}

interface ShowFlags {
  format: string
}

export function registerRunIndex(program: Command): void {
  const command = program.command('run-index').description('Check or show the test-run index')

  command
    .command('validate')
    .argument('<runPath>', 'the run folder')
    .description('Validate <runPath>/test-run.json (exit 1 on schema issues; missing files warn)')
    .action(async (runPath: string) => {
      const report = await checkRunIndex(path.resolve(runPath))
      for (const warning of report.warnings) console.error(`warning: ${warning}`)
      if (report.errors.length > 0) {
        for (const error of report.errors) console.error(`error: ${error}`)
        process.exitCode = 1
        return
      }
      console.log(`${report.scenarios} scenarios, ${report.refs} refs, ${report.missing} missing`)
    })

  command
    .command('show')
    .argument('<runPath>', 'the run folder')
    .description('Print the validated index as json, or brief scenario table')
    .option('--format <format>', 'json | brief', 'brief')
    .action(async (runPath: string, flags: ShowFlags) => {
      if (flags.format !== 'json' && flags.format !== 'brief') throw new Error(`--format must be json or brief, got "${flags.format}"`)
      const report = await checkRunIndex(path.resolve(runPath))
      if (report.index === null) {
        for (const error of report.errors) console.error(`error: ${error}`)
        process.exitCode = 1
        return
      }
      console.log(flags.format === 'json' ? JSON.stringify(report.index, null, 2) : `${report.index.title} (${report.index.runId})\n${formatScenarioTable(report.index)}`)
    })
}
