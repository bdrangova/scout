import { describe, expect, it } from 'vitest'
import { fp, makeTreeFile, treeFixture } from '@/test/fixtures'
import { changedFileCount } from './tree-changes'

describe('changedFileCount', () => {
  it('counts moved fingerprints, new files and vanished files', () => {
    const [a, b, ...rest] = treeFixture.files
    if (!a || !b) throw new Error('fixture too small')
    const next = {
      ...treeFixture,
      files: [{ ...a, fingerprint: fp('a:v2') }, ...rest, makeTreeFile({ path: 'zzz/new.ts', status: 'added' })],
    }
    // a changed, b vanished, new.ts appeared
    expect(changedFileCount(treeFixture, next)).toBe(3)
    expect(changedFileCount(treeFixture, treeFixture)).toBe(0)
  })
})
