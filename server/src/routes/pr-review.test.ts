import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { emptyReview, currentProposal, parsePatchLines } from '@scout/shared'
import type { PrReviewReport, WorkingTree, Review } from '@scout/shared'
import { makeManifest, T0 } from '@scout/shared/testing/fixtures'
import { makePrReport } from '@scout/shared/testing/pr-review'
import { gitText } from '@scout/shared/git/run'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import { publishReport, readReport, reportMediaRoot, reportRevision } from '@scout/shared/pr-review/report'
import { appFor } from '../testing/fixture-store.ts'
import { pngBytes } from '../testing/fixture-repo.ts'
import { appServices, closeApp } from '../app.ts'

let home: string, repo: string, dir: string, app: Express, tree: WorkingTree, report: PrReviewReport, review: Review
const id = '20261023-0900-pr-review-abcd'
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.test', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.test' }
const git = (args: string[]) => gitText(repo, args, { env: GIT_ENV })
beforeAll(async () => {
  home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scout-pr-review-')))
  repo = path.join(home, 'repo'); dir = path.join(home, 'sessions', id)
  await fs.mkdir(repo); await fs.mkdir(dir, { recursive: true })
  await git(['init', '-q', '-b', 'main'])
  await fs.writeFile(path.join(repo, 'a.ts'), 'export const a = 1\n')
  await fs.writeFile(path.join(repo, 'b.ts'), 'export const b = 1\n')
  await git(['add', '.']); await git(['commit', '-qm', 'base'])
  await git(['checkout', '-qb', 'feature/review'])
  await fs.writeFile(path.join(repo, 'a.ts'), 'export const a = 2\n')
  await fs.writeFile(path.join(repo, 'b.ts'), 'export const b = 2\n')
  await git(['add', '.']); await git(['commit', '-qm', 'head'])
  const result = await computeWorkingTree({ repo, baseRef: 'main' }); tree = result.tree
  report = makePrReport(tree)
  report.findings[0]!.anchor.line = parsePatchLines(result.patches.get('a.ts')!).find((r) => r.new !== null)!.new!
  const r = report.findings[0]!.reproduction
  r.status = 'reproduced'; r.limitation = null; r.actual = 'The plan changes despite the declined payment.'
  r.evidence = [{ path: 'capture.png', caption: 'Fixture evidence', kind: 'screenshot', stepId: 's1', capturedAt: T0, revision: tree.headSha }, { path: 'flow.webm', caption: 'Fixture video', kind: 'video', stepId: 's1', capturedAt: T0, revision: tree.headSha }]
  await fs.writeFile(path.join(home, 'capture.png'), pngBytes(1))
  await fs.writeFile(path.join(home, 'flow.webm'), Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(96, 7)]))
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(makeManifest({ id, kind: 'pr-review', repo: { path: repo, baseRef: 'main', branch: 'feature/review', remote: null } })))
  report = await publishReport(dir, report, home, tree, result.patches)
  review = emptyReview(id)
  review.prProposals = { f1: { ...currentProposal(report, report.findings[0]!, review), body: 'Human edited proposal', verdict: 'approved', notes: [{ body: 'Private agent note', createdAt: T0 }] } }
  await fs.mkdir(path.join(dir, 'review'), { recursive: true })
  await fs.writeFile(path.join(dir, 'review', 'review.json'), JSON.stringify(review))
  app = appFor(home)
})
afterAll(async () => { if (app) await closeApp(app); if (home) await fs.rm(home, { recursive: true, force: true }) })
const exportBody = () => ({ reportRevision: reportRevision(report), treeFingerprint: tree.fingerprint, reviewUpdatedAt: review.updatedAt })
describe('PR review sessions', () => {
  it('filters the third session kind and returns all changed files plus the report', async () => {
    const list = await request(app).get('/api/sessions?kind=pr-review')
    expect(list.status).toBe(200); expect(list.body).toHaveLength(1); expect(list.body[0].kind).toBe('pr-review')
    expect((await request(app).get('/api/sessions?kind=code-review')).body).toHaveLength(0)
    const detail = await request(app).get(`/api/sessions/${id}`)
    expect(detail.body.tree.files).toHaveLength(2); expect(detail.body.prReview.findings).toHaveLength(1)
  })
  it('serves only published step evidence and refuses changed bytes', async () => {
    const url = `/api/sessions/${id}/pr-review/media/capture.png?revision=${reportRevision(report)}`
    expect((await request(app).get(url)).status).toBe(200)
    expect((await request(app).get(`/api/sessions/${id}/pr-review/media/not-listed.png?revision=${reportRevision(report)}`)).status).toBe(404)
    await fs.writeFile(path.join(reportMediaRoot(dir, report), 'capture.png'), 'changed')
    expect((await request(app).get(url)).status).toBe(404)
    expect((await request(app).post(`/api/sessions/${id}/pr-review/export`).send(exportBody())).status).toBe(409)
    await fs.writeFile(path.join(reportMediaRoot(dir, report), 'capture.png'), pngBytes(1))
  })
  it('serves a video with its type and answers Range requests', async () => {
    const url = `/api/sessions/${id}/pr-review/media/flow.webm?revision=${reportRevision(report)}`
    const full = await request(app).get(url)
    expect(full.status).toBe(200); expect(full.headers['content-type']).toBe('video/webm'); expect(full.headers['accept-ranges']).toBe('bytes')
    const part = await request(app).get(url).set('Range', 'bytes=0-3').buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))) })
    expect(part.status).toBe(206); expect(part.headers['content-range']).toBe('bytes 0-3/100'); expect(part.body).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    expect((await request(app).get(url).set('Range', 'bytes=500-')).status).toBe(416)
  })
  it('exports exact wording as an immutable snapshot without sending or dispatching', async () => {
    const before = await fs.readFile(path.join(dir, 'review', 'review.json'), 'utf8')
    const res = await request(app).post(`/api/sessions/${id}/pr-review/export`).send(exportBody())
    expect(res.status).toBe(200); expect(res.body.markdown).toContain('Human edited proposal')
    expect(res.body.items).toEqual([expect.objectContaining({ id: 'f1', source: 'proposal', body: 'Human edited proposal', path: 'a.ts' })])
    expect(res.body.items[0]).not.toHaveProperty('notes')
    expect(res.body.markdown).not.toContain('Private agent note'); expect(res.body.markdown).toContain('attach capture.png')
    expect(res.body.markdown).toContain('b.ts: pending')
    expect(JSON.parse(await fs.readFile(path.join(dir, 'review', 'pr-exports', `${res.body.id}.json`), 'utf8')).markdown).toBe(res.body.markdown)
    expect(await fs.readFile(path.join(dir, 'review', 'review.json'), 'utf8')).toBe(before)
    const send = await request(app).post(`/api/sessions/${id}/review/send`).send({ decision: 'approve', dispatch: true })
    expect(send.status).toBe(400)
    expect(appServices(app).runs.activeRun(id)).toBeNull()
  })
  it('refuses stale review/report/tree stamps before exporting', async () => {
    for (const patch of [{ reportRevision: 'old' }, { treeFingerprint: 'old' }, { reviewUpdatedAt: T0 }]) {
      expect((await request(app).post(`/api/sessions/${id}/pr-review/export`).send({ ...exportBody(), ...patch })).status).toBe(409)
    }
  })
  it('leaves the last report intact after invalid, incomplete or unsafe imports', async () => {
    const result = await computeWorkingTree({ repo, baseRef: 'main' })
    for (const bad of [{ ...report, files: report.files.slice(1) }, { ...report, findings: [{ ...report.findings[0], anchor: { side: 'new', line: 9999 } }] }]) {
      await expect(publishReport(dir, bad, home, tree, result.patches)).rejects.toThrow()
      expect(await readReport(dir)).toEqual(report)
    }
    const outside = path.join(home, 'outside'); await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'secret'), 'secret')
    const malicious = path.join(home, 'malicious'); await fs.mkdir(malicious)
    await fs.symlink(outside, path.join(malicious, 'escape'))
    const bad = structuredClone(report); bad.findings[0]!.reproduction.evidence[0]!.path = 'escape/secret.png'
    await fs.symlink(path.join(outside, 'secret'), path.join(outside, 'secret.png'))
    await expect(publishReport(dir, bad, malicious, tree, result.patches)).rejects.toThrow()
    expect(await readReport(dir)).toEqual(report)
  })
  it('archives and restores in the PR tab with proposals and report preserved', async () => {
    expect((await request(app).post(`/api/sessions/${id}/archive`)).status).toBe(200)
    expect((await request(app).get('/api/sessions?kind=pr-review')).body).toHaveLength(0)
    expect((await request(app).get('/api/sessions/archived?kind=pr-review')).body).toHaveLength(1)
    expect((await request(app).get('/api/sessions/archived?kind=code-review')).body).toHaveLength(0)
    expect((await request(app).post(`/api/sessions/${id}/unarchive`)).status).toBe(200)
    expect(await readReport(dir)).toEqual(report)
    expect(JSON.parse(await fs.readFile(path.join(dir, 'review', 'review.json'), 'utf8')).prProposals.f1.body).toBe('Human edited proposal')
  })
})
