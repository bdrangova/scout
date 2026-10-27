import { access, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ManifestSchema, SCHEMA_VERSION, type Manifest, type Resolutions, type Review } from '@review-dash/shared'
import { gitText } from '@review-dash/shared/git/run'
import { makeComment, makeManifest, makeResolution, makeResolutions, makeReview } from '@review-dash/shared/testing/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeSettings } from '../settings-merge.ts'
import { archivedSessionDir, sessionDir, writeJsonAtomic } from '../store.ts'
import { archiveSession, deleteArchivedSession } from './archive.ts'
import { readLatestFeedback } from './feedback.ts'
import { initSession, parseTicket } from './init.ts'
import { installIntoRepo, MCP_ADD_ARGS, PERMISSION } from './install.ts'
import { sessionPath } from './path.ts'
import { pendingForRepo } from './pending.ts'
import { resolveComments } from './resolve.ts'
import { formatStatusBrief, sessionStatus } from './status.ts'

const T_NOW = '2026-09-27T09:00:00.000Z'
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  )
}

async function writeSession(home: string, m: Manifest, r: Review | null = null, res: Resolutions | null = null): Promise<string> {
  const dir = sessionDir(home, m.id)
  await writeJsonAtomic(path.join(dir, 'manifest.json'), m)
  if (r) await writeJsonAtomic(path.join(dir, 'review', 'review.json'), { ...r, sessionId: m.id })
  if (res) await writeJsonAtomic(path.join(dir, 'review', 'resolutions.json'), { ...res, sessionId: m.id })
  return dir
}

/** A repo with one commit on `master`, a bare origin holding it, and a feature branch checked out. */
async function makeRepo(parent: string, branch = 'feature/x'): Promise<{ repo: string; origin: string }> {
  const repo = path.join(parent, 'repo')
  const origin = path.join(parent, 'origin.git')
  await mkdir(repo, { recursive: true })
  const run = (cwd: string, args: string[]) => gitText(cwd, args, { env: GIT_ENV })
  await run(repo, ['init', '-q', '-b', 'master'])
  await writeFile(path.join(repo, 'a.txt'), 'a\n')
  await run(repo, ['add', '-A'])
  await run(repo, ['commit', '-q', '-m', 'base'])
  await run(parent, ['init', '-q', '--bare', origin])
  await run(repo, ['remote', 'add', 'origin', origin])
  await run(repo, ['push', '-q', '-u', 'origin', 'master'])
  await run(repo, ['checkout', '-q', '-b', branch])
  return { repo, origin }
}

