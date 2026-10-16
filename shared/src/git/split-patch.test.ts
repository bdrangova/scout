import { describe, expect, it } from 'vitest'
import { parseHeaderLine, patchFileKey, readCString, splitPatch } from './split-patch.ts'

const samplePatch = [
  'diff --git a/assets/logo.png b/assets/logo.png',
  'new file mode 100644',
  'index 0000000000000000000000000000000000000000..1111111111111111111111111111111111111111',
  'Binary files /dev/null and b/assets/logo.png differ',
  'diff --git a/package-lock.json b/package-lock.json',
  'index 2222222222222222222222222222222222222222..3333333333333333333333333333333333333333 100644',
  '--- a/package-lock.json',
  '+++ b/package-lock.json',
  '@@ -1 +1 @@',
  '-{}',
  '+{ "a": 1 }',
  'diff --git a/src/app.ts b/src/app.ts',
  'index 4444444444444444444444444444444444444444..5555555555555555555555555555555555555555 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,2 +1,2 @@',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
  'diff --git a/src/new.ts b/src/new.ts',
  'new file mode 100644',
  'index 0000000000000000000000000000000000000000..6666666666666666666666666666666666666666',
  '--- /dev/null',
  '+++ b/src/new.ts',
  '@@ -0,0 +1 @@',
  '+export {}',
  'diff --git a/src/old.ts b/src/old.ts',
  'deleted file mode 100644',
  'index 7777777777777777777777777777777777777777..0000000000000000000000000000000000000000',
  '--- a/src/old.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-gone',
  'diff --git a/src/original.ts b/src/renamed.ts',
  'similarity index 90%',
  'rename from src/original.ts',
  'rename to src/renamed.ts',
  'index 8888888888888888888888888888888888888888..9999999999999999999999999999999999999999 100644',
  '--- a/src/original.ts',
  '+++ b/src/renamed.ts',
  '@@ -1 +1 @@',
  '-x',
  '+y',
  '\\ No newline at end of file',
  '',
].join('\n')

describe('splitPatch on a multi-file patch', () => {
  const files = splitPatch(samplePatch)

  it('keys every entry by its new path (old path for deletions)', () => {
    expect([...files.keys()]).toEqual(['assets/logo.png', 'package-lock.json', 'src/app.ts', 'src/new.ts', 'src/old.ts', 'src/renamed.ts'])
  })

  it('keeps every byte: the slices concatenate back to the original', () => {
    expect([...files.values()].join('')).toBe(samplePatch)
    for (const slice of files.values()) expect(slice.startsWith('diff --git ')).toBe(true)
  })

  it('keeps rename headers and the no-newline marker in the rename slice', () => {
    const slice = files.get('src/renamed.ts') ?? ''
    expect(slice).toContain('rename from src/original.ts')
    expect(slice).toContain('rename to src/renamed.ts')
    expect(slice.endsWith('\\ No newline at end of file\n')).toBe(true)
  })

  it('slices the deletion, the addition and the binary entry', () => {
    expect(files.get('src/old.ts')).toContain('+++ /dev/null')
    expect(files.get('src/new.ts')).toContain('--- /dev/null')
    expect(files.get('assets/logo.png')).toBe(
      'diff --git a/assets/logo.png b/assets/logo.png\nnew file mode 100644\nindex 0000000000000000000000000000000000000000..1111111111111111111111111111111111111111\nBinary files /dev/null and b/assets/logo.png differ\n',
    )
  })
})

