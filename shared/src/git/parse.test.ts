import { describe, expect, it } from 'vitest'
import { parseNameStatusZ, parseNumstatZ } from './parse.ts'

describe('parseNameStatusZ', () => {
  it('parses plain statuses, renames with a score, copies and deletions', () => {
    const out = ['M\0src/app.ts', 'A\0src/new.ts', 'D\0src/old.ts', 'R087\0src/Banner.tsx\0src/Notice.tsx', 'C100\0a.ts\0b.ts', 'T\0link'].join('\0') + '\0'
    expect(parseNameStatusZ(out)).toEqual([
      { code: 'M', score: null, path: 'src/app.ts', oldPath: null },
      { code: 'A', score: null, path: 'src/new.ts', oldPath: null },
      { code: 'D', score: null, path: 'src/old.ts', oldPath: null },
      { code: 'R', score: 87, path: 'src/Notice.tsx', oldPath: 'src/Banner.tsx' },
      { code: 'C', score: 100, path: 'b.ts', oldPath: 'a.ts' },
      { code: 'T', score: null, path: 'link', oldPath: null },
    ])
  })

  it('keeps spaces and unicode in paths', () => {
    expect(parseNameStatusZ('M\0dir with space/ünï.ts\0')).toEqual([{ code: 'M', score: null, path: 'dir with space/ünï.ts', oldPath: null }])
  })

  it('returns nothing for empty output and rejects unknown codes', () => {
    expect(parseNameStatusZ('')).toEqual([])
    expect(() => parseNameStatusZ('U\0conflict.ts\0')).toThrow(/unsupported/)
    expect(() => parseNameStatusZ('R100\0only-old')).toThrow(/truncated/)
  })
})

describe('parseNumstatZ', () => {
  it('parses counts, binaries and renames', () => {
    const out = ['12\t3\tsrc/app.ts', '-\t-\tassets/icon.png', '0\t0\t', 'src/Banner.tsx', 'src/Notice.tsx'].join('\0') + '\0'
    expect(parseNumstatZ(out)).toEqual([
      { path: 'src/app.ts', oldPath: null, additions: 12, deletions: 3, binary: false },
      { path: 'assets/icon.png', oldPath: null, additions: 0, deletions: 0, binary: true },
      { path: 'src/Notice.tsx', oldPath: 'src/Banner.tsx', additions: 0, deletions: 0, binary: false },
    ])
  })

  it('handles a tab inside a path', () => {
    expect(parseNumstatZ('1\t1\tweird\tname.txt\0')).toEqual([{ path: 'weird\tname.txt', oldPath: null, additions: 1, deletions: 1, binary: false }])
  })
})
