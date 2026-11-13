import { describe, expect, it } from 'vitest'
import { parseAliasConfig, resolveImport } from './resolve.ts'
import type { AliasConfig } from './resolve.ts'

const set = (...paths: string[]) => new Set(paths)
const readFrom = (files: Record<string, string>) => async (p: string) => files[p] ?? null

describe('resolveImport (relative)', () => {
  const changed = set('src/a.ts', 'src/b.tsx', 'src/c.js', 'src/ui/index.ts', 'src/d.ts', 'src/style.css', 'lib/x.ts')
  it('tries the exact path, then the extensions, then index files', () => {
    expect(resolveImport('./a', 'src/main.ts', changed, [])).toBe('src/a.ts')
    expect(resolveImport('./b', 'src/main.ts', changed, [])).toBe('src/b.tsx')
    expect(resolveImport('./c', 'src/main.ts', changed, [])).toBe('src/c.js')
    expect(resolveImport('./ui', 'src/main.ts', changed, [])).toBe('src/ui/index.ts')
    expect(resolveImport('./style.css', 'src/main.ts', changed, [])).toBe('src/style.css')
    expect(resolveImport('../lib/x', 'src/main.ts', changed, [])).toBe('lib/x.ts')
  })
  it('maps a .js specifier onto a .ts source', () => {
    expect(resolveImport('./d.js', 'src/main.ts', changed, [])).toBe('src/d.ts')
  })
  it('keeps only changed files and never leaves the repo', () => {
    expect(resolveImport('./unchanged', 'src/main.ts', changed, [])).toBeNull()
    expect(resolveImport('../../etc/passwd', 'src/main.ts', changed, [])).toBeNull()
    expect(resolveImport('react', 'src/main.ts', changed, [])).toBeNull()
    expect(resolveImport('./a\0', 'src/main.ts', changed, [])).toBeNull()
  })
})

describe('parseAliasConfig', () => {
  it('reads paths of a JSONC tsconfig relative to its folder', async () => {
    const config = await parseAliasConfig(
      'app/tsconfig.json',
      readFrom({ 'app/tsconfig.json': '{\n // comment\n "compilerOptions": { "paths": { "@client/*": ["./*"], "~": ["./index.ts"], }, },\n}' }),
    )
    expect(config).toEqual({ dir: 'app', baseUrl: null, paths: [{ pattern: '@client/*', targets: ['app/*'] }, { pattern: '~', targets: ['app/index.ts'] }] })
  })
  it('follows one relative extends and lets the child override', async () => {
    const read = readFrom({
      'pkg/tsconfig.json': '{ "extends": "../tsconfig.base", "compilerOptions": {} }',
      'tsconfig.base.json': '{ "compilerOptions": { "baseUrl": "src", "paths": { "@/*": ["*"] } } }',
    })
    expect(await parseAliasConfig('pkg/tsconfig.json', read)).toEqual({ dir: 'pkg', baseUrl: 'src', paths: [{ pattern: '@/*', targets: ['src/*'] }] })
  })
  it('answers null for no aliases, a package extends or invalid json', async () => {
    expect(await parseAliasConfig('tsconfig.json', readFrom({ 'tsconfig.json': '{ "extends": "@tsconfig/node", "compilerOptions": { "strict": true } }' }))).toBeNull()
    expect(await parseAliasConfig('tsconfig.json', readFrom({ 'tsconfig.json': '{ nope' }))).toBeNull()
    expect(await parseAliasConfig('tsconfig.json', readFrom({}))).toBeNull()
  })
})

describe('resolveImport (aliases)', () => {
  const client: AliasConfig = { dir: 'client', baseUrl: null, paths: [{ pattern: '@client/*', targets: ['client/*'] }] }
  const tests: AliasConfig = { dir: 'tests', baseUrl: null, paths: [{ pattern: '@client/*', targets: ['client/*'] }, { pattern: '@t/*', targets: ['tests/*'] }] }
  const other: AliasConfig = { dir: 'other', baseUrl: 'other/src', paths: [] }
  const changed = set('client/ui/Base.js', 'client/pages/index.ts', 'tests/helper.ts', 'other/src/lib/z.ts')

  it('uses the nearest config and tries the extension and index candidates', () => {
    expect(resolveImport('@client/ui/Base', 'client/pages/A.js', changed, [client, tests])).toBe('client/ui/Base.js')
    expect(resolveImport('@client/pages', 'client/ui/B.js', changed, [client, tests])).toBe('client/pages/index.ts')
  })
  it('falls back to the other configs for files outside any config folder', () => {
    expect(resolveImport('@client/ui/Base', 'e2e/steps.ts', changed, [client, tests])).toBe('client/ui/Base.js')
    expect(resolveImport('@t/helper', 'client/ui/B.js', changed, [client, tests])).toBe('tests/helper.ts')
  })
  it('resolves bare specifiers against baseUrl', () => {
    expect(resolveImport('lib/z', 'other/main.ts', changed, [other])).toBe('other/src/lib/z.ts')
    expect(resolveImport('lib/missing', 'other/main.ts', changed, [other])).toBeNull()
  })
  it('does not let an alias escape the repo', () => {
    const evil: AliasConfig = { dir: '', baseUrl: null, paths: [{ pattern: '@x/*', targets: ['../outside/*'] }] }
    expect(resolveImport('@x/a', 'a.ts', changed, [evil])).toBeNull()
  })
})
