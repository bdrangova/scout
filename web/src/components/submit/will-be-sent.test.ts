import { mergeComments } from '@review-dash/shared'
import { describe, expect, it } from 'vitest'
import { commentFixture, resolutionsFixture, reviewFixture } from '@/test/fixtures'
import { prReplyRows, sendCounts, summaryRows } from './will-be-sent'

const comments = mergeComments(
  reviewFixture({
    comments: [
      commentFixture('c1', { kind: 'file', ref: 'a.ts' }, 'one'),
      commentFixture('c2', { kind: 'file', ref: 'a.ts', anchor: { side: 'new', line: 3 } }, 'two'),
      commentFixture('c3', { kind: 'file', ref: 'b.ts' }, 'three'),
      commentFixture('c4', { kind: 'spec', ref: 'plan.md' }, 'spec'),
      commentFixture('c5', { kind: 'overall', ref: null }, 'note'),
    ],
  }),
  resolutionsFixture({ c3: { status: 'resolved', note: 'done', at: '2026-09-22T12:00:00.000Z', files: [] } }),
)

describe('sendCounts', () => {
  it('counts only open comments, by kind, with the files that carry them', () => {
    expect(sendCounts(comments)).toEqual({ files: 1, fileComments: 2, lineComments: 1, spec: 1, evidence: 0, extras: 0, overall: 'draft', total: 4 })
  })
})

describe('summaryRows', () => {
  it('leaves out kinds with nothing to send', () => {
    expect(summaryRows(sendCounts(comments))).toEqual([
      { label: 'Files', value: '2 comments · 1 file' },
      { label: 'Lines', value: '1 of them' },
      { label: 'Spec', value: '1' },
      { label: 'Overall note', value: 'draft' },
    ])
    expect(summaryRows(sendCounts([]))).toEqual([])
  })
})

describe('prReplyRows', () => {
  it('lists instructions and PR replies, and nothing when there are none', () => {
    expect(prReplyRows({ instructions: 1, replies: 2 })).toEqual([
      { label: 'Instructions', value: '1' },
      { label: 'PR replies', value: '2' },
    ])
    expect(prReplyRows({ instructions: 0, replies: 0 })).toEqual([])
  })
})
