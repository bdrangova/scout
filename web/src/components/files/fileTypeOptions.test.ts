import { describe, expect, it } from 'vitest'
import { filesFixture, makeTreeFile } from '@/test/fixtures'
import { fileTypeOptions, filterByTypes } from './fileTypeOptions'
import { parseTypes } from './useFileTypeFilter'

describe('fileTypeOptions', () => {
  it('lists only the types present, in palette order, with the extensions seen and the counts', () => {
    const options = fileTypeOptions(filesFixture)
    expect(options.map((option) => [option.type.id, [...option.exts], option.count])).toEqual([
      ['ts', ['.ts'], 1],
      ['react', ['.tsx'], 2],
      ['json', ['.json'], 1],
      ['css', ['.scss'], 1],
      ['other', ['.png'], 1],
    ])
  })

  it('lists what "other" actually contains, sorted, and skips extensionless names', () => {
    const files = [makeTreeFile({ path: 'Makefile' }), makeTreeFile({ path: 'docs/b.md' }), makeTreeFile({ path: 'a.PNG' })]
    expect(fileTypeOptions(files)).toEqual([{ type: expect.objectContaining({ id: 'other' }), exts: ['.md', '.png'], count: 3 }])
  })

  it('is empty for no files', () => {
    expect(fileTypeOptions([])).toEqual([])
  })
})

describe('filterByTypes', () => {
  it('narrows to the selected types and ignores a selection of absent types', () => {
    expect(filterByTypes(filesFixture, ['react']).map((file) => file.path)).toEqual([filesFixture[0]?.path, filesFixture[2]?.path])
    expect(filterByTypes(filesFixture, ['yaml'])).toBe(filesFixture)
    expect(filterByTypes(filesFixture, [])).toBe(filesFixture)
  })
})

describe('parseTypes', () => {
  it('keeps the known ids in palette order and drops the rest', () => {
    expect(parseTypes('react,ts,bogus,,ts')).toEqual(['ts', 'react'])
    expect(parseTypes(null)).toEqual([])
    expect(parseTypes('')).toEqual([])
  })
})
