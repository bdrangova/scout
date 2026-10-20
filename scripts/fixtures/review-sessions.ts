// Review-state sessions on copies of trial-app: `all-verdicts` (the Review-Complete screen),
// `failed-run` (sent back, the agent run failed) and `active-run` (sent back, a run still running).
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AgentRunEventSchema,
  AgentRunSchema,
  ReviewSchema,
  anchorInPatch,
  buildSentSnapshot,
  emptyReview,
  parsePatchLines,
  renderSentMarkdown,
  sentFileStem,
  stampSent,
  type AgentRun,
  type AgentRunEvent,
  type Comment,
  type Decision,
  type LineAnchor,
  type Manifest,
  type Review,
  type WorkingTree,
} from '@review-dash/shared'
import { computeWorkingTree } from '@review-dash/shared/git/working-tree'
import { writeJsonAtomic } from '../../cli/src/store.ts'
import { BASE_REF, DASHBOARD_ORIGIN, fixturesDir, judged, makeComment, writeSessionFolder } from './common.ts'
import { ACTIVE_RUN_SESSION_ID, ALL_VERDICTS_SESSION_ID, APPROVED_SESSION_ID, CHANGES_SENT_SESSION_ID, FAILED_RUN_SESSION_ID, IN_PROGRESS_SESSION_ID } from './ids.ts'
import type { Media } from './media.ts'
import { trialArtifacts, trialManifest, trialRenderContext } from './trial-sessions.ts'

type Patches = ReadonlyMap<string, string>

function anchored(patches: Patches, file: string, anchor: LineAnchor): { kind: 'file'; ref: string; anchor: LineAnchor } {
  const patch = patches.get(file)
  if (patch === undefined) throw new Error(`make-fixture: no patch for ${file}`)
  if (!anchorInPatch(parsePatchLines(patch), anchor)) throw new Error(`make-fixture: anchor ${JSON.stringify(anchor)} is not in the diff of ${file}`)
  return { kind: 'file', ref: file, anchor }
}

/** Writes review.json plus the sent `.json|.md|.patch` and returns the stamped review. */
async function sendBack(dir: string, manifest: Manifest, drafted: Review, tree: WorkingTree, patches: Patches, decision: Decision, sentAt: string): Promise<Review> {
  const sent = buildSentSnapshot({ review: drafted, tree, decision, resolutions: null, now: sentAt })
  const review = ReviewSchema.parse(stampSent(drafted, sent, sentAt))
  await writeJsonAtomic(path.join(dir, 'review', 'review.json'), review)
  const sentBase = path.join(dir, 'review', 'sent', sentFileStem(sentAt))
  await mkdir(path.dirname(sentBase), { recursive: true })
  const patch = tree.files.map((file) => patches.get(file.path) ?? '').join('')
  await writeFile(`${sentBase}.json`, `${JSON.stringify(sent, null, 2)}\n`)
  await writeFile(`${sentBase}.md`, renderSentMarkdown(sent, { title: manifest.title, dashboardUrl: DASHBOARD_ORIGIN, patch, ...trialRenderContext(dir) }))
  await writeFile(`${sentBase}.patch`, patch)
  return review
}

// ---------------------------------------------------------------------------------------------
// all-verdicts

const ALL_CREATED_AT = '2026-10-01T10:30:00.000Z'
const ALL_REVIEWED_AT = '2026-10-01T10:52:00.000Z'

/**
 * Every one of the 12 files is approved, rejected (with a file comment) or commented (verdict
 * `none` plus a file comment), three line comments sit on specific diff lines and an overall
 * comment is drafted, but nothing has been sent: the deck is exhausted and the Review-Complete
 * screen shows with `undecided` as the overall decision.
 */
