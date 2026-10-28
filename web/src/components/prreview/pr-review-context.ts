import { createContext, useContext } from 'react'
import { reportMatchesTree, type CodeReviewDetail } from '@scout/shared'
export const PrReviewContext = createContext<CodeReviewDetail | null>(null)
export function usePrReview() { return useContext(PrReviewContext) }
export function useCurrentPrReport() {
  const detail = usePrReview()
  const report = detail?.prReview ?? null
  return { detail, report, current: !!(report && detail && reportMatchesTree(report, detail.tree)) }
}
