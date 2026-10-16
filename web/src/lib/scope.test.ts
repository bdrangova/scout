import { describe, expect, it } from 'vitest'
import { COMMIT_SHAS, makeCommitList } from '@/test/fixtures'
import { parseScope, resolveScope, searchString, stepScope, timelineItems, withScope } from './scope'

const list = makeCommitList()

describe('scope', () => {
  it('parses a commit sha or "uncommitted" and treats anything else as the full diff', () => {
    expect(parseScope(COMMIT_SHAS.first)).toBe(COMMIT_SHAS.first)
    expect(parseScope('uncommitted')).toBe('uncommitted')
    expect(parseScope('abc1234')).toBeNull()
    expect(parseScope('')).toBeNull()
    expect(parseScope(null)).toBeNull()
  })

  it('keeps a scope the loaded list knows and falls back to the full diff otherwise', () => {
    expect(resolveScope(COMMIT_SHAS.merge, list)).toBe(COMMIT_SHAS.merge)
    expect(resolveScope('f'.repeat(40), list)).toBeNull()
    expect(resolveScope('uncommitted', list)).toBe('uncommitted')
    expect(resolveScope('uncommitted', makeCommitList({ uncommitted: null }))).toBeNull()
    // Unknown while the list loads: nothing is dropped yet.
    expect(resolveScope(COMMIT_SHAS.first, null)).toBe(COMMIT_SHAS.first)
    expect(resolveScope(null, list)).toBeNull()
  })

  it('sets or removes ?commit= and keeps the other params', () => {
    const params = new URLSearchParams('mode=grid')
    expect(searchString(withScope(params, COMMIT_SHAS.first))).toBe(`?mode=grid&commit=${COMMIT_SHAS.first}`)
    expect(searchString(withScope(new URLSearchParams(`mode=grid&commit=${COMMIT_SHAS.first}`), null))).toBe('?mode=grid')
    expect(searchString(new URLSearchParams())).toBe('')
  })

  it('lists the timeline items in order and steps through them with clamping', () => {
    expect(timelineItems(list).map((item) => item.kind)).toEqual(['full', 'commit', 'commit', 'commit', 'uncommitted'])
    expect(timelineItems(null).map((item) => item.kind)).toEqual(['full'])
    expect(stepScope(list, null, 1)).toBe(COMMIT_SHAS.first)
    expect(stepScope(list, null, -1)).toBeNull()
    expect(stepScope(list, COMMIT_SHAS.last, 1)).toBe('uncommitted')
    expect(stepScope(list, 'uncommitted', 1)).toBe('uncommitted')
    expect(stepScope(list, COMMIT_SHAS.first, -1)).toBeNull()
    expect(stepScope(null, null, 1)).toBeNull()
  })

  it('drops merge commits when asked, keeps the selected one, and steps over the hidden ones', () => {
    const hidden = { hideMerges: true, selected: null }
    expect(timelineItems(list, hidden).map((item) => item.scope)).toEqual([null, COMMIT_SHAS.first, COMMIT_SHAS.last, 'uncommitted'])
    expect(timelineItems(list, { hideMerges: false, selected: null })).toHaveLength(5)
    expect(timelineItems(list, { hideMerges: true, selected: COMMIT_SHAS.merge }).map((item) => item.scope)).toContain(COMMIT_SHAS.merge)
    expect(stepScope(list, COMMIT_SHAS.first, 1, true)).toBe(COMMIT_SHAS.last)
    expect(stepScope(list, COMMIT_SHAS.last, -1, true)).toBe(COMMIT_SHAS.first)
    // From the selected (and so still visible) merge, stepping lands on its neighbours.
    expect(stepScope(list, COMMIT_SHAS.merge, 1, true)).toBe(COMMIT_SHAS.last)
    expect(stepScope(list, COMMIT_SHAS.merge, -1, true)).toBe(COMMIT_SHAS.first)
    expect(stepScope(list, COMMIT_SHAS.first, 1)).toBe(COMMIT_SHAS.merge)
  })
})