export async function writeAllVerdictsSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  const manifest = trialManifest(ALL_VERDICTS_SESSION_ID, repo, origin, ALL_CREATED_AT, 'claude-session-a11e')
  const dir = await writeSessionFolder(manifest, trialArtifacts(media))
  const { tree, patches } = await computeWorkingTree({ repo, baseRef: BASE_REF, now: () => new Date(ALL_REVIEWED_AT) })

  const approved = ['README.md', 'package-lock.json', 'src/app.ts', 'src/big.generated.ts', 'src/components/Header.tsx', 'src/components/Notice.tsx', 'src/assets/trial-bar.png']
  const rejected = ['src/components/TrialBar.tsx', 'src/config.ts']
  const commented = ['src/styles/trial-bar.css', 'src/legacy/OldBanner.ts', 'test/trial-bar.test.ts']
  const files: Review['files'] = {}
  for (const file of approved) files[file] = judged(tree, file, 'approved')
  for (const file of rejected) files[file] = judged(tree, file, 'rejected')
  for (const file of commented) files[file] = { verdict: 'none', fingerprint: null, viewed: true }
  const missing = tree.files.map((f) => f.path).filter((p) => files[p] === undefined)
  if (missing.length > 0) throw new Error(`make-fixture: all-verdicts leaves files unjudged: ${missing.join(', ')}`)

  const c = (id: string, target: Comment['target'], body: string) => makeComment(id, target, body, ALL_REVIEWED_AT)
  const comments: Comment[] = [
    c('c1', { kind: 'file', ref: 'src/components/TrialBar.tsx' }, 'The warning copy and the neutral copy differ only in the second sentence; pull the sentence out of the template literal so translators see one string per variant.'),
    c('c2', anchored(patches, 'src/components/TrialBar.tsx', { side: 'new', line: 17, endLine: 19 }), 'Prefer a <section aria-label="Trial"> here: role="status" on a container with a link and a button reads oddly.'),
    c('c3', { kind: 'file', ref: 'src/config.ts' }, 'warnAtDays and upgradeUrl should come from the server settings endpoint, not be baked into the bundle.'),
    c('c4', anchored(patches, 'src/config.ts', { side: 'new', line: 6 }), 'Three days is the marketing number; billing uses two. Confirm which one applies before shipping.'),
    c('c5', { kind: 'file', ref: 'src/styles/trial-bar.css' }, 'Fine as is. Consider a CSS custom property for the two palettes so the dark theme can override them.'),
    c('c6', anchored(patches, 'src/legacy/OldBanner.ts', { side: 'old', line: 2 }), 'Nothing imports this any more; good riddance. Checked the marketing bundle too.'),
    c('c7', { kind: 'file', ref: 'test/trial-bar.test.ts' }, 'Add a case for a negative daysLeft (the API returns -1 after expiry).'),
    c('c8', { kind: 'evidence', ref: 'trial-bar.png' }, 'The Upgrade button sits 2px lower than the dismiss control; align both to the text baseline.'),
    c('c9', { kind: 'spec', ref: 'plan.md' }, 'Step 3 (the rename) was not in the ticket; worth a line in the PR description.'),
    c('c10', { kind: 'overall', ref: null }, 'Solid change. Two blockers in TrialBar.tsx and config.ts, the rest are suggestions. Draft, not sent yet.'),
  ]
  const review: Review = ReviewSchema.parse({
    ...emptyReview(manifest.id, ALL_REVIEWED_AT),
    files,
    comments,
    nextCommentId: 11,
    overall: { decision: 'undecided' },
    ui: { mode: 'swipe', currentFile: null, section: 'files' },
  })
  await writeJsonAtomic(path.join(dir, 'review', 'review.json'), review)
  return tree
}

// ---------------------------------------------------------------------------------------------
// all files approved, then sent

const SENT_CREATED_AT = '2026-10-01T12:15:00.000Z'
const SENT_REVIEWED_AT = '2026-10-01T12:40:00.000Z'
const SENT_AT = '2026-10-01T12:45:00.000Z'

/**
 * Every file approved and the review sent. With `request-changes` (an overall comment asks for more) the
 * list must say "Changes sent" even though the bar is fully green; with `approve` it says "Approved".
 */
async function writeAllApprovedSent(id: string, decision: 'approve' | 'request-changes', repo: string, origin: string, media: Media, agentSessionId: string): Promise<WorkingTree> {
  const manifest = trialManifest(id, repo, origin, SENT_CREATED_AT, agentSessionId)
  const dir = await writeSessionFolder(manifest, trialArtifacts(media))
  const { tree, patches } = await computeWorkingTree({ repo, baseRef: BASE_REF, now: () => new Date(SENT_REVIEWED_AT) })
  const files: Review['files'] = {}
  for (const file of tree.files) files[file.path] = judged(tree, file.path, 'approved')
  const overall = decision === 'approve' ? 'Looks good, shipping it.' : 'All files are fine; please also add a changelog entry before merging.'
  const drafted: Review = {
    ...emptyReview(manifest.id, SENT_REVIEWED_AT),
    files,
    comments: [makeComment('c1', { kind: 'overall', ref: null }, overall, SENT_REVIEWED_AT)],
    nextCommentId: 2,
    overall: { decision },
    ui: { mode: 'swipe', currentFile: null, section: 'submit' },
  }
  await sendBack(dir, manifest, drafted, tree, patches, decision, SENT_AT)
  return tree
}

