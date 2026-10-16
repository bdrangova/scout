import { describe, expect, it } from 'vitest'
import { commitsPath, fileContentsPath, fileContentsUrl, filePatchPath, isImagePath, isMarkdownPath, scopeTreePath } from './paths'

describe('paths', () => {
  it('recognises markdown files by extension, case-insensitively', () => {
    expect(isMarkdownPath('README.md')).toBe(true)
    expect(isMarkdownPath('docs/Guide.MARKDOWN')).toBe(true)
    expect(isMarkdownPath('src/page.mdx')).toBe(true)
    expect(isMarkdownPath('src/app.ts')).toBe(false)
    expect(isMarkdownPath('Makefile')).toBe(false)
    expect(isImagePath('a.PNG')).toBe(true)
  })

  it('builds the contents route for one side', () => {
    expect(fileContentsPath('sid', 'docs/a b.md', 'after')).toBe('/sessions/sid/files/docs/a%20b.md/contents?side=after')
    expect(fileContentsUrl('sid', 'x.png', 'before')).toBe('/api/sessions/sid/files/x.png/contents?side=before')
  })

  it('builds the commits route and the scope routes for the tree, the patch and the contents', () => {
    const sha = 'a'.repeat(40)
    expect(commitsPath('sid')).toBe('/sessions/sid/commits')
    expect(scopeTreePath('sid', 'uncommitted')).toBe('/sessions/sid/scopes/uncommitted')
    expect(filePatchPath('sid', 'src/a b.ts', true, sha)).toBe(`/sessions/sid/scopes/${sha}/files/src/a%20b.ts/patch?force=1`)
    expect(filePatchPath('sid', 'src/a.ts')).toBe('/sessions/sid/files/src/a.ts/patch')
    expect(fileContentsPath('sid', 'x.md', 'before', 'uncommitted')).toBe('/sessions/sid/scopes/uncommitted/files/x.md/contents?side=before')
    expect(fileContentsUrl('sid', 'x.png', 'after', sha)).toBe(`/api/sessions/sid/scopes/${sha}/files/x.png/contents?side=after`)
  })
})
