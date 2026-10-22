import type { CodeReviewDetail, Review } from '@review-dash/shared'
import { describe, expect, it } from 'vitest'
import { commentFixture, resolutionsFixture, reviewFixture, sessionDetailFixture, withChangedFile } from '@/test/fixtures'
import { landingSection } from './landing-section'

const files = sessionDetailFixture.tree.files
const detail = sessionDetailFixture
const without = (patch: Partial<CodeReviewDetail>): CodeReviewDetail => ({ ...detail, ...patch })

function judged(verdict: 'approved' | 'rejected', count = files.length): Review['files'] {
  return Object.fromEntries(files.slice(0, count).map((file) => [file.path, { verdict, fingerprint: file.fingerprint, viewed: true }]))
}
const comment = (id: string, kind: 'spec' | 'extra' | 'evidence' | 'file' | 'overall', ref: string | null, patch = {}) =>
  commentFixture(id, { kind, ref }, 'note', patch)

describe('landingSection', () => {
  describe('not reviewed at all', () => {
    it('opens the first section with content, in order', () => {
      expect(landingSection(detail, reviewFixture())).toBe('spec')
      expect(landingSection(without({ spec: [] }), reviewFixture())).toBe('extras')
      expect(landingSection(without({ spec: [], extras: [] }), reviewFixture())).toBe('evidence')
    })

    it('falls back to files when spec, extras and evidence are all empty', () => {
      expect(landingSection(without({ spec: [], extras: [], evidence: [] }), reviewFixture())).toBe('files')
    })

    it('handles a session without files', () => {
      const empty = { ...detail.tree, files: [] }
      expect(landingSection(without({ tree: empty }), reviewFixture())).toBe('spec')
      expect(landingSection(without({ tree: empty, spec: [], extras: [], evidence: [] }), reviewFixture())).toBe('files')
    })
  })

  describe('started', () => {
    it('opens files for a partial file review', () => {
      expect(landingSection(detail, reviewFixture({ files: judged('approved', 2) }))).toBe('files')
    })

    it('opens files for a file comment', () => {
      expect(landingSection(detail, reviewFixture({ comments: [comment('c1', 'file', files[0]?.path ?? '')], nextCommentId: 2 }))).toBe('files')
    })

    it('opens the first of spec, extras, evidence with open comments when no file is touched', () => {
      const review = reviewFixture({ comments: [comment('c1', 'evidence', 'trial-bar.png'), comment('c2', 'extra', 'architecture.md')], nextCommentId: 3 })
      expect(landingSection(detail, review)).toBe('extras')
      expect(landingSection(detail, reviewFixture({ comments: [comment('c1', 'spec', 'jira.md')], nextCommentId: 2 }))).toBe('spec')
    })

    it('opens files for an overall comment or a decision alone', () => {
      expect(landingSection(detail, reviewFixture({ comments: [comment('c1', 'overall', null)], nextCommentId: 2 }))).toBe('files')
      expect(landingSection(detail, reviewFixture({ overall: { decision: 'approve' } }))).toBe('files')
    })

    it('opens files when only resolved artifact comments exist', () => {
      const review = reviewFixture({ comments: [comment('c1', 'spec', 'jira.md', { resolvedAt: '2026-09-21T00:00:00.000Z' })], nextCommentId: 2 })
      expect(landingSection(detail, review)).toBe('files')
    })

    it('opens files when a verdict went stale (the file changed)', () => {
      const review = reviewFixture({ files: judged('approved') })
      expect(landingSection(withChangedFile(detail, files[0]?.path ?? ''), review)).toBe('files')
    })

    it('prefers files over artifact comments once a file has a verdict', () => {
      const review = reviewFixture({ files: judged('approved', 1), comments: [comment('c1', 'spec', 'jira.md')], nextCommentId: 2 })
      expect(landingSection(detail, review)).toBe('files')
    })
  })

  describe('every file reviewed', () => {
    it('opens submit', () => {
      expect(landingSection(detail, reviewFixture({ files: judged('approved') }))).toBe('submit')
      expect(landingSection(detail, reviewFixture({ files: judged('rejected') }))).toBe('submit')
    })

    it('counts a commented file as reviewed', () => {
      const rest = Object.fromEntries(Object.entries(judged('approved')).slice(1))
      const review = reviewFixture({ files: rest, comments: [comment('c1', 'file', files[0]?.path ?? '')], nextCommentId: 2 })
      expect(landingSection(detail, review)).toBe('submit')
    })
  })

  describe('already sent', () => {
    const sent = { at: '2026-09-27T00:00:00.000Z', decision: 'request-changes' as const }

    it('opens submit when nothing is open and nothing changed', () => {
      expect(landingSection(without({ latestRunStatus: 'succeeded' }), reviewFixture({ files: judged('rejected', 2), sent }))).toBe('submit')
    })

    it('opens files again when a sent file changed since', () => {
      const review = reviewFixture({ files: judged('approved'), sent })
      expect(landingSection(withChangedFile(detail, files[0]?.path ?? ''), review)).toBe('files')
    })

    it('opens files when open comments remain after the send', () => {
      const review = reviewFixture({ files: judged('approved', 2), sent, comments: [comment('c1', 'file', files[0]?.path ?? '')], nextCommentId: 2 })
      expect(landingSection(detail, review)).toBe('files')
    })

    it('opens submit when the agent resolved the comments before the send', () => {
      const review = reviewFixture({ files: judged('approved', 2), sent, comments: [comment('c1', 'file', files[0]?.path ?? '')], nextCommentId: 2 })
      const resolutions = resolutionsFixture({ c1: { status: 'resolved', note: 'done', at: '2026-09-26T00:00:00.000Z', files: [] } })
      expect(landingSection(detail, review, resolutions)).toBe('submit')
    })

    it('opens submit while the agent works or after a failed run', () => {
      expect(landingSection(without({ activeRunId: 'r1' }), reviewFixture({ files: judged('approved', 1) }))).toBe('submit')
      expect(landingSection(without({ latestRunStatus: 'failed' }), reviewFixture({ files: judged('approved', 1) }))).toBe('submit')
    })
  })
})
