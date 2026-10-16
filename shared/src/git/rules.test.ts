import { describe, expect, it } from 'vitest'
import { COLLAPSE_CHANGED_LINES, COLLAPSE_MAX_BYTES, OMIT_MAX_BYTES } from '../constants.ts'
import { decideFile, globToRegExp, matchesCollapseGlob, type FileFacts } from './rules.ts'

function facts(overrides: Partial<FileFacts> = {}): FileFacts {
  return { path: 'src/a.ts', status: 'modified', additions: 10, deletions: 2, binary: false, sizeBefore: 1000, sizeAfter: 1200, ...overrides }
}

describe('collapse globs', () => {
  it('matches the contract globs at any depth', () => {
    for (const p of ['package-lock.json', 'web/package-lock.json', 'yarn.lock', 'a/pnpm-lock.yaml', 'x/__snapshots__/a.test.ts.snap', 'vendor/lib.min.js', 'app.min.css', 'dist/index.js', 'web/dist/assets/x.js']) {
      expect(matchesCollapseGlob(p), p).toBe(true)
    }
    for (const p of ['src/lock.ts', 'package.json', 'src/minify.ts', 'distribution/x.ts', 'src/dist.ts']) {
      expect(matchesCollapseGlob(p), p).toBe(false)
    }
  })

  it('escapes regex characters and keeps * within one segment', () => {
    expect(globToRegExp('a.b/*.ts').test('a.b/x.ts')).toBe(true)
    expect(globToRegExp('a.b/*.ts').test('axb/x.ts')).toBe(false)
    expect(globToRegExp('a/*.ts').test('a/b/x.ts')).toBe(false)
    expect(globToRegExp('a/**/x.ts').test('a/x.ts')).toBe(true)
    expect(globToRegExp('a/**/x.ts').test('a/b/c/x.ts')).toBe(true)
  })
})

describe('decideFile', () => {
  it('keeps ordinary text files open', () => {
    expect(decideFile(facts())).toEqual({ collapsed: false, collapseReason: null, omitted: false, omitReason: null })
  })

  it('collapses by changed lines, by size and by glob', () => {
    expect(decideFile(facts({ additions: COLLAPSE_CHANGED_LINES, deletions: 1 }))).toMatchObject({ collapsed: true, collapseReason: 'too-many-changed-lines', omitted: false })
    expect(decideFile(facts({ additions: COLLAPSE_CHANGED_LINES, deletions: 0 }))).toMatchObject({ collapsed: false })
    expect(decideFile(facts({ sizeAfter: COLLAPSE_MAX_BYTES + 1 }))).toMatchObject({ collapsed: true, collapseReason: 'too-large' })
    expect(decideFile(facts({ sizeAfter: COLLAPSE_MAX_BYTES }))).toMatchObject({ collapsed: false })
    expect(decideFile(facts({ path: 'package-lock.json', additions: 3, deletions: 3 }))).toMatchObject({ collapsed: true, collapseReason: 'generated-or-vendored' })
  })

  it('omits oversized text files (on either side) and never binaries', () => {
    expect(decideFile(facts({ sizeAfter: OMIT_MAX_BYTES + 1 }))).toEqual({ collapsed: true, collapseReason: 'omitted', omitted: true, omitReason: 'too-large' })
    expect(decideFile(facts({ status: 'deleted', sizeAfter: null, sizeBefore: OMIT_MAX_BYTES + 1 }))).toMatchObject({ omitted: true })
    expect(decideFile(facts({ path: 'big.bin', binary: true, sizeAfter: OMIT_MAX_BYTES + 1 }))).toMatchObject({ omitted: false, collapsed: true, collapseReason: 'too-large' })
    expect(decideFile(facts({ path: 'a.png', binary: true, additions: 0, deletions: 0, sizeAfter: 5000 }))).toMatchObject({ collapsed: false, omitted: false })
  })
})
