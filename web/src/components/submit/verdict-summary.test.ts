import { describe, expect, it } from 'vitest'
import { suggestDecision, suggestTestRunDecision } from './verdict-summary'

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

describe('suggestTestRunDecision', () => {
  it('requests changes for a rejected scenario or any open comment, otherwise accepts', () => {
    expect(suggestTestRunDecision({ approved: 2, rejected: 1, commented: 0, notReviewed: 0 }, 0)).toBe('request-changes')
    expect(suggestTestRunDecision({ approved: 3, rejected: 0, commented: 0, notReviewed: 0 }, 2)).toBe('request-changes')
    expect(suggestTestRunDecision({ approved: 3, rejected: 0, commented: 0, notReviewed: 0 }, 0)).toBe('approve')
  })
})
