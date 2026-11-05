// `scout feedback <id>`: the latest sent review, as the dashboard rendered it (review/sent/<stem>.md|.json).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { isTestRunSent, renderTestRunSentMarkdown, runFolderOf, SentSnapshotSchema, TestRunIndexSchema, TEST_RUN_INDEX_FILE, type TestRunIndex, type TestRunSentSnapshot } from '@scout/shared'
import { dashboardOrigin, readConfig } from '../config.ts'
import { listSentStems, SENT_DIR } from '../sessions.ts'
import { manifestExists, readManifest, resolveHome, sessionDir } from '../store.ts'

export type FeedbackFormat = 'markdown' | 'json'

export interface Feedback {
  /** `<sentAt with ':' → '-'>`, the shared file stem of the `.json`, `.md` and `.patch`. */
  stem: string
  file: string
  content: string
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null
    throw error
  }
}

/** Bug and log names for the renderer, from `<run>/test-run.json`; empty when the index is missing or invalid. */
async function readIndexNames(runPath: string): Promise<Pick<TestRunIndex, 'bugs' | 'logs'>> {
  const raw = await readIfExists(path.join(runPath, TEST_RUN_INDEX_FILE))
  if (raw === null) return {}
  try {
    const parsed = TestRunIndexSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { bugs: parsed.data.bugs, logs: parsed.data.logs } : {}
  } catch {
    return {}
  }
}

/** Renders a test-run snapshot the way the dashboard does when it wrote no `.md` next to it. */
async function renderTestRunFeedback(options: { home: string; id: string; snapshot: TestRunSentSnapshot }): Promise<string> {
  const dir = sessionDir(options.home, options.id)
  const manifest = await readManifest(dir)
  const runPath = runFolderOf(dir)
  return renderTestRunSentMarkdown(options.snapshot, {
    title: manifest.title,
    dashboardUrl: dashboardOrigin(await readConfig(options.home)),
    index: await readIndexNames(runPath),
  })
}

/**
 * The most recent `review/sent/<stem>.<md|json>`; throws when nothing was sent yet. The `.md` on disk is preferred; a test-run
 * snapshot without one is rendered from its `.json` (both snapshot shapes are read).
 */
export async function readLatestFeedback(options: { home: string; id: string; format: FeedbackFormat }): Promise<Feedback> {
  const dir = sessionDir(options.home, options.id)
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  const stems = await listSentStems(dir)
  const stem = stems[stems.length - 1]
  if (stem === undefined) throw new Error(`no feedback sent yet for session ${options.id} (nothing under ${path.join(dir, SENT_DIR)})`)
  const jsonFile = path.join(dir, SENT_DIR, `${stem}.json`)
  const file = options.format === 'json' ? jsonFile : path.join(dir, SENT_DIR, `${stem}.md`)
  const content = await readIfExists(file)
  if (content !== null) return { stem, file, content }
  if (options.format === 'markdown') {
    const snapshot = SentSnapshotSchema.safeParse(JSON.parse(await readFile(jsonFile, 'utf8')))
    if (snapshot.success && isTestRunSent(snapshot.data)) {
      return { stem, file, content: await renderTestRunFeedback({ home: options.home, id: options.id, snapshot: snapshot.data }) }
    }
  }
  throw new Error(`${file} not found`)
}

interface FeedbackFlags {
  format: string
}

export function registerFeedback(program: Command): void {
  program
    .command('feedback')
    .argument('<id>', 'session id')
    .description('Print the latest feedback sent by the reviewer')
    .option('--format <format>', 'markdown | json', 'markdown')
    .action(async (id: string, flags: FeedbackFlags) => {
      if (flags.format !== 'markdown' && flags.format !== 'json') throw new Error(`--format must be markdown or json, got "${flags.format}"`)
      const feedback = await readLatestFeedback({ home: resolveHome(), id, format: flags.format })
      process.stdout.write(feedback.content.endsWith('\n') ? feedback.content : `${feedback.content}\n`)
    })
}
