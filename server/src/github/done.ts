import path from 'node:path'
import { GITHUB_DONE_FILE, GithubDoneSchema } from '@scout/shared'
import type { GithubDone } from '@scout/shared'
import { readTextIfExists, writeFileAtomic } from '../store/fs.ts'
import { KeyedLock } from '../store/lock.ts'
import { prKey } from './pr-url.ts'

/**
 * The lists of `<home>/github-done.json`: `prs` are Done (reviewed and commented), `ignored` are skipped on purpose, `undone`
 * were reopened by hand (your approvals before that time no longer close them).
 */
export type PrMarkList = 'prs' | 'ignored' | 'undone'

const EMPTY: GithubDone = { prs: [], ignored: [], undone: [] }

// Read-modify-write of the one file, so concurrent marks don't drop each other.
const lock = new KeyedLock()

/** `<home>/github-done.json`; missing or invalid reads as no marks. */
async function readMarks(home: string): Promise<GithubDone> {
  const text = await readTextIfExists(path.join(home, GITHUB_DONE_FILE))
  if (text === null) return EMPTY
  try {
    const parsed = GithubDoneSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : EMPTY
  } catch {
    return EMPTY
  }
}

function writeMarks(home: string, marks: GithubDone): Promise<void> {
  return writeFileAtomic(path.join(home, GITHUB_DONE_FILE), `${JSON.stringify(marks, null, 2)}\n`)
}

/** Normalised PR key → when it was marked, per list. */
export async function prMarks(home: string): Promise<Record<PrMarkList, Map<string, string>>> {
  const marks = await readMarks(home)
  const keyed = (list: PrMarkList) => new Map(marks[list].flatMap((pr) => {
    const key = prKey(pr.url)
    return key === null ? [] : [[key, pr.doneAt] as const]
  }))
  return { prs: keyed('prs'), ignored: keyed('ignored'), undone: keyed('undone') }
}

export function addMark(home: string, list: PrMarkList, url: string, now: Date): Promise<void> {
  return lock.run(home, async () => {
    const marks = await readMarks(home)
    const key = prKey(url)
    // Marking again moves the time forward (a later reopen covers later approvals).
    const kept = marks[list].filter((pr) => prKey(pr.url) !== key)
    await writeMarks(home, { ...marks, [list]: [...kept, { url, doneAt: now.toISOString() }] })
  })
}

export function removeMark(home: string, list: PrMarkList, url: string): Promise<void> {
  return lock.run(home, async () => {
    const marks = await readMarks(home)
    const key = prKey(url)
    const kept = marks[list].filter((pr) => prKey(pr.url) !== key)
    if (kept.length !== marks[list].length) await writeMarks(home, { ...marks, [list]: kept })
  })
}
