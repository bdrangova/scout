import { mergeComments } from '@review-dash/shared'
import { describe, expect, it } from 'vitest'
import { commentFixture, resolutionsFixture, reviewFixture, sessionDetailFixture, testRunDetailFixture, treeFixture } from '@/test/fixtures'
import { commentSections } from './open-comments-sections'

describe('commentSections for a code review', () => {
  it('groups file comments under Files with a link to the file card', () => {
    const file = treeFixture.files[0]
    if (!file) throw new Error('fixture too small')
    const review = reviewFixture({ comments: [commentFixture('c1', { kind: 'file', ref: file.path }, 'off by one')] })
    const sections = commentSections(mergeComments(review, null), review, sessionDetailFixture)
    expect(sections.map((section) => section.key)).toEqual(['files'])
    expect(sections[0]?.groups[0]?.to).toBe(`../files/${file.path.split('/').map(encodeURIComponent).join('/')}`)
  })
})

describe('commentSections for a test run', () => {
  const [first, second] = testRunDetailFixture.scenarios
  if (!first || !second) throw new Error('fixture too small')
  const review = reviewFixture({
    files: { [second.id]: { verdict: 'rejected', fingerprint: second.fingerprint, viewed: true } },
    comments: [
      commentFixture('c1', { kind: 'bug', ref: 'x' }, 'bug note'),
      commentFixture('c2', { kind: 'scenario', ref: second.id }, 'banner is wrong', { kind: 'incorrect' }),
      commentFixture('c3', { kind: 'scenario', ref: first.id }, 'unclear step', { kind: 'not-clear' }),
      commentFixture('c4', { kind: 'log', ref: 'run:logs/run.log', anchor: { side: 'new', line: 6 } }, 'this line'),
      commentFixture('c5', { kind: 'overall', ref: null }, 'overall note'),
    ],
  })
  const comments = mergeComments(review, resolutionsFixture({ c5: { status: 'resolved', note: 'done', at: '2026-10-21T12:00:00.000Z', files: [] } }))
  const sections = commentSections(comments, review, testRunDetailFixture)

  it('orders the sections overall, scenarios, bugs, logs and leaves the code-review ones out', () => {
    expect(sections.map((section) => section.key)).toEqual(['overall', 'scenarios', 'bugs', 'logs'])
  })

  it('lists scenarios in index order by title, with route links, verdict chips and a verdict summary', () => {
    const scenarios = sections.find((section) => section.key === 'scenarios')
    expect(scenarios?.groups.map((group) => [group.label, group.to, group.chip])).toEqual([
      ['Happy path', '../review/s1-pass', 'commented'],
      ['Empty result', '../review/s2-fail', 'rejected'],
    ])
    expect(scenarios?.summary).toBe('0 approved · 1 rejected · 1 commented · 1 not reviewed')
  })

  it('names bugs and logs from the index and links to their pages', () => {
    expect(sections.find((section) => section.key === 'bugs')?.groups.map((group) => [group.label, group.to])).toEqual([['Empty result shows an error', '../gaps']])
    expect(sections.find((section) => section.key === 'logs')?.groups.map((group) => [group.label, group.to])).toEqual([['Run log', '../logs']])
  })
})

describe('commentSections for comments on a scenario file', () => {
  const [first] = testRunDetailFixture.scenarios
  if (!first) throw new Error('fixture too small')
  const shot = first.evidence.screenshots[0]?.path ?? ''

  it('lists a screenshot comment in its scenario group, in the order written', () => {
    const review = reviewFixture({
      comments: [
        commentFixture('c1', { kind: 'run-file', ref: shot }, 'wrong colour', { kind: 'incorrect' }),
        commentFixture('c2', { kind: 'scenario', ref: first.id }, 'unclear step'),
      ],
    })
    const scenarios = commentSections(mergeComments(review, null), review, testRunDetailFixture).find((section) => section.key === 'scenarios')
    expect(scenarios?.groups).toHaveLength(1)
    expect(scenarios?.groups[0]?.label).toBe('Happy path')
    expect(scenarios?.groups[0]?.comments.map((comment) => comment.id)).toEqual(['c1', 'c2'])
  })

  it('keeps a comment on a file no scenario holds any more under the file name', () => {
    const review = reviewFixture({ comments: [commentFixture('c1', { kind: 'run-file', ref: 'run:gone/old.png' }, 'lost')] })
    const scenarios = commentSections(mergeComments(review, null), review, testRunDetailFixture).find((section) => section.key === 'scenarios')
    expect(scenarios?.groups.map((group) => [group.key, group.label])).toEqual([['run:gone/old.png', 'old.png']])
  })
})