/** Four files approved and one comment, nothing sent: the list says "In progress". */
export async function writeInProgressSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  const manifest = trialManifest(IN_PROGRESS_SESSION_ID, repo, origin, SENT_CREATED_AT, 'claude-session-77c3')
  const dir = await writeSessionFolder(manifest, trialArtifacts(media))
  const { tree } = await computeWorkingTree({ repo, baseRef: BASE_REF, now: () => new Date(SENT_REVIEWED_AT) })
  const files: Review['files'] = {}
  for (const file of ['README.md', 'src/app.ts', 'src/components/Header.tsx', 'src/components/Notice.tsx']) files[file] = judged(tree, file, 'approved')
  const review: Review = ReviewSchema.parse({
    ...emptyReview(manifest.id, SENT_REVIEWED_AT),
    files,
    comments: [makeComment('c1', { kind: 'file', ref: 'src/config.ts' }, 'Is warnAtDays configurable per workspace?', SENT_REVIEWED_AT)],
    nextCommentId: 2,
    ui: { mode: 'swipe', currentFile: 'src/config.ts', section: 'files' },
  })
  await writeJsonAtomic(path.join(dir, 'review', 'review.json'), review)
  return tree
}

export function writeChangesSentSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  return writeAllApprovedSent(CHANGES_SENT_SESSION_ID, 'request-changes', repo, origin, media, 'claude-session-5e17')
}

export function writeApprovedSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  return writeAllApprovedSent(APPROVED_SESSION_ID, 'approve', repo, origin, media, 'claude-session-a99d')
}

// ---------------------------------------------------------------------------------------------
// Agent runs

function runRecord(sessionId: string, id: string, sentAt: string, startedAt: string, overrides: Partial<AgentRun>): AgentRun {
  return AgentRunSchema.parse({
    id,
    sessionId,
    sentAt,
    adapter: 'claude-code',
    status: 'running',
    pid: null,
    argv: ['claude', '-p', '--output-format', 'stream-json', '--verbose', '--resume', 'claude-session-f41d'],
    startedAt,
    endedAt: null,
    exitCode: null,
    agentSessionId: null,
    numTurns: null,
    costUsd: null,
    resultText: null,
    error: null,
    resolvedComments: [],
    ...overrides,
  })
}

/** An event without its `seq`/`at`, keeping the union discriminated (a plain `Omit` would flatten it). */
type EventBody = AgentRunEvent extends infer E ? (E extends AgentRunEvent ? Omit<E, 'seq' | 'at'> : never) : never

function eventLines(at: string, events: EventBody[]): string {
  return `${events.map((event, i) => JSON.stringify(AgentRunEventSchema.parse({ seq: i + 1, at, ...event }))).join('\n')}\n`
}

async function writeRun(dir: string, run: AgentRun, log: string): Promise<void> {
  const runs = path.join(dir, 'review', 'runs')
  await mkdir(runs, { recursive: true })
  await writeJsonAtomic(path.join(runs, `${run.id}.json`), run)
  await writeFile(path.join(runs, `${run.id}.jsonl`), log)
}

const RUN_CREATED_AT = '2026-10-01T11:00:00.000Z'
const RUN_REVIEWED_AT = '2026-10-01T11:05:00.000Z'
const RUN_SENT_AT = '2026-10-01T11:10:00.000Z'

/** A review with one reject + file comment and an overall comment, sent back as "request changes". */
async function reviewedAndSent(id: string, repo: string, origin: string, media: Media, agentSessionId: string): Promise<{ dir: string; manifest: Manifest; tree: WorkingTree }> {
  const manifest = trialManifest(id, repo, origin, RUN_CREATED_AT, agentSessionId)
  const dir = await writeSessionFolder(manifest, trialArtifacts(media))
  const { tree, patches } = await computeWorkingTree({ repo, baseRef: BASE_REF, now: () => new Date(RUN_REVIEWED_AT) })
  const drafted: Review = {
    ...emptyReview(manifest.id, RUN_REVIEWED_AT),
    files: {
      'README.md': judged(tree, 'README.md', 'approved'),
      'src/app.ts': judged(tree, 'src/app.ts', 'rejected'),
    },
    comments: [
      makeComment('c1', { kind: 'file', ref: 'src/app.ts' }, 'dismissTrialBar re-renders the whole root; only the bar needs to go away.', RUN_REVIEWED_AT),
      makeComment('c2', { kind: 'overall', ref: null }, 'Please also run the full test suite before resolving.', RUN_REVIEWED_AT),
    ],
    nextCommentId: 3,
    overall: { decision: 'request-changes' },
    ui: { mode: 'swipe', currentFile: 'src/app.ts', section: 'submit' },
  }
  await sendBack(dir, manifest, drafted, tree, patches, 'request-changes', RUN_SENT_AT)
  return { dir, manifest, tree }
}

