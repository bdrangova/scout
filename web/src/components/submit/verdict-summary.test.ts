import { describe, expect, it } from 'vitest'
import { suggestDecision } from './verdict-summary'

describe('suggestDecision', () => {
  it('any rejected file → request changes', () => {
    expect(suggestDecision({ approved: 5, rejected: 1, commented: 0, notReviewed: 0 })).toBe('request-changes')
  })
  it('every file approved → approve', () => {
    expect(suggestDecision({ approved: 4, rejected: 0, commented: 0, notReviewed: 0 })).toBe('approve')
  })
  it('otherwise none, also for an empty tree', () => {
    expect(suggestDecision({ approved: 3, rejected: 0, commented: 1, notReviewed: 0 })).toBe('undecided')
    expect(suggestDecision({ approved: 0, rejected: 0, commented: 0, notReviewed: 0 })).toBe('undecided')
  })
})
