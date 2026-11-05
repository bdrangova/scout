import { describe, expect, it } from 'vitest'
import { commitsPath, fileContentsPath, fileContentsUrl, filePatchPath, isImagePath, isMarkdownPath, otherKindRoute, runFileUrl, runLogUrl, scopeTreePath, sessionRoute, testRunRoute } from './paths'

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

  it('builds the web routes of both session kinds', () => {
    expect(sessionRoute('code-review', 'sid')).toBe('/s/sid')
    expect(sessionRoute('code-review', 'sid', 'files')).toBe('/s/sid/files')
    expect(sessionRoute('test-run', 'sid')).toBe('/t/sid')
    expect(sessionRoute('test-run', 'sid', 'review')).toBe('/t/sid/review')
    expect(testRunRoute('sid', 'review')).toBe('/t/sid/review')
    expect(testRunRoute('sid', 'review', 's1-pass')).toBe('/t/sid/review/s1-pass')
    expect(otherKindRoute('code-review')).toBe('/t')
    expect(otherKindRoute('test-run')).toBe('/pr')
    expect(otherKindRoute('pr-review')).toBe('/')
    expect(otherKindRoute('worktrees')).toBe('/d')
    expect(sessionRoute('pr-review', 'sid', 'files')).toBe('/s/sid/files')
  })

  it('turns an index ref into a run file url, escaping each segment', () => {
    expect(runFileUrl('sid', 'run:scenarios/s1-pass/videos/a.mp4')).toBe('/api/sessions/sid/run/file/run/scenarios/s1-pass/videos/a.mp4')
    expect(runFileUrl('sid', 'bugs:x/screens hot/1 #2.png')).toBe('/api/sessions/sid/run/file/bugs/x/screens%20hot/1%20%232.png')
    expect(runFileUrl('sid', 'plan:test-plan.md')).toBe('/api/sessions/sid/run/file/plan/test-plan.md')
  })

  it('builds the run log slice url', () => {
    expect(runLogUrl('sid', 'run:logs/run.log')).toBe('/api/sessions/sid/run/log/run/logs/run.log')
    expect(runLogUrl('sid', 'run:logs/run.log', 5, 9)).toBe('/api/sessions/sid/run/log/run/logs/run.log?from=5&to=9')
  })
})
