import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../errors.ts'
import { safeJoin, storePaths } from './paths.ts'

const root = path.resolve('/store/sessions/20260101-0900-fixture-abcd')

describe('safeJoin', () => {
  it('resolves a nested relative path under the root', () => {
    expect(safeJoin(root, 'revisions/1/files/after/src/app.ts')).toBe(
      path.join(root, 'revisions', '1', 'files', 'after', 'src', 'app.ts'),
    )
    expect(safeJoin(root, './spec/jira.md')).toBe(path.join(root, 'spec', 'jira.md'))
  })

  it.each([
    ['empty', ''],
    ['dot', '.'],
    ['parent segment', '../manifest.json'],
    ['nested parent segment', 'revisions/../../other/manifest.json'],
    ['backslash parent', 'revisions\\..\\..\\x'],
    ['absolute', '/etc/passwd'],
    ['absolute copy of root', `${root}/manifest.json`],
    ['windows drive', 'C:/Windows/system.ini'],
    ['null byte', 'spec/jira.md\0.png'],
  ])('rejects %s with a 404 HttpError', (_label, relative) => {
    expect(() => safeJoin(root, relative)).toThrow(HttpError)
    try {
      safeJoin(root, relative)
    } catch (err) {
      expect((err as HttpError).status).toBe(404)
    }
  })
})

describe('storePaths', () => {
  const paths = storePaths({ home: '/store' })

  it('derives the sessions folder and a session folder', () => {
    expect(paths.sessionsDir).toBe(path.resolve('/store/sessions'))
    expect(paths.sessionDir('20260101-0900-fixture-abcd')).toBe(root)
    expect(paths.archiveDir).toBe(path.resolve('/store/archive'))
    expect(paths.archivedSessionDir('20260101-0900-fixture-abcd')).toBe(path.resolve('/store/archive/20260101-0900-fixture-abcd'))
  })

  it.each(['..', 'nope', '20260101-0900-Fixture-abcd', '20260101-0900-fixture-abcd/x', '20260101-0900-fixture-zzzz'])(
    'rejects the session id %s',
    (id) => {
      expect(() => paths.sessionDir(id)).toThrow(HttpError)
      expect(() => paths.archivedSessionDir(id)).toThrow(HttpError)
    },
  )
})