let home: string
beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'ai-review-cmd-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('init', () => {
  it('writes a v2 manifest with the repo top level, origin/master as base and the folders, then reuses the session', async () => {
    const { repo, origin } = await makeRepo(home)
    const first = await initSession({
      home,
      repo: path.join(repo),
      title: 'QI-1: Thing',
      tickets: [parseTicket('QI-1=https://example.atlassian.net/browse/QI-1')],
      agentSession: 'claude-1',
      now: new Date(T_NOW),
    })
    expect(first.reused).toBe(false)
    expect(first.id).toMatch(/^20260927-\d{4}-qi-1-thing-[0-9a-f]{4}$/)
    expect(first.url).toBe(`http://scout.localhost:4546/s/${first.id}`)
    const manifest = ManifestSchema.parse(JSON.parse(await readFile(path.join(first.dir, 'manifest.json'), 'utf8')))
    expect(manifest).toEqual({
      schemaVersion: SCHEMA_VERSION,
      id: first.id,
      title: 'QI-1: Thing',
      createdAt: T_NOW,
      updatedAt: T_NOW,
      agent: { type: 'claude-code', sessionId: 'claude-1', cliVersion: null, entrypoint: 'cli' },
      repo: { path: (await gitText(repo, ['rev-parse', '--show-toplevel'])).trim(), remote: origin, branch: 'feature/x', baseRef: 'origin/master' },
      tickets: [{ key: 'QI-1', url: 'https://example.atlassian.net/browse/QI-1' }],
    })
    for (const sub of ['evidence', 'extras', 'spec', 'review']) expect(await exists(path.join(first.dir, sub))).toBe(true)

    const later = '2026-09-27T10:00:00.000Z'
    const second = await initSession({ home, repo, now: new Date(later) })
    expect(second.reused).toBe(true)
    expect(second.id).toBe(first.id)
    expect(second.manifest).toMatchObject({ title: 'QI-1: Thing', createdAt: T_NOW, updatedAt: later, tickets: manifest.tickets, agent: { sessionId: 'claude-1' } })

    const fresh = await initSession({ home, repo, fresh: true, now: new Date(later) })
    expect(fresh.reused).toBe(false)
    expect(fresh.id).not.toBe(first.id)
    expect(fresh.manifest.title).toBe('feature/x')
  })

  it('reuses an approved session with its file verdicts and comments, resetting only the decision; never an archived one', async () => {
    const { repo } = await makeRepo(home)
    const repoPath = (await gitText(repo, ['rev-parse', '--show-toplevel'])).trim()
    const m = makeManifest({ id: '20260926-1000-a-aaaa', repo: { path: repoPath, remote: null, branch: 'feature/x', baseRef: 'origin/master' } })
    const sent = { at: '2026-09-26T19:00:00.000Z', decision: 'approve' as const }
    const files = { 'a.txt': { verdict: 'approved' as const, fingerprint: '0123456789abcdef', viewed: true } }
    const comments = [makeComment({ id: 'c1', sentAt: sent.at, resolvedAt: sent.at })]
    await writeSession(home, m, makeReview({ files, comments, overall: { decision: 'approve' }, sent }))

    const reused = await initSession({ home, repo, now: new Date(T_NOW) })
    expect(reused).toMatchObject({ id: m.id, reused: true })
    const review = JSON.parse(await readFile(path.join(reused.dir, 'review', 'review.json'), 'utf8')) as Review
    expect(review).toMatchObject({ files, comments, overall: { decision: 'undecided' }, sent, updatedAt: T_NOW })

    await archiveSession({ home, id: m.id })
    const fresh = await initSession({ home, repo, now: new Date(T_NOW) })
    expect(fresh.reused).toBe(false)
    expect(fresh.id).not.toBe(m.id)
  })

  it('unapproves a file commented on since the previous init when reusing', async () => {
    const { repo } = await makeRepo(home)
    const repoPath = (await gitText(repo, ['rev-parse', '--show-toplevel'])).trim()
    const m = makeManifest({ id: '20260926-1000-a-aaaa', updatedAt: '2026-09-26T10:00:00.000Z', repo: { path: repoPath, remote: null, branch: 'feature/x', baseRef: 'origin/master' } })
    const approved = { verdict: 'approved' as const, fingerprint: '0123456789abcdef', viewed: true }
    const files = { 'a.txt': approved, 'b.txt': approved, 'c.txt': approved }
    const comments = [
      makeComment({ id: 'c1', target: { kind: 'file', ref: 'a.txt' }, createdAt: '2026-09-26T11:00:00.000Z' }),
      makeComment({ id: 'c2', target: { kind: 'file', ref: 'b.txt' }, createdAt: '2026-09-26T09:00:00.000Z' }),
    ]
    await writeSession(home, m, makeReview({ files, comments }))
    const reused = await initSession({ home, repo, now: new Date(T_NOW) })
    const review = JSON.parse(await readFile(path.join(reused.dir, 'review', 'review.json'), 'utf8')) as Review
    expect(review.files).toEqual({ 'a.txt': { verdict: 'none', fingerprint: null, viewed: true }, 'b.txt': approved, 'c.txt': approved })
  })

  it('keeps a request-changes decision when reusing', async () => {
    const { repo } = await makeRepo(home)
    const repoPath = (await gitText(repo, ['rev-parse', '--show-toplevel'])).trim()
    const m = makeManifest({ id: '20260926-1000-a-aaaa', repo: { path: repoPath, remote: null, branch: 'feature/x', baseRef: 'origin/master' } })
    const sent = { at: '2026-09-26T19:00:00.000Z', decision: 'request-changes' as const }
    await writeSession(home, m, makeReview({ overall: { decision: 'request-changes' }, sent }))
    const reused = await initSession({ home, repo, now: new Date(T_NOW) })
    expect(reused.reused).toBe(true)
    const review = JSON.parse(await readFile(path.join(reused.dir, 'review', 'review.json'), 'utf8')) as Review
    expect(review.overall.decision).toBe('request-changes')
    expect(review.updatedAt).not.toBe(T_NOW)
  })

  it('honours --base and rejects a base ref that does not exist', async () => {
    const { repo } = await makeRepo(home)
    const result = await initSession({ home, repo, base: 'master', now: new Date(T_NOW) })
    expect(result.manifest.repo.baseRef).toBe('master')
    await expect(initSession({ home, repo, base: 'origin/nope', fresh: true })).rejects.toThrow(/base ref "origin\/nope" does not exist/)
  })

  it('parses tickets', () => {
    expect(parseTicket('QI-1')).toEqual({ key: 'QI-1', url: null })
    expect(parseTicket('QI-1=https://x/y')).toEqual({ key: 'QI-1', url: 'https://x/y' })
    expect(() => parseTicket('=https://x')).toThrow(/invalid --ticket/)
  })
})

