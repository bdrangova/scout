import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Router } from 'express'
import { emptyReview, prReviewCopyItems, renderPrReviewMarkdown, approvedProposals, mimeFromPath } from '@scout/shared'
import { readReport, reportRevision, verifiedMedia } from '@scout/shared/pr-review/report'
import type { Store } from '../store/index.ts'
import { readResolutions, readReview } from '../store/review.ts'
import { writeFileAtomic } from '../store/fs.ts'
import { badRequest, conflict, notFound } from '../errors.ts'

/** PR-review-only read/export endpoints. No agent dispatch or GitHub write path. */
export function prReviewRouter(store: Store): Router {
  const router = Router()
  router.get('/sessions/:id/pr-review/media/*path', async (req, res) => {
    const session = await store.loadSession(req.params.id)
    if (session.manifest.kind !== 'pr-review') throw notFound('not a PR review')
    const report = await readReport(session.dir)
    if (!report || req.query.revision !== reportRevision(report)) throw notFound('report revision is no longer current')
    const rel = (req.params.path as unknown as string[]).join('/')
    let bytes: Buffer
    try { bytes = await verifiedMedia(session.dir, report, rel) }
    catch (e) { throw notFound(e instanceof Error ? e.message : 'evidence unavailable') }
    const type = /\.(png|jpe?g|gif|webp|webm|mp4)$/i.test(rel) ? mimeFromPath(rel) : 'text/plain; charset=utf-8'
    res.set('Content-Security-Policy', 'sandbox').set('X-Content-Type-Options', 'nosniff').set('Accept-Ranges', 'bytes').type(type ?? 'application/octet-stream')
    // Video seeks with Range requests; one `bytes=start-end` range is enough for a <video>.
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
      if (start >= bytes.length || start > end) {
        res.status(416).set('Content-Range', `bytes */${bytes.length}`).end()
        return
      }
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${bytes.length}`).send(bytes.subarray(start, end + 1))
      return
    }
    res.send(bytes)
  })
  router.post('/sessions/:id/pr-review/export', async (req, res) => {
    const session = await store.loadSession(req.params.id)
    if (session.manifest.kind !== 'pr-review') throw badRequest('not a PR review')
    const report = await readReport(session.dir)
    if (!report) throw badRequest('import a PR review report first')
    if (req.body?.reportRevision !== reportRevision(report)) throw conflict('report changed; reload before exporting', 'report-changed')
    const review = await readReview(session.dir, session.id) ?? emptyReview(session.id)
    if (req.body?.reviewUpdatedAt !== review.updatedAt) throw conflict('review changed; reload before exporting', 'review-changed')
    const { tree } = await store.tree(session)
    if (req.body?.treeFingerprint !== tree.fingerprint) throw conflict('diff changed; reload before exporting', 'tree-changed')
    for (const f of approvedProposals(report, tree, review)) for (const e of f.reproduction.evidence) {
      try { await verifiedMedia(session.dir, report, e.path) }
      catch { throw conflict('approved evidence is missing or changed; import and review again', 'evidence-changed') }
    }
    const resolutions = await readResolutions(session.dir, session.id)
    const snapshot = { id: randomUUID(), createdAt: new Date().toISOString(), reportRevision: reportRevision(report), reportId: report.id, headSha: tree.headSha, review, items: prReviewCopyItems(report, tree, review, resolutions), markdown: renderPrReviewMarkdown(report, tree, review, session.manifest.title, resolutions) }
    // Immutable unique snapshots; export does not change verdicts, comments or sent state.
    await writeFileAtomic(path.join(session.dir, 'review', 'pr-exports', `${snapshot.id}.json`), JSON.stringify(snapshot, null, 2) + '\n')
    res.json(snapshot)
  })
  return router
}
