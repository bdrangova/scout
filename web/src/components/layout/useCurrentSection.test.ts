import { describe, expect, it } from 'vitest'
import { sectionOfPath } from './useCurrentSection'

describe('sectionOfPath', () => {
  it('reads the section of a session route', () => {
    expect(sectionOfPath('/s/abc/spec')).toBe('spec')
    expect(sectionOfPath('/s/abc/files')).toBe('files')
    expect(sectionOfPath('/s/abc/files/src/a/b.ts')).toBe('files')
    expect(sectionOfPath('/s/abc/submit')).toBe('submit')
  })

  it('is null off the session routes', () => {
    expect(sectionOfPath('/')).toBeNull()
    expect(sectionOfPath('/s/abc')).toBeNull()
    expect(sectionOfPath('/s/abc/nothing')).toBeNull()
  })
})
