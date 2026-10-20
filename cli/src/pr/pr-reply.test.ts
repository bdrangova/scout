import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrRepliesSchema, PrResolutionsSchema, SCHEMA_VERSION, sentFileStem, type PrReplies, type SentPrReply, type SentSnapshot } from '@review-dash/shared'
import { makeManifest, makePrComment, makePrComments, SESSION_ID, T1, T2, T3 } from '@review-dash/shared/testing/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatPrReply, prReply } from '../commands/pr-reply.ts'
import { resolvePrComments } from '../commands/pr-resolve.ts'
import { sessionDir, writeJsonAtomic } from '../store.ts'
import { GhCommandError, type GhRunner } from './gh.ts'

let home: string
let dir: string
beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'ai-review-pr-reply-'))
  dir = sessionDir(home, SESSION_ID)
  await writeJsonAtomic(path.join(dir, 'manifest.json'), makeManifest())
  await writeJsonAtomic(
    path.join(dir, 'review', 'pr-comments.json'),
    makePrComments([
      makePrComment({ githubId: 1 }),
      makePrComment({ githubId: 2 }),
      makePrComment({ githubId: 3, id: 'ic3', kind: 'general', path: null, line: null, side: null, threadId: null }),
      makePrComment({ githubId: 4, inReplyTo: 'rc1', threadId: 'rc1' }),
    ]),
  )
})
afterEach(() => rm(home, { recursive: true, force: true }))

const reply = (commentId: string, body: string, kind: SentPrReply['kind'] = 'reply'): SentPrReply => ({ commentId, kind, body, url: `https://github.com/acme/app/pull/482#discussion_r${commentId.slice(2)}` })

async function writeSent(sentAt: string, prReplies: SentPrReply[]): Promise<void> {
  const sent: SentSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    sessionId: SESSION_ID,
    sentAt,
    decision: 'undecided',
    tree: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), branch: 'feature/trial-bar' },
    patchPath: 'review/sent/x.patch',
    files: [],
    comments: [],
    prReplies,
    counts: { files: 0, approved: 0, rejected: 0, commented: 0, unreviewed: 0, openComments: 0 },
  }
  await writeJsonAtomic(path.join(dir, 'review', 'sent', `${sentFileStem(sentAt)}.json`), sent)
}

async function writeDrafts(replies: PrReplies['replies']): Promise<void> {
  await writeJsonAtomic(path.join(dir, 'review', 'pr-replies.json'), { schemaVersion: SCHEMA_VERSION, sessionId: SESSION_ID, updatedAt: T2, replies })
}
const draft = (body: string, extra: Partial<PrReplies['replies'][string]> = {}): PrReplies['replies'][string] => ({ body, kind: 'reply', editedAt: T2, postedAt: null, ...extra })
const readDrafts = async (): Promise<PrReplies> => PrRepliesSchema.parse(JSON.parse(await readFile(path.join(dir, 'review', 'pr-replies.json'), 'utf8')))

interface Call { args: readonly string[]; input: string | undefined }
function stubGh(fail: (args: readonly string[]) => boolean = () => false): { gh: GhRunner; calls: Call[] } {
  const calls: Call[] = []
  const gh: GhRunner = async (args, _cwd, options) => {
    calls.push({ args: [...args], input: options?.input })
    if (fail(args)) throw new GhCommandError('gh api failed: HTTP 422', { stderr: 'HTTP 422 Unprocessable', missing: false })
    return JSON.stringify({ html_url: `https://github.com/acme/app/pull/482#discussion_r9${calls.length}` })
  }
  return { gh, calls }
}
const run = (gh: GhRunner, extra: { dryRun?: boolean } = {}) => prReply({ home, repo: home, id: SESSION_ID, gh, now: new Date(T3), ...extra })