describe('path', () => {
  it('prints the session folder or one of its artifact folders', async () => {
    const m = makeManifest()
    const dir = await writeSession(home, m)
    expect(await sessionPath({ home, id: m.id })).toBe(dir)
    expect(await sessionPath({ home, id: m.id, kind: 'evidence' })).toBe(path.join(dir, 'evidence'))
    expect(await sessionPath({ home, id: m.id, kind: 'spec' })).toBe(path.join(dir, 'spec'))
    await expect(sessionPath({ home, id: m.id, kind: 'media' })).rejects.toThrow(/unknown folder "media"/)
    await expect(sessionPath({ home, id: '20260101-0000-nope-0000' })).rejects.toThrow(/manifest\.json/)
  })
})

describe('archive', () => {
  it('moves the folder to archive/ with archived.json, and --undo moves it back without the marker', async () => {
    const m = makeManifest()
    const dir = await writeSession(home, m, makeReview())
    const archived = archivedSessionDir(home, m.id)
    expect(await archiveSession({ home, id: m.id, now: new Date(T_NOW) })).toBe(archived)
    expect(await exists(dir)).toBe(false)
    expect(await exists(path.join(archived, 'review', 'review.json'))).toBe(true)
    expect(JSON.parse(await readFile(path.join(archived, 'archived.json'), 'utf8'))).toEqual({ archivedAt: T_NOW })
    await expect(archiveSession({ home, id: m.id })).rejects.toThrow(/not found/)
    await expect(sessionPath({ home, id: m.id })).rejects.toThrow(/manifest\.json/)

    expect(await archiveSession({ home, id: m.id, undo: true })).toBe(dir)
    expect(await exists(archived)).toBe(false)
    expect(await exists(path.join(dir, 'archived.json'))).toBe(false)
    expect(ManifestSchema.parse(JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))).id).toBe(m.id)
    await expect(archiveSession({ home, id: m.id, undo: true })).rejects.toThrow(/not archived/)
    await expect(archiveSession({ home, id: 'nope' })).rejects.toThrow(/not a session id/)
  })
})

