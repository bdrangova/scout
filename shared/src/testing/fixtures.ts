import type { EvidenceItem, ExtraItem, SpecItem } from '../schemas/artifacts.ts'
import type { Manifest } from '../schemas/manifest.ts'
import type { Resolution, Resolutions } from '../schemas/resolutions.ts'
import type { Comment, Review } from '../schemas/review.ts'
import { emptyReview } from '../schemas/review.ts'
import type { TreeFile, TreeStats, WorkingTree } from '../schemas/tree.ts'
import { SCHEMA_VERSION } from '../constants.ts'

export const SESSION_ID = '20260926-1830-add-trial-bar-3f2a'
export const T0 = '2026-09-26T18:30:00.000Z'
export const T1 = '2026-09-26T19:00:00.000Z'
export const T2 = '2026-09-26T19:30:00.000Z'
export const T3 = '2026-09-26T20:00:00.000Z'

export const BASE_SHA = 'b'.repeat(40)
export const HEAD_SHA = 'a'.repeat(40)

/** A deterministic 16-hex fingerprint derived from a label, for tests. */
export function fp(label: string): string {
  let h = 0x811c9dc5
  for (const ch of label) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h.toString(16).padStart(8, '0') + ((h ^ 0x5bd1e995) >>> 0).toString(16).padStart(8, '0')).slice(0, 16)
}

export function makeTreeFile(overrides: Partial<TreeFile> = {}): TreeFile {
  const path = overrides.path ?? 'src/a.tsx'
  return {
    path,
    oldPath: null,
    status: 'modified',
    additions: 10,
    deletions: 2,
    binary: false,
    sizeBefore: 1000,
    sizeAfter: 1234,
    collapsed: false,
    collapseReason: null,
    omitted: false,
    omitReason: null,
    untracked: false,
    fingerprint: fp(path),
    ...overrides,
  }
}

export function makeStats(files: readonly TreeFile[]): TreeStats {
  const stats: TreeStats = { files: files.length, additions: 0, deletions: 0, added: 0, modified: 0, deleted: 0, renamed: 0, binary: 0, collapsed: 0, omitted: 0 }
  for (const file of files) {
    stats.additions += file.additions
    stats.deletions += file.deletions
    if (file.status === 'added') stats.added += 1
    else if (file.status === 'modified' || file.status === 'typechange') stats.modified += 1
    else if (file.status === 'deleted') stats.deleted += 1
    else stats.renamed += 1
    if (file.binary) stats.binary += 1
    if (file.collapsed) stats.collapsed += 1
    if (file.omitted) stats.omitted += 1
  }
  return stats
}

export function makeTree(overrides: Partial<WorkingTree> = {}): WorkingTree {
  const files = overrides.files ?? [
    makeTreeFile(),
    makeTreeFile({ path: 'src/b.ts', status: 'added', sizeBefore: null }),
    makeTreeFile({ path: 'src/c.ts', status: 'deleted', additions: 0, sizeAfter: null }),
  ]
  return {
    computedAt: T0,
    baseRef: 'origin/main',
    baseSha: BASE_SHA,
    baseVirtual: false,
    headSha: HEAD_SHA,
    branch: 'feature/trial-bar',
    dirty: true,
    durationMs: 120,
    fingerprint: fp(files.map((file) => file.fingerprint).join('|')),
    stats: makeStats(files),
    files,
    ...overrides,
  }
}

export function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: SESSION_ID,
    title: 'Add trial bar',
    createdAt: T0,
    updatedAt: T0,
    agent: { type: 'claude-code', sessionId: 'agent-session-1', cliVersion: '2.1.241', entrypoint: 'cli' },
    repo: {
      path: '/Users/me/Projects/app',
      remote: 'git@github.com:acme/app.git',
      branch: 'feature/trial-bar',
      baseRef: 'origin/main',
    },
    tickets: [{ key: 'QI-15472', url: 'https://acme.atlassian.net/browse/QI-15472' }],
    ...overrides,
  }
}

export function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return { path: 'trial-bar.png', type: 'image', caption: 'Trial bar on the dashboard', description: null, order: 0, ...overrides }
}

export function makeExtra(overrides: Partial<ExtraItem> = {}): ExtraItem {
  return { path: 'architecture.md', type: 'markdown', title: 'Architecture', ...overrides }
}

export function makeSpec(overrides: Partial<SpecItem> = {}): SpecItem {
  return {
    path: 'jira.md',
    type: 'jira',
    title: 'QI-15472 Trial bar',
    url: 'https://acme.atlassian.net/browse/QI-15472',
    sourcePath: null,
    capturedAt: T0,
    ...overrides,
  }
}

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    target: { kind: 'file', ref: 'src/a.tsx' },
    body: 'Please rename this.',
    timestampSec: null,
    createdAt: T0,
    updatedAt: null,
    sentAt: null,
    resolvedAt: null,
    reopenedAt: null,
    ...overrides,
  }
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  const base = emptyReview(SESSION_ID, T0)
  const comments = overrides.comments ?? base.comments
  const maxId = comments.reduce((max, c) => Math.max(max, Number(c.id.slice(1))), 0)
  return { ...base, nextCommentId: maxId + 1, ...overrides, comments }
}

export function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return { status: 'resolved', note: 'Renamed.', at: T1, files: ['src/a.tsx'], ...overrides }
}

export function makeResolutions(comments: Record<string, Resolution>, updatedAt: string = T1): Resolutions {
  return { schemaVersion: SCHEMA_VERSION, sessionId: SESSION_ID, updatedAt, comments }
}
