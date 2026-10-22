import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { SESSION_ID, sessionDetailFixture, testRunDetailFixture } from '@/test/fixtures'
import { isCodeReviewDetail, isTestRunDetail, useCodeReviewDetail, useTestRunDetail } from './detail-kind'

function wrapperFor(detail: typeof sessionDetailFixture | typeof testRunDetailFixture) {
  return ({ children }: { children: ReactNode }) => <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>{children}</SessionContext.Provider>
}

describe('detail kind', () => {
  it('tells a test run from a code review, whose detail may lack `kind`', () => {
    expect(isTestRunDetail(testRunDetailFixture)).toBe(true)
    expect(isTestRunDetail(sessionDetailFixture)).toBe(false)
    expect(isTestRunDetail({ ...sessionDetailFixture, kind: 'code-review' })).toBe(false)
    expect(isCodeReviewDetail(sessionDetailFixture)).toBe(true)
    expect(isCodeReviewDetail(testRunDetailFixture)).toBe(false)
  })

  it('hands each hook its own kind', () => {
    expect(renderHook(() => useCodeReviewDetail(), { wrapper: wrapperFor(sessionDetailFixture) }).result.current).toBe(sessionDetailFixture)
    expect(renderHook(() => useTestRunDetail(), { wrapper: wrapperFor(testRunDetailFixture) }).result.current).toBe(testRunDetailFixture)
  })

  it('throws when the session is of the other kind', () => {
    const quiet = () => {}
    const spy = console.error
    console.error = quiet
    try {
      expect(() => renderHook(() => useCodeReviewDetail(), { wrapper: wrapperFor(testRunDetailFixture) })).toThrow('code review')
      expect(() => renderHook(() => useTestRunDetail(), { wrapper: wrapperFor(sessionDetailFixture) })).toThrow('test run')
    } finally {
      console.error = spy
    }
  })
})