describe('delete', () => {
  it('removes an archived session for good, refuses live or unknown ids, and leaves siblings alone', async () => {
    const m = makeManifest()
    const sibling = makeManifest({ id: '20260926-1100-sibling-cafe' })
    await writeSession(home, m, makeReview())
    await writeSession(home, sibling)
    await expect(deleteArchivedSession({ home, id: m.id })).rejects.toThrow(/is live, not archived/)
    expect(await exists(sessionDir(home, m.id))).toBe(true)

    const archived = await archiveSession({ home, id: m.id, now: new Date(T_NOW) })
    await archiveSession({ home, id: sibling.id, now: new Date(T_NOW) })
    expect(await deleteArchivedSession({ home, id: m.id })).toBe(archived)
    expect(await exists(archived)).toBe(false)
    expect(await exists(path.join(archivedSessionDir(home, sibling.id), 'manifest.json'))).toBe(true)
    await expect(deleteArchivedSession({ home, id: m.id })).rejects.toThrow(/not archived/)
    await expect(deleteArchivedSession({ home, id: '../sessions/x' })).rejects.toThrow(/not a session id/)
  })

  it('only removes the link when the archive entry is a symlink', async () => {
    const m = makeManifest({ id: '20260926-1200-linked-1e4d' })
    const real = path.join(home, 'elsewhere', m.id)
    await writeJsonAtomic(path.join(real, 'manifest.json'), m)
    await mkdir(path.dirname(archivedSessionDir(home, m.id)), { recursive: true })
    await symlink(real, archivedSessionDir(home, m.id))
    await deleteArchivedSession({ home, id: m.id })
    expect(await lstat(archivedSessionDir(home, m.id)).then(() => true, () => false)).toBe(false)
    expect(await exists(path.join(real, 'manifest.json'))).toBe(true)
  })
})

describe('feedback', () => {
  it('prints the latest sent markdown or json, and fails when nothing was sent', async () => {
    const m = makeManifest()
    const dir = await writeSession(home, m)
    await expect(readLatestFeedback({ home, id: m.id, format: 'markdown' })).rejects.toThrow(/no feedback sent yet/)
    const sent = path.join(dir, 'review', 'sent')
    await mkdir(sent, { recursive: true })
    await writeFile(path.join(sent, '2026-09-26T19-00-00.000Z.json'), '{"first":true}\n')
    await writeFile(path.join(sent, '2026-09-26T19-00-00.000Z.md'), '# first\n')
    await writeFile(path.join(sent, '2026-09-26T19-00-00.000Z.patch'), 'diff\n')
    await writeFile(path.join(sent, '2026-09-27T08-00-00.000Z.json'), '{"second":true}\n')
    await writeFile(path.join(sent, '2026-09-27T08-00-00.000Z.md'), '# second\n')
    const md = await readLatestFeedback({ home, id: m.id, format: 'markdown' })
    expect(md.stem).toBe('2026-09-27T08-00-00.000Z')
    expect(md.content).toBe('# second\n')
    const json = await readLatestFeedback({ home, id: m.id, format: 'json' })
    expect(JSON.parse(json.content)).toEqual({ second: true })
  })
})

describe('status', () => {
  it('describes the open session of the branch from the store files only', async () => {
    const { repo } = await makeRepo(home)
    const repoPath = (await gitText(repo, ['rev-parse', '--show-toplevel'])).trim()
    const m = makeManifest({ id: '20260926-1000-a-aaaa', repo: { path: repoPath, remote: null, branch: 'feature/x', baseRef: 'origin/master' } })
    const sent = { at: '2026-09-26T19:00:00.000Z', decision: 'request-changes' as const }
    await writeSession(
      home,
      m,
      makeReview({ sent, comments: [makeComment({ id: 'c1', sentAt: sent.at }), makeComment({ id: 'c2', target: { kind: 'overall', ref: null } })] }),
      makeResolutions({ c1: makeResolution() }),
    )
    const status = await sessionStatus({ home, repo })
    expect(status).toEqual({
      repo: repoPath,
      branch: 'feature/x',
      session: {
        id: m.id,
        title: m.title,
        dir: sessionDir(home, m.id),
        branch: 'feature/x',
        baseRef: 'origin/master',
        openComments: 1,
        sent,
        url: `http://scout.localhost:4546/s/${m.id}`,
      },
    })
    expect(formatStatusBrief(status)).toBe(
      `session ${m.id} "${m.title}" · branch feature/x · base origin/master · open comments: 1 · sent ${sent.at} (request-changes) · http://scout.localhost:4546/s/${m.id}`,
    )
    expect((await sessionStatus({ home, repo, id: m.id })).session?.id).toBe(m.id)
    await expect(sessionStatus({ home, repo, id: '20260101-0000-nope-0000' })).rejects.toThrow(/manifest\.json/)

    await gitText(repo, ['checkout', '-q', '-b', 'other'])
    expect(formatStatusBrief(await sessionStatus({ home, repo }))).toBe(`no open review session for other in ${repoPath}`)
  })
})

