import { describe, expect, it } from 'vitest'
import { FILE_TYPES, fileTypeClass, fileTypeOf } from './file-type'

describe('fileTypeOf', () => {
  it.each([
    ['src/a.ts', 'ts'],
    ['src/a.mts', 'ts'],
    ['src/a.cts', 'ts'],
    ['a.js', 'js'],
    ['a.mjs', 'js'],
    ['a.cjs', 'js'],
    ['src/App.tsx', 'react'],
    ['src/App.jsx', 'react'],
    ['ci.yml', 'yaml'],
    ['ci.yaml', 'yaml'],
    ['package.json', 'json'],
    ['tsconfig.jsonc', 'json'],
    ['a.css', 'css'],
    ['a.scss', 'css'],
    ['a.less', 'css'],
    ['README.md', 'other'],
    ['Makefile', 'other'],
    ['.gitignore', 'other'],
    ['dir.ts/file', 'other'],
  ])('%s → %s', (path, id) => {
    expect(fileTypeOf(path).id).toBe(id)
  })

  it('uses the last extension and ignores case', () => {
    expect(fileTypeOf('Foo.test.TS').id).toBe('ts')
    expect(fileTypeOf('styles.module.SCSS').id).toBe('css')
  })

  it('lists every id once and maps ids to ft-* classes', () => {
    expect(FILE_TYPES.map((t) => t.id)).toEqual(['ts', 'js', 'react', 'yaml', 'json', 'css', 'other'])
    expect(fileTypeClass('react')).toBe('ft-react')
  })
})
