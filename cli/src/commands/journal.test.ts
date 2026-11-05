import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { JournalSchema, type Journal } from '@scout/shared'
import { gitText } from '@scout/shared/git/run'
import { makeManifest } from '@scout/shared/testing/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sessionDir, writeJsonAtomic } from '../store.ts'
import { addJournalEntries, listJournal, parseAlternative, parseLineRange, readJournalInputs, supersedeJournalEntry } from './journal.ts'

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com' }
const run = (cwd: string, args: string[]) => gitText(cwd, args, { env: GIT_ENV })

let home: string
let repo: string

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'scout-journal-'))
  repo = path.join(home, 'repo')
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await run(repo, ['init', '-q', '-b', 'master'])
  await writeFile(path.join(repo, 'src', 'a.ts'), 'old one\nold two\nold three\n')
  await run(repo, ['add', '-A'])
  await run(repo, ['commit', '-q', '-m', 'base'])
  await run(repo, ['checkout', '-q', '-b', 'feature/x'])
  await writeFile(path.join(repo, 'src', 'a.ts'), 'new one\n  const retry = 3\nnew three\n')
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

async function readJournalFile(sessionId: string): Promise<Journal> {
  return JournalSchema.parse(JSON.parse(await readFile(path.join(sessionDir(home, sessionId), 'review', 'journal.json'), 'utf8')))
}

const add = (inputs: Parameters<typeof addJournalEntries>[0]['inputs'], id?: string) => addJournalEntries({ home, repo, id: id ?? null, inputs })

describe('journal add', () => {
  it('creates the session for the branch when none exists, titled with the branch name', async () => {
    const result = await add([{ kind: 'caveat', title: 'No retries yet', body: 'Later.' }])
    expect(result.created).toBe(true)
    expect(result.ids).toEqual(['j1'])
    const manifest = JSON.parse(await readFile(path.join(sessionDir(home, result.sessionId), 'manifest.json'), 'utf8')) as { title: string }
    expect(manifest.title).toBe('feature/x')
    const again = await add([{ kind: 'caveat', title: 'Second' }])
    expect(again.created).toBe(false)
    expect(again.sessionId).toBe(result.sessionId)
    expect(again.ids).toEqual(['j2'])
  })

  it('adds a file-level and a session-level entry without anchors', async () => {
    const result = await add([
      { kind: 'decision', title: 'Use a map', file: 'src/a.ts', alt: ['array scan::O(n) lookups'], related: 'src/b.ts, src/c.ts' },
      { kind: 'tradeoff', title: 'Session wide' },
    ])
    const journal = await readJournalFile(result.sessionId)
    expect(journal.nextId).toBe(3)
    expect(journal.entries[0]).toMatchObject({ id: 'j1', file: 'src/a.ts', alternatives: [{ option: 'array scan', whyNot: 'O(n) lookups' }], related: ['src/b.ts', 'src/c.ts'], body: '' })
    expect(journal.entries[0]?.anchor).toBeUndefined()
    expect(journal.entries[1]?.file).toBeNull()
  })

  it('captures the snippet from the working tree for the new side and from the merge base for the old side', async () => {
    const result = await add([
      { kind: 'implementation', title: 'Retry count', file: 'src/a.ts', line: 2 },
      { kind: 'decision', title: 'Range', file: 'src/a.ts', line: '1-3' },
      { kind: 'decision', title: 'Was two', file: 'src/a.ts', line: 2, side: 'old' },
    ])
    const [first, second, third] = (await readJournalFile(result.sessionId)).entries
    expect(first?.anchor).toEqual({ side: 'new', line: 2, snippet: 'const retry = 3' })
    expect(second?.anchor).toEqual({ side: 'new', line: 1, endLine: 3, snippet: 'new one' })
    expect(third?.anchor).toEqual({ side: 'old', line: 2, snippet: 'old two' })
  })

  it('rejects an out-of-range line, a line without a file and an anchored summary', async () => {
    await expect(add([{ kind: 'decision', title: 'x', file: 'src/a.ts', line: 9 }])).rejects.toThrow(/out of range/)
    await expect(add([{ kind: 'decision', title: 'x', line: 1 }])).rejects.toThrow(/--line needs --file/)
    await expect(add([{ kind: 'summary', title: 'x', file: 'src/a.ts', line: 1 }])).rejects.toThrow(/summary/)
    await expect(add([{ kind: 'decision', title: 'x', file: 'src/missing.ts', line: 1 }])).rejects.toThrow(/cannot read/)
  })

  it('a new summary for a file supersedes its live one', async () => {
    const first = await add([{ kind: 'summary', title: 'v1', file: 'src/a.ts' }])
    await add([{ kind: 'summary', title: 'other file', file: 'src/b.ts' }])
    await add([{ kind: 'summary', title: 'v2', file: 'src/a.ts' }])
    const journal = await readJournalFile(first.sessionId)
    expect(journal.entries.map((e) => [e.id, e.supersededBy])).toEqual([
      ['j1', 'j3'],
      ['j2', undefined],
      ['j3', undefined],
    ])
  })

  it('--supersedes replaces a named entry', async () => {
    const first = await add([{ kind: 'decision', title: 'old call' }])
    await add([{ kind: 'decision', title: 'new call', supersedes: 'j1' }])
    expect((await readJournalFile(first.sessionId)).entries[0]?.supersededBy).toBe('j2')
    await expect(add([{ kind: 'decision', title: 'again', supersedes: 'j1' }])).rejects.toThrow(/already superseded/)
    await expect(add([{ kind: 'decision', title: 'again', supersedes: 'j9' }])).rejects.toThrow(/unknown journal entry/)
  })

  it('adds many entries from one call in order and keeps ids unique', async () => {
    const result = await add([
      { kind: 'decision', title: 'a', file: 'src/a.ts', line: 1 },
      { kind: 'caveat', title: 'b' },
      { kind: 'tradeoff', title: 'c', alt: [{ option: 'x', whyNot: 'y' }] },
    ])
    expect(result.ids).toEqual(['j1', 'j2', 'j3'])
    expect((await readJournalFile(result.sessionId)).entries).toHaveLength(3)
  })

  it('reads entries from a --from file', async () => {
    const file = path.join(home, 'entries.json')
    await writeFile(file, JSON.stringify([{ kind: 'decision', title: 'a', file: 'src/a.ts', line: '1-2', alt: ['x::y'] }, { kind: 'caveat', title: 'b', related: ['src/a.ts'] }]))
    const result = await add(await readJournalInputs(file))
    expect(result.ids).toEqual(['j1', 'j2'])
    expect(result.entries[0]).toMatchObject({ anchor: { endLine: 2 }, alternatives: [{ option: 'x' }] })
    await writeFile(file, '[]')
    await expect(readJournalInputs(file)).rejects.toThrow()
  })

  it('rejects a test-run or pr-review session', async () => {
    const pr = makeManifest({ id: '20260926-1000-a-aaaa', kind: 'pr-review' })
    await writeJsonAtomic(path.join(sessionDir(home, pr.id), 'manifest.json'), pr)
    await expect(add([{ kind: 'caveat', title: 'x' }], pr.id)).rejects.toThrow(/not a code-review session/)
  })
})

