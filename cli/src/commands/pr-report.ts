import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Command } from 'commander'
import { SESSION_ID_RE, PrReviewReportSchema } from '@review-dash/shared'
import { computeWorkingTree } from '@review-dash/shared/git/working-tree'
import { readReport, publishReport, validateReportTree } from '@review-dash/shared/pr-review/report'
import { readReview } from '../sessions.ts'
import { readManifest, resolveHome, sessionDir } from '../store.ts'

export function registerPrReport(program: Command): void {
  const command = program.command('pr-report').description('Exchange review reports with a review skill')
  command.command('show').argument('<sessionId>').description('Read the current report and human decisions/notes').action(async (id: string) => {
    await load(id)
    const dir = sessionDir(resolveHome(), id)
    console.log(JSON.stringify({ report: await readReport(dir), review: await readReview(dir) }, null, 2))
  })
  command.command('schema').description('Print the report JSON schema').action(() => console.log(JSON.stringify(z.toJSONSchema(PrReviewReportSchema), null, 2)))
  command.command('template').argument('<sessionId>').requiredOption('--pr <url>').requiredOption('--number <number>').requiredOption('--repository <owner/repo>')
    .description('Print a report template with current file fingerprints')
    .action(async (id: string, flags: { pr: string; number: string; repository: string }) => {
      const manifest = await load(id)
      const { tree } = await computeWorkingTree({ repo: manifest.repo.path, baseRef: manifest.repo.baseRef })
      if (tree.dirty) throw new Error('check out the PR head cleanly before generating a report')
      const report = PrReviewReportSchema.parse({ schemaVersion: 1, id: `${id}-${tree.headSha.slice(0, 12)}`, pr: { url: flags.pr, number: Number(flags.number), repository: flags.repository }, baseSha: tree.baseSha, headSha: tree.headSha, createdAt: new Date().toISOString(), reviewers: [{ name: 'default-code-review', version: '1' }], files: tree.files.map(({ path, fingerprint }) => ({ path, fingerprint })), findings: [] })
      console.log(JSON.stringify(report, null, 2))
    })
  for (const action of ['validate', 'import'] as const) command.command(action).argument('<sessionId>').argument('<reportPath>')
    .description(`${action === 'import' ? 'Validate and atomically publish' : 'Validate'} a report against the session checkout; evidence paths are relative to the JSON file`)
    .action(async (id: string, reportPath: string) => {
      const manifest = await load(id)
      const file = path.resolve(reportPath)
      const report = PrReviewReportSchema.parse(JSON.parse(await readFile(file, 'utf8')))
      const { tree, patches } = await computeWorkingTree({ repo: manifest.repo.path, baseRef: manifest.repo.baseRef })
      if (action === 'import') await publishReport(sessionDir(resolveHome(), id), report, path.dirname(file), tree, patches)
      else {
        validateReportTree(report, tree, patches)
        const { mediaBytes, MEDIA_MAX_BYTES, VIDEO_MAX_BYTES } = await import('@review-dash/shared/pr-review/report')
        for (const f of report.findings) for (const e of f.reproduction.evidence) await mediaBytes(path.dirname(file), e.path, e.kind === 'video' ? VIDEO_MAX_BYTES : MEDIA_MAX_BYTES)
      }
      console.log(`${report.files.length} files, ${report.findings.length} findings${action === 'import' ? ' imported' : ' valid'}`)
    })
}
async function load(id: string) {
  if (!SESSION_ID_RE.test(id)) throw new Error('invalid session id')
  const manifest = await readManifest(sessionDir(resolveHome(), id))
  if (manifest.kind !== 'pr-review') throw new Error('create a PR review with ai-review init --kind pr-review --repo <checkout> --base <base-ref>')
  return manifest
}
