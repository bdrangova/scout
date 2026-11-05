import { describe, expect, it } from 'vitest'
import { statusOfReview } from './review-status.ts'

describe('statusOfReview', () => {
  it('maps a review verdict to a session status, and a dismissed review to none', () => {
    expect(statusOfReview('approved')).toBe('approved')
    expect(statusOfReview('commented')).toBe('commented')
    expect(statusOfReview('changes-requested')).toBe('commented')
    expect(statusOfReview('dismissed')).toBeNull()
  })
})
