// The two original sessions on the trial-bar change set: f1a0 (unreviewed) and f2a0 (reviewed, sent,
// partly resolved, two files edited since). Their ids and content are what e2e/smoke.spec.ts expects.
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ResolutionsSchema,
  ReviewSchema,
  SCHEMA_VERSION,
  buildSentSnapshot,
  deriveEvidence,
  deriveExtras,
  deriveSpec,
  emptyReview,
  renderSentMarkdown,
  sentFileStem,
  stampSent,
  type EvidenceIndex,
  type ExtrasIndex,
  type Manifest,
  type Resolutions,
  type Review,
  type SpecIndex,
  type WorkingTree,
} from '@review-dash/shared'
import { computeWorkingTree } from '@review-dash/shared/git/working-tree'
import { writeJsonAtomic } from '../../cli/src/store.ts'
import { BASE_REF, DASHBOARD_ORIGIN, inputDir, judged, makeComment, makeManifest, writeFiles, writeSessionFolder, type SessionArtifacts } from './common.ts'
import { FIXTURE_SESSION_ID, REVIEWED_SESSION_ID } from './ids.ts'
import type { Media } from './media.ts'
import { BRANCH_FILES } from './trial-app.ts'

const NOW = '2026-09-26T12:00:00.000Z'
const REVIEWED_CREATED_AT = '2026-09-26T13:00:00.000Z'
const REVIEWED_AT = '2026-09-26T13:12:00.000Z'
const SENT_AT = '2026-09-26T13:20:00.000Z'
const RESOLVED_AT = '2026-09-26T13:40:00.000Z'
export const TRIAL_TITLE = 'QI-15472: Trial bar'
export const TRIAL_TICKET_URL = 'https://example.atlassian.net/browse/QI-15472'
export const TRIAL_BRANCH = 'feature/trial-bar'

const EVIDENCE_INDEX: EvidenceIndex = {
  items: [
    {
      file: 'trial-bar.png',
      caption: 'Trial bar on the dashboard',
      description: 'Free plan with 7 days left: neutral variant above the header, Upgrade on the right.',
      order: 0,
    },
    {
      file: 'upgrade-flow.webm',
      caption: 'Upgrade flow',
      description: 'Clicking Upgrade opens the plan picker; choosing Pro confirms inline and hides the bar.',
      order: 1,
    },
  ],
}

const EXTRAS_INDEX: ExtrasIndex = {
  items: [
    { file: 'architecture.md', title: 'Architecture' },
    { file: 'report.html', title: 'Test report' },
  ],
}

const SPEC_INDEX: SpecIndex = {
  items: [
    { file: 'jira.md', type: 'jira', title: TRIAL_TITLE, url: TRIAL_TICKET_URL, capturedAt: NOW },
    { file: 'plan.md', type: 'markdown', title: 'Implementation plan', sourcePath: '/Users/alex/.claude/plans/trial-bar.md' },
    { file: 'design.html', type: 'artifact', title: 'Trial bar design', url: 'https://claude.ai/artifact/example' },
  ],
}

export function trialManifest(id: string, repo: string, origin: string, createdAt: string, agentSessionId: string | null): Manifest {
  return makeManifest({
    id,
    title: TRIAL_TITLE,
    repo,
    origin,
    branch: TRIAL_BRANCH,
    createdAt,
    agentSessionId,
    tickets: [{ key: 'QI-15472', url: TRIAL_TICKET_URL }],
  })
}

/** The trial-bar evidence, extras, spec (each with index.json) and PR description, as the original sessions carry them. */
export function trialArtifacts(media: Media): SessionArtifacts {
  return {
    evidence: { files: [{ file: 'trial-bar.png', from: media.png }, { file: 'upgrade-flow.webm', from: media.webm }], index: EVIDENCE_INDEX },
    extras: { files: EXTRAS_INDEX.items.map((i) => ({ file: i.file, from: path.join(inputDir, 'extras', i.file) })), index: EXTRAS_INDEX },
    spec: { files: SPEC_INDEX.items.map((i) => ({ file: i.file, from: path.join(inputDir, 'spec', i.file) })), index: SPEC_INDEX },
    prDescription: readFileSync(path.join(inputDir, 'pr-description.md'), 'utf8'),
  }
}

/** Session 1: manifest and artifacts, no review state. */
export async function writeUnreviewedSession(repo: string, origin: string, media: Media): Promise<void> {
  await writeSessionFolder(trialManifest(FIXTURE_SESSION_ID, repo, origin, NOW, null), trialArtifacts(media))
}

/**
 * Session 2: the same change set in `trial-app-2`, reviewed in the dashboard (config.ts and
 * trial-bar.css approved, TrialBar.tsx rejected with a comment, an evidence comment at 0:02.5, an
 * overall comment), sent back as "request changes" with the `.json|.md|.patch` snapshot, the agent
 * resolved c1 and replied to c3, then edited TrialBar.tsx and config.ts on disk so those two show
 * as updated while trial-bar.css stays approved. Returns the tree as it was at the send.
 */
