import { describe, expect, it } from 'vitest'
import { reviewBreakdown } from './review-breakdown'

describe('reviewBreakdown', () => {
  it('takes commented from the progress (open comments), not from every comment ever made', () => {
    const summary = { approved: 2, rejected: 1, commented: 3, notReviewed: 4 }
    expect(reviewBreakdown(summary, { reviewed: 4, total: 10 })).toEqual({ approved: 2, rejected: 1, commented: 1, notReviewed: 6 })
  })

  it('never goes negative when the progress is behind the verdicts', () => {
    expect(reviewBreakdown({ approved: 3, rejected: 0, commented: 0, notReviewed: 0 }, { reviewed: 1, total: 3 })).toEqual({
      approved: 3,
      rejected: 0,
      commented: 0,
      notReviewed: 0,
    })
  })

  it('has nothing to show for an empty diff', () => {
    expect(reviewBreakdown({ approved: 0, rejected: 0, commented: 0, notReviewed: 0 }, { reviewed: 0, total: 0 })).toEqual({
      approved: 0,
      rejected: 0,
      commented: 0,
      notReviewed: 0,
    })
  })
})