/**
 * Sent back twice. The first run (an hour earlier, on a previous send) succeeded; the second started
 * right after this send and failed: the CLI logged to stderr and exited 1. Both logs replay through
 * the server's run reader.
 */
export async function writeFailedRunSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  const { dir, tree } = await reviewedAndSent(FAILED_RUN_SESSION_ID, repo, origin, media, 'claude-session-f41d')
  const earlierStart = '2026-10-01T10:10:05.000Z'
  const earlier = runRecord(FAILED_RUN_SESSION_ID, 'run-20261001101005-0a1b', '2026-10-01T10:10:00.000Z', earlierStart, {
    status: 'succeeded',
    pid: 48101,
    endedAt: '2026-10-01T10:14:40.000Z',
    exitCode: 0,
    agentSessionId: 'claude-session-f41d',
    numTurns: 6,
    costUsd: 0.37,
    resultText: 'Resolved c1: the lockfile change only adds the three new packages. No other edits.',
    resolvedComments: ['c1'],
  })
  await writeRun(
    dir,
    earlier,
    eventLines(earlierStart, [
      { type: 'status', status: 'running' },
      { type: 'init', model: 'claude-sonnet-5', sessionId: 'claude-session-f41d' },
      { type: 'assistant_text', text: 'Reading the feedback in review/sent and the diff.' },
      { type: 'tool_use', id: 'toolu_01', name: 'Bash', input: { command: 'ai-review resolve 20261001-1100-qi-15472-trial-bar-failed-run-f41d --comment c1 --note "lockfile only adds the new packages"' } },
      { type: 'tool_result', toolUseId: 'toolu_01', text: 'resolved c1', isError: false },
      { type: 'result', isError: false, text: earlier.resultText ?? '', costUsd: 0.37, numTurns: 6, durationMs: 275_000 },
      { type: 'status', status: 'succeeded' },
    ]),
  )

  const failedStart = '2026-10-01T11:10:04.000Z'
  const failed = runRecord(FAILED_RUN_SESSION_ID, 'run-20261001111004-f41d', RUN_SENT_AT, failedStart, {
    status: 'failed',
    pid: 48213,
    endedAt: '2026-10-01T11:10:41.000Z',
    exitCode: 1,
    agentSessionId: 'claude-session-f41d',
    numTurns: 2,
    costUsd: 0.04,
    error: 'claude exited with code 1: Error: Session claude-session-f41d could not be resumed (workspace trust check failed)',
  })
  await writeRun(
    dir,
    failed,
    eventLines(failedStart, [
      { type: 'status', status: 'running' },
      { type: 'init', model: 'claude-sonnet-5', sessionId: 'claude-session-f41d' },
      { type: 'assistant_text', text: 'Resuming the session to apply the two comments.' },
      { type: 'tool_use', id: 'toolu_02', name: 'Read', input: { file_path: `${repo}/src/app.ts` } },
      { type: 'tool_result', toolUseId: 'toolu_02', text: 'EACCES: permission denied, open src/app.ts', isError: true },
      { type: 'stderr', line: 'Error: Session claude-session-f41d could not be resumed (workspace trust check failed)' },
      { type: 'stderr', line: '    at resumeSession (file:///usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js:4121:19)' },
      { type: 'stderr', line: '    at async main (file:///usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js:9:3)' },
      { type: 'stderr', line: 'Hint: run `claude` once in the repository to trust the workspace, then resend.' },
      { type: 'error', message: failed.error ?? '' },
      { type: 'status', status: 'failed' },
    ]),
  )
  return tree
}

/**
 * Sent back; the run record still says `running` with a pid. Its log starts with the real
 * stream-json lines of `fixtures/agent-run.sample.jsonl` (parsed on replay) and ends mid-turn.
 * Note: `GET /sessions/:id/runs` (the Submit tab) marks runs left `running` by a previous server
 * process as failed, so this one shows as active in the list until the Submit tab is opened.
 */
export async function writeActiveRunSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  const { dir, tree } = await reviewedAndSent(ACTIVE_RUN_SESSION_ID, repo, origin, media, 'claude-session-ac71')
  const startedAt = '2026-10-01T11:25:03.000Z'
  const run = runRecord(ACTIVE_RUN_SESSION_ID, 'run-20261001112503-ac71', RUN_SENT_AT, startedAt, { pid: 48377, agentSessionId: 'claude-session-ac71' })
  const sample = await readFile(path.join(fixturesDir, 'agent-run.sample.jsonl'), 'utf8')
  const rawLines = sample.split('\n').filter((line) => line.trim() !== '').slice(0, 19)
  await writeRun(dir, run, `${eventLines(startedAt, [{ type: 'status', status: 'running' }])}${rawLines.join('\n')}\n`)
  return tree
}
