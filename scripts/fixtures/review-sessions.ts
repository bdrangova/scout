// Review-state sessions on copies of trial-app: `all-verdicts` (the Review-Complete screen) and the sent-back ones.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ReviewSchema,
  anchorInPatch,
  buildSentSnapshot,
  emptyReview,
  parsePatchLines,
  renderSentMarkdown,
  sentFileStem,
  stampSent,
  type Comment,
  type Decision,
  type LineAnchor,
  type Manifest,
  type Review,
  type WorkingTree,
} from '@scout/shared'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import { writeJsonAtomic } from '../../cli/src/store.ts'
import { BASE_REF, DASHBOARD_ORIGIN, judged, makeComment, writeSessionFolder } from './common.ts'
import { ALL_VERDICTS_SESSION_ID, APPROVED_SESSION_ID, CHANGES_SENT_SESSION_ID, IN_PROGRESS_SESSION_ID } from './ids.ts'
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
