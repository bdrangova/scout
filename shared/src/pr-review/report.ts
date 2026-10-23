// Node-only report publication boundary shared by the CLI and server.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { PrReviewReportSchema, type PrReviewReport } from '../schemas/pr-review.ts'
import { reportMatchesTree } from '../review/pr-review.ts'
import { hashPrBody } from '../review/sha256.ts'
import { anchorInPatch, parsePatchLines } from '../review/patch-lines.ts'
import type { WorkingTree } from '../schemas/tree.ts'

export const PR_REPORT_FILE = 'pr-review.json'
export function reportRevision(report: PrReviewReport): string { return hashPrBody(JSON.stringify(report)) }
export function reportMediaRoot(dir: string, report: PrReviewReport): string { return path.join(dir, 'review', 'pr-reports', reportRevision(report), 'media') }
export async function readReport(dir: string): Promise<PrReviewReport | null> {
  let text: string
  try { text = await readFile(path.join(dir, PR_REPORT_FILE), 'utf8') }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e }
  return PrReviewReportSchema.parse(JSON.parse(text))
}
/** A real file confined to its real root; symlink escapes and directories are rejected. */
/** Screenshots and logs stay small; a reproduction video gets more room. */
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024
export async function mediaBytes(root: string, relative: string, maxBytes = MEDIA_MAX_BYTES): Promise<Buffer> {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some((s) => s === '..' || s === '.' || s === '')) throw new Error('invalid media path')
  const base = await realpath(root)
  const file = await realpath(path.join(base, relative))
  if (!file.startsWith(base + path.sep)) throw new Error(`media escapes its report folder: ${relative}`)
  const info = await stat(file)
  if (!info.isFile() || info.size > maxBytes) throw new Error(`media must be a file of at most ${maxBytes / 1024 / 1024} MB: ${relative}`)
  return readFile(file)
}
const hashBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
export async function verifiedMedia(dir: string, report: PrReviewReport, relative: string): Promise<Buffer> {
  const ref = report.findings.flatMap((f) => f.reproduction.evidence).find((e) => e.path === relative)
  if (!ref?.sha256) throw new Error(`unpublished evidence: ${relative}`)
  const bytes = await mediaBytes(reportMediaRoot(dir, report), relative, ref.kind === 'video' ? VIDEO_MAX_BYTES : MEDIA_MAX_BYTES)
  if (hashBytes(bytes) !== ref.sha256) throw new Error(`evidence changed since import: ${relative}`)
  return bytes
}
export function validateReportTree(report: PrReviewReport, tree: WorkingTree, patches: Map<string, string>): void {
  if (tree.dirty) throw new Error('PR review import requires a clean checkout of the PR head')
  if (!reportMatchesTree(report, tree)) throw new Error('report revisions or complete changed-file fingerprints do not match this checkout')
  for (const f of report.findings) {
    if (!anchorInPatch(parsePatchLines(patches.get(f.path) ?? ''), f.anchor)) throw new Error(`${f.id}: anchor is outside the reviewed diff`)
  }
}
/** Validate and copy every byte first; the atomic active report is published last. Failed imports leave it intact. */
export async function publishReport(dir: string, input: unknown, sourceRoot: string, tree: WorkingTree, patches: Map<string, string>): Promise<PrReviewReport> {
  const report = PrReviewReportSchema.parse(input)
  validateReportTree(report, tree, patches)
  const media = new Map<string, Buffer>()
  for (const f of report.findings) for (const e of f.reproduction.evidence) {
    const bytes = await mediaBytes(sourceRoot, e.path, e.kind === 'video' ? VIDEO_MAX_BYTES : MEDIA_MAX_BYTES)
    if (e.kind === 'screenshot') {
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      const gif = /^GIF8[79]a/.test(bytes.subarray(0, 6).toString())
      const webp = bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'
      if (!png && !jpeg && !gif && !webp) throw new Error(`invalid screenshot bytes: ${e.path}`)
    }
    if (e.kind === 'video') {
      const webm = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      const mp4 = bytes.subarray(4, 8).toString() === 'ftyp'
      if (!webm && !mp4) throw new Error(`invalid video bytes: ${e.path}`)
    }
    e.sha256 = hashBytes(bytes)
    media.set(e.path, bytes)
  }
  const dest = reportMediaRoot(dir, report)
  for (const [rel, bytes] of media) {
    const file = path.join(dest, rel)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
  }
  const versionDir = path.dirname(dest)
  await mkdir(versionDir, { recursive: true })
  await writeFile(path.join(versionDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const tmp = path.join(dir, `.pr-review-${randomUUID()}.tmp`)
  await writeFile(tmp, JSON.stringify(report, null, 2) + '\n')
  await rename(tmp, path.join(dir, PR_REPORT_FILE))
  return report
}
