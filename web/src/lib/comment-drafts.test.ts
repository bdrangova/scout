import { describe, expect, it } from 'vitest'
import { draftKey, unsavedDraftsOf } from './comment-drafts'

describe('comment drafts', () => {
  it('keys a file draft by its path and the artifact kinds by prefix', () => {
    expect(draftKey({ kind: 'file', ref: 'src/a.ts' })).toBe('src/a.ts')
    expect(draftKey({ kind: 'spec', ref: 'plan.md' })).toBe('spec::plan.md')
    expect(draftKey({ kind: 'extra', ref: 'notes.md' })).toBe('extra::notes.md')
    expect(draftKey({ kind: 'evidence', ref: 'a.png' })).toBe('evidence::a.png')
  })

  it('lists the drafts with text, in order, and ignores blank ones', () => {
    expect(unsavedDraftsOf({ 'src/a.ts': 'fix', 'spec::plan.md': ' x ', 'extra::n.md': '  ', 'evidence::a.png': 'why' })).toEqual([
      { kind: 'file', ref: 'src/a.ts' },
      { kind: 'spec', ref: 'plan.md' },
      { kind: 'evidence', ref: 'a.png' },
    ])
    expect(unsavedDraftsOf({})).toEqual([])
  })
})
