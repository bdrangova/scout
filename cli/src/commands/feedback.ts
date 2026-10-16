// `ai-review feedback <id>`: the latest sent review, as the dashboard rendered it (review/sent/<stem>.md|.json).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { listSentStems, SENT_DIR } from '../sessions.ts'
import { manifestExists, resolveHome, sessionDir } from '../store.ts'

export type FeedbackFormat = 'markdown' | 'json'

export interface Feedback {
  /** `<sentAt with ':' → '-'>`, the shared file stem of the `.json`, `.md` and `.patch`. */
  stem: string
  file: string
  content: string
}

/** The most recent `review/sent/<stem>.<md|json>`; throws when nothing was sent yet. */
export async function readLatestFeedback(options: { home: string; id: string; format: FeedbackFormat }): Promise<Feedback> {
  const dir = sessionDir(options.home, options.id)
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  const stems = await listSentStems(dir)
  const stem = stems[stems.length - 1]
  if (stem === undefined) throw new Error(`no feedback sent yet for session ${options.id} (nothing under ${path.join(dir, SENT_DIR)})`)
  const file = path.join(dir, SENT_DIR, `${stem}.${options.format === 'json' ? 'json' : 'md'}`)
  return { stem, file, content: await readFile(file, 'utf8') }
}

interface FeedbackFlags {
  format: string
}

export function registerFeedback(program: Command): void {
  program
    .command('feedback')
    .argument('<id>', 'session id')
    .description('Print the latest feedback the reviewer sent (review/sent/<stem>.md, or the .json snapshot)')
    .option('--format <format>', 'markdown | json', 'markdown')
    .action(async (id: string, flags: FeedbackFlags) => {
      if (flags.format !== 'markdown' && flags.format !== 'json') throw new Error(`--format must be markdown or json, got "${flags.format}"`)
      const feedback = await readLatestFeedback({ home: resolveHome(), id, format: flags.format })
      process.stdout.write(feedback.content.endsWith('\n') ? feedback.content : `${feedback.content}\n`)
    })
}
