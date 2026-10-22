import type { CodeReviewDetail, SessionDetail, TestRunDetail } from '@review-dash/shared'
import { useSessionContext } from './session-context'

/** True for a test run's detail; a code review's detail may lack `kind`. */
export function isTestRunDetail(detail: SessionDetail): detail is TestRunDetail {
  return detail.kind === 'test-run'
}

export function isCodeReviewDetail(detail: SessionDetail): detail is CodeReviewDetail {
  return detail.kind !== 'test-run'
}

/** The open session's detail, asserting it is a code review (for the pages and widgets only code reviews have). */
export function useCodeReviewDetail(): CodeReviewDetail {
  const { detail } = useSessionContext()
  if (!isCodeReviewDetail(detail)) throw new Error('This view needs a code review session')
  return detail
}

/** The open session's detail, asserting it is a test run. */
export function useTestRunDetail(): TestRunDetail {
  const { detail } = useSessionContext()
  if (!isTestRunDetail(detail)) throw new Error('This view needs a test run session')
  return detail
}
