import type { ReactNode } from 'react'
import type { CodeReviewDetail } from '@review-dash/shared'
import { PrReviewContext } from './pr-review-context'
export function PrReviewProvider({ detail, children }: { detail: CodeReviewDetail; children: ReactNode }) {
  return <PrReviewContext.Provider value={detail.manifest.kind === 'pr-review' ? detail : null}>{children}</PrReviewContext.Provider>
}