describe('resolve', () => {
  it('merges into resolutions.json (schemaVersion 2) and stamps at/updatedAt', async () => {
    const m = makeManifest()
    const dir = await writeSession(home, m, makeReview({ comments: [makeComment({ id: 'c1' }), makeComment({ id: 'c2', target: { kind: 'overall', ref: null } })] }))
    await resolveComments({ home, id: m.id, items: [{ comment: 'c1', status: 'resolved', note: 'Renamed.', files: ['src/a.tsx'] }], now: new Date(T_NOW) })
    const later = '2026-09-27T10:00:00.000Z'
    const { resolutions: merged } = await resolveComments({ home, id: m.id, items: [{ comment: 'c2', status: 'open', note: 'Question?' }], now: new Date(later) })
    expect(merged.schemaVersion).toBe(2)
    expect(merged.comments).toEqual({
      c1: { status: 'resolved', note: 'Renamed.', at: T_NOW, files: ['src/a.tsx'] },
      c2: { status: 'open', note: 'Question?', at: later, files: [] },
    })
    expect(merged.updatedAt).toBe(later)
    expect(JSON.parse(await readFile(path.join(dir, 'review', 'resolutions.json'), 'utf8'))).toEqual(merged)
  })

  it('unapproves the files of the answered comments', async () => {
    const m = makeManifest()
    const approved = { verdict: 'approved' as const, fingerprint: '0123456789abcdef', viewed: true }
    const comments = [makeComment({ id: 'c1' }), makeComment({ id: 'c2', target: { kind: 'file', ref: 'src/b.tsx' } })]
    const dir = await writeSession(home, m, makeReview({ files: { 'src/a.tsx': approved, 'src/b.tsx': approved }, comments }))
    await resolveComments({ home, id: m.id, items: [{ comment: 'c1', status: 'resolved', note: 'Renamed.' }], now: new Date(T_NOW) })
    const review = JSON.parse(await readFile(path.join(dir, 'review', 'review.json'), 'utf8')) as Review
    expect(review.files).toEqual({ 'src/a.tsx': { verdict: 'none', fingerprint: null, viewed: true }, 'src/b.tsx': approved })
    expect(review.updatedAt).toBe(T_NOW)
  })

  it('rejects unknown comment ids without writing', async () => {
    const m = makeManifest()
    const dir = await writeSession(home, m, makeReview({ comments: [makeComment({ id: 'c1' })] }))
    await expect(resolveComments({ home, id: m.id, items: [{ comment: 'c9', status: 'resolved', note: 'x' }] })).rejects.toThrow(/unknown comment c9/)
    expect(await exists(path.join(dir, 'review', 'resolutions.json'))).toBe(false)
  })
})