describe('ai-review pr-reply', () => {
  it('posts the replies of the latest sent snapshot through gh with the body on stdin, and records postedAt and the url', async () => {
    await writeSent(T1, [reply('rc1', 'OLD approved text')])
    await writeSent(T2, [reply('rc1', 'Fixed in abc; $(rm -rf /) is just text.'), reply('rc2', 'Kept on purpose.'), reply('ic3', 'Thanks all.'), reply('rc4', 'x', 'instruction')])
    await writeDrafts({ rc1: draft('Fixed in abc; $(rm -rf /) is just text.'), rc2: draft('Kept on purpose.'), ic3: draft('Thanks all.') })
    const { gh, calls } = stubGh()
    const result = await run(gh)
    expect(result.outcomes.map((o) => [o.commentId, o.status])).toEqual([['rc1', 'posted'], ['rc2', 'posted'], ['ic3', 'posted']])
    expect(calls.map((c) => c.args.join(' '))).toEqual([
      'api --method POST repos/acme/app/pulls/482/comments/1/replies --input -',
      'api --method POST repos/acme/app/pulls/482/comments/2/replies --input -',
      'api --method POST repos/acme/app/issues/482/comments --input -',
    ])
    expect(calls.map((c) => (JSON.parse(c.input ?? '{}') as { body: string }).body)).toEqual(['Fixed in abc; $(rm -rf /) is just text.', 'Kept on purpose.', 'Thanks all.'])
    expect(calls.every((c) => !c.args.some((arg) => arg.includes('text')))).toBe(true)
    const stored = (await readDrafts()).replies
    expect(stored.rc1).toMatchObject({ postedAt: T3, githubUrl: 'https://github.com/acme/app/pull/482#discussion_r91' })
    expect(stored.ic3?.postedAt).toBe(T3)
  })

  it('never posts a second time, nor a proposed reply, a draft not in the snapshot, an instruction or an unknown comment', async () => {
    await writeSent(T2, [reply('rc1', 'Posted before.'), reply('rc2', 'Instruction text', 'instruction'), reply('rc999', 'Not ours.'), reply('rc4', 'In a thread.')])
    await writeDrafts({ rc1: draft('Posted before.', { postedAt: T1 }), rc2: draft('Not submitted yet'), ic3: draft('Draft, never submitted') })
    await resolvePrComments({ home, id: SESSION_ID, items: [{ comment: 'rc2', status: 'addressed', note: 'done', reply: 'PROPOSED only' }] })
    const { gh, calls } = stubGh()
    const result = await run(gh)
    expect(calls).toEqual([])
    expect(result.outcomes).toEqual([
      { commentId: 'rc1', status: 'skipped', reason: `already posted at ${T1}` },
      { commentId: 'rc999', status: 'skipped', reason: 'not a comment of this session (not in pr-comments.json)' },
      { commentId: 'rc4', status: 'skipped', reason: 'a reply inside a thread; replies go to the root rc1' },
    ])
    expect(formatPrReply(result)).toContain('0 posted, 3 skipped, 0 failed')
  })

  it('skips a draft that was edited or removed after the Submit', async () => {
    await writeSent(T2, [reply('rc1', 'Approved text'), reply('rc2', 'Approved too')])
    await writeDrafts({ rc1: draft('Edited after the submit') })
    const { gh, calls } = stubGh()
    const result = await run(gh)
    expect(calls).toEqual([])
    expect(result.outcomes.map((o) => [o.commentId, o.status])).toEqual([['rc1', 'skipped'], ['rc2', 'skipped']])
  })

  it('keeps going when gh fails for one reply, and only the posted ones are marked', async () => {
    await writeSent(T2, [reply('rc1', 'one'), reply('rc2', 'two'), reply('ic3', 'three')])
    await writeDrafts({ rc1: draft('one'), rc2: draft('two'), ic3: draft('three') })
    const { gh, calls } = stubGh((args) => args.some((a) => a.includes('/comments/1/replies')))
    const result = await run(gh)
    expect(calls).toHaveLength(3)
    expect(result.outcomes.map((o) => o.status)).toEqual(['failed', 'posted', 'posted'])
    const stored = (await readDrafts()).replies
    expect(stored.rc1?.postedAt).toBeNull()
    expect(stored.rc2?.postedAt).toBe(T3)
    expect(formatPrReply(result)).toContain('2 posted, 0 skipped, 1 failed')
    // A retry posts only the failed one.
    const retry = stubGh()
    await run(retry.gh)
    expect(retry.calls).toHaveLength(1)
  })

  it('never posts an instruction, even one that is in a snapshot or whose stored draft is an instruction', async () => {
    await writeSent(T2, [reply('rc1', 'skip, we want 5000', 'instruction'), reply('rc2', 'skip, we want 5000')])
    await writeDrafts({ rc1: draft('skip, we want 5000', { kind: 'instruction' }), rc2: draft('skip, we want 5000', { kind: 'instruction' }) })
    const { gh, calls } = stubGh()
    const result = await run(gh)
    expect(calls).toEqual([])
    expect(result.outcomes).toEqual([{ commentId: 'rc2', status: 'skipped', reason: 'the draft is an instruction for Claude, not a reply: never posted' }])
    expect((await readDrafts()).replies.rc2?.postedAt).toBeNull()
  })

  it('--dry-run prints what would be posted and calls nothing', async () => {
    await writeSent(T2, [reply('rc1', 'one')])
    await writeDrafts({ rc1: draft('one') })
    const { gh, calls } = stubGh()
    const result = await run(gh, { dryRun: true })
    expect(calls).toEqual([])
    expect(result.outcomes).toEqual([{ commentId: 'rc1', status: 'would-post', target: 'repos/acme/app/pulls/482/comments/1/replies' }])
    expect(formatPrReply(result)).toContain('dry run: 1 would be posted')
    expect((await readDrafts()).replies.rc1?.postedAt).toBeNull()
  })

  it('says so when nothing was submitted or the last Submit approved no replies', async () => {
    const { gh, calls } = stubGh()
    expect(formatPrReply(await run(gh))).toBe('nothing was submitted yet: no replies to post')
    await writeSent(T2, [reply('rc2', 'an instruction', 'instruction')])
    expect(formatPrReply(await run(gh))).toContain('approved no replies')
    expect(calls).toEqual([])
  })
})

describe('ai-review pr-resolve --reply', () => {
  it('stores the proposal with the resolution, and rejects an empty one', async () => {
    await resolvePrComments({ home, id: SESSION_ID, items: [{ comment: 'rc1', status: 'addressed', note: 'done', reply: 'Fixed in abc.' }, { comment: 'rc2', status: 'declined', note: 'why' }] })
    const stored = PrResolutionsSchema.parse(JSON.parse(await readFile(path.join(dir, 'review', 'pr-resolutions.json'), 'utf8')))
    expect(stored.comments.rc1?.proposedReply).toBe('Fixed in abc.')
    expect(stored.comments.rc2?.proposedReply).toBeUndefined()
    const { PrResolveItemSchema } = await import('../commands/pr-resolve.ts')
    expect(PrResolveItemSchema.safeParse({ comment: 'rc1', status: 'addressed', note: 'x', reply: '  ' }).success).toBe(false)
  })
})