describe('journal supersede and list', () => {
  it('supersedes by id and filters the list by file', async () => {
    const first = await add([
      { kind: 'decision', title: 'one', file: 'src/a.ts' },
      { kind: 'decision', title: 'two', file: 'src/b.ts' },
      { kind: 'decision', title: 'three', file: 'src/a.ts' },
    ])
    const journal = await supersedeJournalEntry({ home, id: first.sessionId, old: 'j1', by: 'j3' })
    expect(journal.entries[0]?.supersededBy).toBe('j3')
    await expect(supersedeJournalEntry({ home, id: first.sessionId, old: 'j3', by: 'j3' })).rejects.toThrow(/itself/)
    const listed = await listJournal({ home, repo, file: 'src/a.ts' })
    expect(listed.sessionId).toBe(first.sessionId)
    expect(listed.entries.map((e) => e.id)).toEqual(['j1', 'j3'])
  })

  it('lists nothing when the branch has no session', async () => {
    expect(await listJournal({ home, repo })).toEqual({ sessionId: null, entries: [] })
  })
})

describe('parsers', () => {
  it('parses alternatives and line ranges', () => {
    expect(parseAlternative('a :: b')).toEqual({ option: 'a', whyNot: 'b' })
    expect(() => parseAlternative('only option')).toThrow(/option::why not/)
    expect(parseLineRange('4')).toEqual({ line: 4 })
    expect(parseLineRange('4-9')).toEqual({ line: 4, endLine: 9 })
    expect(() => parseLineRange('9-4')).toThrow(/invalid --line/)
    expect(() => parseLineRange('x')).toThrow(/invalid --line/)
  })
})