describe('pending', () => {
  it('lists sent sessions with open sent comments, quickly and with a stable fingerprint', async () => {
    const repo = path.join(home, 'repo')
    await mkdir(repo)
    const sent = { at: '2026-09-26T19:00:00.000Z', decision: 'request-changes' as const }
    const base = makeManifest().repo
    const a = makeManifest({ id: '20260926-1000-a-aaaa', title: 'A', repo: { ...base, path: repo } })
    const b = makeManifest({ id: '20260926-1100-b-bbbb', title: 'B', repo: { ...base, path: repo } })
    const c = makeManifest({ id: '20260926-1200-c-cccc', title: 'C', repo: { ...base, path: repo } })
    const other = makeManifest({ id: '20260926-1300-d-dddd', title: 'D', repo: { ...base, path: path.join(home, 'elsewhere') } })
    await writeSession(home, a, makeReview({ sent, comments: [makeComment({ id: 'c1', sentAt: sent.at }), makeComment({ id: 'c2', sentAt: sent.at }), makeComment({ id: 'c3' })] }))
    await writeSession(home, b, makeReview({ sent, comments: [makeComment({ id: 'c1', sentAt: sent.at })] }), makeResolutions({ c1: makeResolution() }))
    await writeSession(home, c, makeReview({ comments: [makeComment({ id: 'c1' })] }))
    await writeSession(home, other, makeReview({ sent, comments: [makeComment({ id: 'c1', sentAt: sent.at })] }))

    const started = performance.now()
    const first = await pendingForRepo({ home, repo })
    expect(performance.now() - started).toBeLessThan(300)
    expect(first.count).toBe(2)
    expect(first.sessions.map((s) => [s.id, s.openComments])).toEqual([[a.id, 2]])
    expect(first.sessions[0]?.url).toBe(`http://scout.localhost:4546/s/${a.id}`)
    expect(first.message).toContain(`/apply-review ${a.id}`)
    expect(first.fingerprint).toMatch(/^[0-9a-f]{16}$/)

    const second = await pendingForRepo({ home, repo })
    expect(second.fingerprint).toBe(first.fingerprint)

    await resolveComments({ home, id: a.id, items: [{ comment: 'c1', status: 'resolved', note: 'done' }] })
    const third = await pendingForRepo({ home, repo })
    expect(third.count).toBe(1)
    expect(third.fingerprint).not.toBe(first.fingerprint)
  })
})

