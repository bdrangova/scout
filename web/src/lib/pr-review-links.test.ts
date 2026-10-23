import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prReviewLocationUrl } from './pr-review-links'
const pr = 'https://github.com/acme/app/pull/42'
const path = 'src/a file.ts'
const hash = createHash('sha256').update(path).digest('hex')
describe('PR comment destination links', () => {
  it('opens the PR, file, right-side line and old-side range', () => {
    expect(prReviewLocationUrl(pr, null)).toBe(pr)
    expect(prReviewLocationUrl(pr, path)).toBe(`${pr}/files#diff-${hash}`)
    expect(prReviewLocationUrl(pr, path, { side: 'new', line: 12 })).toBe(`${pr}/files#diff-${hash}R12`)
    expect(prReviewLocationUrl(pr, path, { side: 'old', line: 3, endLine: 5 })).toBe(`${pr}/files#diff-${hash}L3-L5`)
    expect(prReviewLocationUrl(pr, path, { side: 'new', line: 3, endLine: 5 })).toBe(`${pr}/files#diff-${hash}R3-R5`)
  })
  it('preserves the enterprise host and discards unrelated query/hash state', () => {
    expect(prReviewLocationUrl('https://git.example.test/team/repo/pull/3/?x=1#old', path, { side: 'new', line: 1, endLine: 1 })).toBe(`https://git.example.test/team/repo/pull/3/files#diff-${hash}R1`)
  })
})
