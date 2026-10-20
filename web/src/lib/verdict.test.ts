import { describe, expect, it } from 'vitest'
import { VERDICT_STYLE, verdictKind } from './verdict'

describe('verdictKind', () => {
  it('turns an unreviewed file with open comments into "commented"', () => {
    expect(verdictKind('none', 2)).toBe('commented')
    expect(verdictKind('none', 0)).toBe('none')
    expect(verdictKind('approved', 3)).toBe('approved')
  })

  it('has a label and icon for every kind', () => {
    for (const style of Object.values(VERDICT_STYLE)) {
      expect(style.label.length).toBeGreaterThan(0)
      expect(style.icon).toBeTypeOf('object')
    }
  })
})