export async function writeReviewedSession(repo: string, origin: string, media: Media): Promise<WorkingTree> {
  const manifest = trialManifest(REVIEWED_SESSION_ID, repo, origin, REVIEWED_CREATED_AT, 'claude-session-f2a0')
  const dir = await writeSessionFolder(manifest, trialArtifacts(media))
  const { tree, patches } = await computeWorkingTree({ repo, baseRef: BASE_REF, now: () => new Date(REVIEWED_AT) })

  const comment = (id: string, target: Review['comments'][number]['target'], body: string, timestampSec: number | null = null) =>
    makeComment(id, target, body, REVIEWED_AT, timestampSec)
  const drafted: Review = {
    ...emptyReview(manifest.id, REVIEWED_AT),
    files: {
      'src/config.ts': judged(tree, 'src/config.ts', 'approved'),
      'src/styles/trial-bar.css': judged(tree, 'src/styles/trial-bar.css', 'approved'),
      'src/components/TrialBar.tsx': judged(tree, 'src/components/TrialBar.tsx', 'rejected'),
      'src/app.ts': { verdict: 'none', fingerprint: null, viewed: true },
    },
    comments: [
      comment(
        'c1',
        { kind: 'file', ref: 'src/components/TrialBar.tsx' },
        'The bar is not announced to screen readers and the dismiss button has no accessible name beyond "Dismiss". Add aria-live="polite" on the bar and keep the aria-label specific.',
      ),
      comment('c2', { kind: 'evidence', ref: 'upgrade-flow.webm' }, 'At this point the plan picker pops in with no backdrop transition; please fade the overlay in like the other modals.', 2.5),
      comment('c3', { kind: 'overall', ref: null }, 'Looks good overall. Please also document the session-storage key in the README and cover the "ends today" wording in a test.'),
    ],
    nextCommentId: 4,
    overall: { decision: 'request-changes' },
    ui: { mode: 'swipe', currentFile: 'src/components/TrialBar.tsx', section: 'submit' },
  }

  const sent = buildSentSnapshot({ review: drafted, tree, decision: 'request-changes', resolutions: null, now: SENT_AT })
  const review = ReviewSchema.parse(stampSent(drafted, sent, SENT_AT))
  await writeJsonAtomic(path.join(dir, 'review', 'review.json'), review)

  const markdown = renderSentMarkdown(sent, { title: manifest.title, dashboardUrl: DASHBOARD_ORIGIN, ...trialRenderContext(dir) })
  const sentBase = path.join(dir, 'review', 'sent', sentFileStem(SENT_AT))
  await mkdir(path.dirname(sentBase), { recursive: true })
  await writeFile(`${sentBase}.json`, `${JSON.stringify(sent, null, 2)}\n`)
  await writeFile(`${sentBase}.md`, markdown)
  await writeFile(`${sentBase}.patch`, tree.files.map((file) => patches.get(file.path) ?? '').join(''))

  const resolutions: Resolutions = ResolutionsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sessionId: manifest.id,
    updatedAt: RESOLVED_AT,
    comments: {
      c1: {
        status: 'resolved',
        note: 'Added aria-live="polite" on the bar and a specific aria-label on Dismiss; verified with the trial-bar tests.',
        at: RESOLVED_AT,
        files: ['src/components/TrialBar.tsx'],
      },
      c3: {
        status: 'open',
        note: 'Moved the storage key into config (dismissedStorageKey). Should the README section live under "Trial bar" or "Configuration"?',
        at: RESOLVED_AT,
        files: ['src/config.ts'],
      },
    },
  })
  await writeJsonAtomic(path.join(dir, 'review', 'resolutions.json'), resolutions)

  // The agent's fixes on disk: the rejected file and one approved file move on, the other approved file does not.
  await writeFiles(repo, {
    'src/components/TrialBar.tsx': BRANCH_FILES['src/components/TrialBar.tsx']!
      .replace("  bar.setAttribute('role', 'status')\n", "  bar.setAttribute('role', 'status')\n  bar.setAttribute('aria-live', 'polite')\n")
      .replace("dismiss.setAttribute('aria-label', 'Dismiss trial reminder')", "dismiss.setAttribute('aria-label', 'Dismiss the trial reminder for this session')"),
    'src/config.ts': BRANCH_FILES['src/config.ts']!.replace(
      "    upgradeUrl: '/billing/upgrade',\n",
      "    upgradeUrl: '/billing/upgrade',\n    /** sessionStorage key that remembers a dismissed trial bar. */\n    dismissedStorageKey: 'trial-bar-dismissed',\n",
    ),
  })
  return tree
}

/** The derived evidence/extras/spec of a session written with `trialArtifacts`, for `renderSentMarkdown`. */
export function trialRenderContext(dir: string): Pick<Parameters<typeof renderSentMarkdown>[1], 'evidence' | 'extras' | 'spec'> {
  const readText = (folder: string) => (file: string) => {
    try {
      return readFileSync(path.join(dir, folder, file), 'utf8')
    } catch {
      return null
    }
  }
  return {
    evidence: deriveEvidence(EVIDENCE_INDEX.items.map((i) => i.file), EVIDENCE_INDEX),
    extras: deriveExtras(EXTRAS_INDEX.items.map((i) => i.file), EXTRAS_INDEX, readText('extras')),
    spec: deriveSpec(SPEC_INDEX.items.map((i) => i.file), SPEC_INDEX, readText('spec')),
  }
}