describe('install', () => {
  // The .gitignore step asks git whether the settings file is ignored; keep the user's global
  // config and default excludes (~/.config/git/ignore may already ignore .claude) out of the picture.
  const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'XDG_CONFIG_HOME'] as const
  const savedEnv = new Map<string, string | undefined>()
  beforeEach(async () => {
    for (const key of ENV_KEYS) savedEnv.set(key, process.env[key])
    const emptyConfig = path.join(home, 'gitconfig')
    await writeFile(emptyConfig, '')
    await mkdir(path.join(home, 'xdg'), { recursive: true })
    process.env.GIT_CONFIG_GLOBAL = emptyConfig
    process.env.GIT_CONFIG_NOSYSTEM = '1'
    process.env.XDG_CONFIG_HOME = path.join(home, 'xdg')
  })
  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('preserves existing settings and is a no-op the second time', async () => {
    const repo = path.join(home, 'repo')
    await mkdir(path.join(repo, '.claude'), { recursive: true })
    await gitText(home, ['init', '-q', '-b', 'main', repo])
    const existing = {
      permissions: { allow: ['Bash(npm run *)', 'Read'], additionalDirectories: ['/x'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre', timeout: 15 }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/other.sh"' }] }],
      },
      env: { FOO: 'bar' },
    }
    const settingsFile = path.join(repo, '.claude', 'settings.local.json')
    await writeFile(settingsFile, JSON.stringify(existing, null, 2))

    const first = await installIntoRepo({ home, repo, claudeBin: null, pathDir: null, cliBundle: '/opt/review-dash/cli/dist/index.js', nodeBin: '/opt/node/bin/node' })
    expect(first.changed).toBe(true)
    const actions = Object.fromEntries(first.changes.map((c) => [c.path, c.action]))
    expect(actions['.claude/skills/publish-review/SKILL.md']).toBe('created')
    expect(actions['.claude/skills/apply-review/SKILL.md']).toBe('created')
    expect(actions['.claude/skills/address-pr-comments/SKILL.md']).toBe('created')
    expect(actions['.claude/skills/run-app/SKILL.md']).toBe('created')
    expect(actions['.agents/skills/run-app/SKILL.md']).toBe('created')
    expect(actions['.claude/skills/snapshot-db/SKILL.md']).toBe('created')
    expect(actions['.agents/skills/snapshot-db/SKILL.md']).toBe('created')
    expect(actions['.claude/skills/reproduce/SKILL.md']).toBe('created')
    expect(actions['.agents/skills/reproduce/SKILL.md']).toBe('created')
    expect(actions['.claude/skills/journal/SKILL.md']).toBe('created')
    expect(actions['.agents/skills/journal/SKILL.md']).toBe('created')
    expect(actions['.claude/hooks/ai_review_pending_feedback.sh']).toBe('created')
    expect(actions['.claude/settings.local.json']).toBe('updated')
    expect(actions['.gitignore']).toBe('created')
    expect(actions['claude mcp (user)']).toBe('skipped')
    expect(first.messages.join('\n')).toContain(`claude ${MCP_ADD_ARGS.join(' ')}`)
    expect(await exists(path.join(repo, '.claude', 'hooks', 'ai_review_publish_nudge.sh'))).toBe(false)

    const settings = JSON.parse(await readFile(settingsFile, 'utf8'))
    expect(settings.env).toEqual({ FOO: 'bar' })
    expect(settings.permissions.additionalDirectories).toEqual(['/x'])
    expect(settings.permissions.allow).toEqual(['Bash(npm run *)', 'Read', PERMISSION])
    expect(settings.hooks.PreToolUse).toEqual(existing.hooks.PreToolUse)
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2)
    expect(settings.hooks.UserPromptSubmit[0]).toEqual(existing.hooks.UserPromptSubmit[0])
    expect(settings.hooks.UserPromptSubmit[1]).toEqual({
      hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/ai_review_pending_feedback.sh"', timeout: 5 }],
    })
    expect(settings.hooks.Stop).toBeUndefined()

    const publish = await readFile(path.join(repo, '.claude', 'skills', 'publish-review', 'SKILL.md'), 'utf8')
    expect(publish).toContain('ai-review init --repo')
    expect(publish).toContain('ai-review path')
    expect(publish).not.toContain('ai-review publish')
    const apply = await readFile(path.join(repo, '.claude', 'skills', 'apply-review', 'SKILL.md'), 'utf8')
    expect(apply).toContain('!`ai-review feedback $0 --format markdown`')
    expect(apply).toContain('ai-review resolve <sessionId> --comment c<n> --status resolved')
    expect(apply).not.toMatch(/republish/i)
    expect(apply).toMatch(/Decision: \*\*APPROVE\*\*/)
    expect(apply).toContain('Bash(gh pr create *)')
    const addressPr = await readFile(path.join(repo, '.claude', 'skills', 'address-pr-comments', 'SKILL.md'), 'utf8')
    expect(addressPr).toContain('ai-review pr-sync $ARGUMENTS --json')
    expect(addressPr).toContain('ai-review pr-resolve <sessionId> --comment <id> --status addressed')
    expect(addressPr).toContain('Bash(ai-review pr-reply *)')
    expect(addressPr).toContain('--reply "<one or two sentences for the reviewer, written as the author>"')
    expect(addressPr).not.toMatch(/Bash\(gh /)
    const launcher = await readFile(path.join(home, 'bin', 'ai-review'), 'utf8')
    expect(launcher).toContain('exec "/opt/node/bin/node" "/opt/review-dash/cli/dist/index.js" "$@"')
    expect(JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8'))).toEqual({ port: 4546 })
    expect(await readFile(path.join(repo, '.gitignore'), 'utf8')).toBe('.claude/settings.local.json\n')
    expect(await exists(path.join(repo, '.git', 'ai-review'))).toBe(true)

    const before = await readFile(settingsFile, 'utf8')
    const second = await installIntoRepo({ home, repo, claudeBin: null, pathDir: null, cliBundle: '/opt/review-dash/cli/dist/index.js', nodeBin: '/opt/node/bin/node' })
    expect(second.changed).toBe(false)
    expect(second.changes.every((c) => c.action === 'unchanged' || c.action === 'skipped')).toBe(true)
    expect(await readFile(settingsFile, 'utf8')).toBe(before)
    expect(await readFile(path.join(repo, '.gitignore'), 'utf8')).toBe('.claude/settings.local.json\n')
  })

  it('registers the Playwright MCP at user scope once, and skips it when claude already knows it', async () => {
    const repo = path.join(home, 'repo')
    await mkdir(repo)
    await gitText(home, ['init', '-q', '-b', 'main', repo])
    const log = path.join(home, 'claude.log')
    const claude = path.join(home, 'claude')
    await writeFile(claude, `#!/bin/sh\necho "$@" >> "${log}"\n[ "$1 $2" = "mcp get" ] && [ -f "${home}/registered" ] && exit 0\n[ "$1 $2" = "mcp get" ] && exit 1\ntouch "${home}/registered"\n`, { mode: 0o755 })
    const opts = { home, repo, claudeBin: claude, pathDir: null, cliBundle: '/b', nodeBin: '/n' }

    const first = await installIntoRepo(opts)
    expect(first.changes.find((c) => c.path === 'claude mcp (user)')).toMatchObject({ action: 'created' })
    expect(await readFile(log, 'utf8')).toContain('mcp add --scope user playwright')
    expect(await exists(path.join(repo, '.mcp.json'))).toBe(false)

    const second = await installIntoRepo(opts)
    expect(second.changes.find((c) => c.path === 'claude mcp (user)')).toEqual({ path: 'claude mcp (user)', action: 'unchanged', note: 'playwright already registered' })
    expect((await readFile(log, 'utf8')).match(/mcp add/g)).toHaveLength(1)
  })

  it('links ai-review into a PATH directory, idempotently, and never replaces another file', async () => {
    const repo = path.join(home, 'repo')
    const pathDir = path.join(home, 'localbin')
    await mkdir(repo)
    await mkdir(pathDir)
    await gitText(home, ['init', '-q', '-b', 'main', repo])
    const opts = { home, repo, claudeBin: null, pathDir, cliBundle: '/b', nodeBin: '/n' }
    const link = path.join(pathDir, 'ai-review')

    const first = await installIntoRepo(opts)
    expect(first.changes.find((c) => c.path === link)).toMatchObject({ action: 'created' })
    expect(await readlink(link)).toBe(path.join(home, 'bin', 'ai-review'))
    expect((await installIntoRepo(opts)).changes.find((c) => c.path === link)).toEqual({ path: link, action: 'unchanged' })

    await rm(link)
    await writeFile(link, 'mine')
    const third = await installIntoRepo(opts)
    expect(third.changes.find((c) => c.path === link)).toMatchObject({ action: 'skipped' })
    expect(await readFile(link, 'utf8')).toBe('mine')
  })
})

describe('mergeSettings', () => {
  it('starts from an empty object and rejects non-object settings', () => {
    const merged = mergeSettings(undefined, { hooks: [{ event: 'Stop', command: 'x', timeout: 1, matchKey: 'x' }], allow: ['A'] })
    expect(merged.settings).toEqual({ permissions: { allow: ['A'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x', timeout: 1 }] }] } })
    expect(() => mergeSettings([], { hooks: [], allow: [] })).toThrow(/not a JSON object/)
    expect(() => mergeSettings({ permissions: 'nope' }, { hooks: [], allow: ['A'] })).toThrow(/not an object/)
  })
})
