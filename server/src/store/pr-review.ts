import { readReport } from '@review-dash/shared/pr-review/report'
import { invalidStoreFile } from '../errors.ts'
export async function readPrReviewReport(dir: string) {
  try { return await readReport(dir) }
  catch (e) { throw invalidStoreFile(`invalid PR review report: ${e instanceof Error ? e.message : String(e)}`) }
}
