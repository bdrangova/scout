import path from 'node:path'
import { PR_STATUS_FILE, PrReviewStatusFileSchema } from '@scout/shared'
import type { PrReviewStatus, PrReviewStatusFile } from '@scout/shared'
import { readTextIfExists, writeFileAtomic } from './fs.ts'

/** `<sessionDir>/review/pr-status.json`; missing or unreadable reads as null (in progress). */
export async function readPrStatusFile(sessionDir: string): Promise<PrReviewStatusFile | null> {
  const text = await readTextIfExists(path.join(sessionDir, 'review', PR_STATUS_FILE))
  if (text === null) return null
  try {
    const parsed = PrReviewStatusFileSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function readPrStatus(sessionDir: string): Promise<PrReviewStatus> {
  return (await readPrStatusFile(sessionDir))?.status ?? 'in-progress'
}

export function writePrStatusFile(sessionDir: string, file: PrReviewStatusFile): Promise<void> {
  return writeFileAtomic(path.join(sessionDir, 'review', PR_STATUS_FILE), `${JSON.stringify(file, null, 2)}\n`)
}