describe('splitPatch edge cases', () => {
  it('handles quoted paths with spaces and C-escaped non-ASCII bytes', () => {
    const patch = [
      'diff --git "a/dir/my file.ts" "b/dir/my file.ts"',
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '--- "a/dir/my file.ts"',
      '+++ "b/dir/my file.ts"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"',
      'index 3333333333333333333333333333333333333333..4444444444444444444444444444444444444444 100644',
      '--- "a/caf\\303\\251.txt"',
      '+++ "b/caf\\303\\251.txt"',
      '@@ -1 +1 @@',
      '-x',
      '+y',
      '',
    ].join('\n')
    expect([...splitPatch(patch).keys()]).toEqual(['dir/my file.ts', 'café.txt'])
  })

  it('handles unquoted paths with spaces (git does not quote spaces)', () => {
    const patch = ['diff --git a/dir/my file.ts b/dir/my file.ts', 'old mode 100644', 'new mode 100755', ''].join('\n')
    expect([...splitPatch(patch).keys()]).toEqual(['dir/my file.ts'])
  })

  it('handles quoted renames, copies, 100% renames and binary deletions', () => {
    const patch = [
      'diff --git "a/old caf\\303\\251.md" "b/new caf\\303\\251.md"',
      'similarity index 100%',
      'rename from "old caf\\303\\251.md"',
      'rename to "new caf\\303\\251.md"',
      'diff --git a/src/a.ts b/src/copy of a.ts',
      'similarity index 100%',
      'copy from src/a.ts',
      'copy to src/copy of a.ts',
      'diff --git a/img.png b/img.png',
      'deleted file mode 100644',
      'index 1111111111111111111111111111111111111111..0000000000000000000000000000000000000000',
      'Binary files a/img.png and /dev/null differ',
      'diff --git a/x.ts b/y.ts',
      'similarity index 90%',
      'rename from x.ts',
      'rename to y.ts',
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '--- a/x.ts',
      '+++ b/y.ts',
      '@@ -1 +1 @@',
      '-1',
      '+2',
      '',
    ].join('\n')
    expect([...splitPatch(patch).keys()]).toEqual(['new café.md', 'src/copy of a.ts', 'img.png', 'y.ts'])
  })

  it('ignores a preamble and accepts CRLF line endings', () => {
    const patch = 'From: someone\r\nSubject: x\r\n\r\ndiff --git a/a.ts b/a.ts\r\n--- a/a.ts\r\n+++ b/a.ts\r\n@@ -1 +1 @@\r\n-1\r\n+2\r\n'
    const files = splitPatch(patch)
    expect([...files.keys()]).toEqual(['a.ts'])
    expect(files.get('a.ts')?.startsWith('diff --git a/a.ts b/a.ts\r\n')).toBe(true)
  })

  it('returns an empty map for an empty patch', () => {
    expect(splitPatch('').size).toBe(0)
    expect(splitPatch('\n').size).toBe(0)
  })
})

describe('header parsing helpers', () => {
  it('parseHeaderLine splits plain, spaced and quoted headers', () => {
    expect(parseHeaderLine('diff --git a/src/a.ts b/src/a.ts')).toEqual({ oldPath: 'src/a.ts', newPath: 'src/a.ts' })
    expect(parseHeaderLine('diff --git a/my file.ts b/my file.ts')).toEqual({ oldPath: 'my file.ts', newPath: 'my file.ts' })
    expect(parseHeaderLine('diff --git "a/q\\"x" "b/q\\"x"')).toEqual({ oldPath: 'q"x', newPath: 'q"x' })
    expect(parseHeaderLine('diff --git a/x b/y')).toEqual({ oldPath: 'x', newPath: 'y' })
    expect(parseHeaderLine('not a header')).toBeNull()
  })

  it('readCString decodes escapes and reports the end index', () => {
    expect(readCString('"a\\tb\\\\c\\"" rest', 0)).toEqual({ value: 'a\tb\\c"', end: 11 })
    expect(readCString('"\\303\\251"', 0)).toEqual({ value: 'é', end: 10 })
    expect(readCString('"unterminated', 0)).toBeNull()
    expect(readCString('x', 0)).toBeNull()
  })

  it('patchFileKey falls back to the header for mode-only changes', () => {
    expect(patchFileKey('diff --git a/bin/run b/bin/run\nold mode 100644\nnew mode 100755\n')).toBe('bin/run')
    expect(patchFileKey('garbage')).toBeNull()
  })
})
