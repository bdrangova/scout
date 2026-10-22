import fs from 'node:fs'
import path from 'node:path'
import { ReviewResponseSchema, ReviewSchema, SCHEMA_VERSION, emptyReview } from '@review-dash/shared'
import type { PutReviewRequest, Resolutions, Review, CodeReviewDetail } from '@review-dash/shared'
import { makeComment } from '@review-dash/shared/testing/fixtures'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

let store: FixtureStore
let app: Express
let detail: CodeReviewDetail
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home)
  detail = (await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body as CodeReviewDetail
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
})

const url = `/api/sessions/${FIXTURE_SESSION_ID}/review`
const reviewFile = () => path.join(store.dir, 'review', 'review.json')
const resolutionsFile = () => path.join(store.dir, 'review', 'resolutions.json')

function fingerprintOf(filePath: string): string {
  const file = detail.tree.files.find((f) => f.path === filePath)
  if (!file) throw new Error(`no ${filePath} in the tree`)
  return file.fingerprint
}

function draft(): Review {
  const review = emptyReview(FIXTURE_SESSION_ID, '2026-01-01T10:00:00.000Z')
  review.files['src/app.ts'] = { verdict: 'approved', fingerprint: fingerprintOf('src/app.ts'), viewed: true }
  review.files['src/old.ts'] = { verdict: 'rejected', fingerprint: fingerprintOf('src/old.ts'), viewed: true }
  review.comments = [
    makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/old.ts' }, body: 'Keep this file.', createdAt: '2026-01-01T10:00:00.000Z' }),
    makeComment({ id: 'c2', target: { kind: 'evidence', ref: 'shot.png' }, body: 'The colours look off.', createdAt: '2026-01-01T10:01:00.000Z' }),
  ]
  review.nextCommentId = 3
  return review
}

describe('review routes', () => {
  it('GET returns an in-memory empty review when nothing was saved, without writing a file', async () => {
    const res = await request(app).get(url)
    expect(res.status).toBe(200)
    const body = ReviewResponseSchema.parse(res.body)
    expect(body.review.sessionId).toBe(FIXTURE_SESSION_ID)
    expect(body.review.comments).toEqual([])
    expect(body.review.overall.decision).toBe('undecided')
    expect(body.resolutions).toBeNull()
    expect(body.comments).toEqual([])
    expect(fs.existsSync(reviewFile())).toBe(false)
  })

  it('GET answers 404 for an unknown session', async () => {
    expect((await request(app).get('/api/sessions/20260101-0900-missing-0000/review')).status).toBe(404)
  })

  it('PUT validates the body and the session id', async () => {
    const invalid = await request(app).put(url).send({ review: { sessionId: FIXTURE_SESSION_ID }, baseUpdatedAt: null })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toMatch(/invalid PutReviewRequest/)

    const other = emptyReview('20260101-0900-other-0000')
    const mismatch = await request(app).put(url).send({ review: other, baseUpdatedAt: null })
    expect(mismatch.status).toBe(400)
    expect(mismatch.body.error).toMatch(/sessionId/)

    const missing = await request(app)
      .put('/api/sessions/20260101-0900-missing-0000/review')
      .send({ review: emptyReview('20260101-0900-missing-0000'), baseUpdatedAt: null })
    expect(missing.status).toBe(404)
    expect(fs.existsSync(reviewFile())).toBe(false)
  })

  let savedUpdatedAt = ''

  it('PUT then GET round-trips and merges resolutions.json into the comment statuses', async () => {
    const body: PutReviewRequest = { review: draft(), baseUpdatedAt: null }
    const put = await request(app).put(url).send(body)
    expect(put.status).toBe(200)
    expect(typeof put.body.updatedAt).toBe('string')
    savedUpdatedAt = put.body.updatedAt as string

    const onDisk = ReviewSchema.parse(JSON.parse(fs.readFileSync(reviewFile(), 'utf8')))
    expect(onDisk.updatedAt).toBe(savedUpdatedAt)
    expect(onDisk.comments.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(fs.readdirSync(path.dirname(reviewFile())).filter((n) => n.endsWith('.tmp'))).toEqual([])

    const resolutions: Resolutions = {
      schemaVersion: SCHEMA_VERSION,
      sessionId: FIXTURE_SESSION_ID,
      updatedAt: '2026-01-01T11:00:00.000Z',
      comments: { c1: { status: 'resolved', note: 'Restored src/old.ts.', at: '2026-01-01T11:00:00.000Z', files: ['src/old.ts'] } },
    }
    fs.writeFileSync(resolutionsFile(), JSON.stringify(resolutions))

    const get = await request(app).get(url)
    expect(get.status).toBe(200)
    const merged = ReviewResponseSchema.parse(get.body)
    expect(merged.review.updatedAt).toBe(savedUpdatedAt)
    expect(merged.review.files['src/app.ts']?.verdict).toBe('approved')
    expect(merged.resolutions?.comments.c1?.note).toBe('Restored src/old.ts.')
    expect(merged.comments.map((c) => [c.id, c.status])).toEqual([
      ['c1', 'resolved'],
      ['c2', 'open'],
    ])
    expect(merged.comments[0]?.resolution).toEqual(resolutions.comments.c1)
    expect(merged.comments[1]?.resolution).toBeNull()

    const list = await request(app).get('/api/sessions')
    const summary = (list.body as { id: string }[]).find((item) => item.id === FIXTURE_SESSION_ID)
    expect(summary).toMatchObject({ status: 'in-progress', openComments: 1, progress: { reviewed: 2, total: 8 }, updatedAt: savedUpdatedAt })
  })

  it('does not count a verdict pinned to a stale fingerprint as reviewed', async () => {
    const stale = draft()
    stale.files['src/app.ts'] = { verdict: 'approved', fingerprint: '0123456789abcdef', viewed: true }
    expect((await request(app).put(url).send({ review: stale, baseUpdatedAt: savedUpdatedAt })).status).toBe(200)
    const detailNow = await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)
    expect(detailNow.body.progress).toEqual({ reviewed: 1, total: 8 })
    savedUpdatedAt = ReviewSchema.parse(JSON.parse(fs.readFileSync(reviewFile(), 'utf8'))).updatedAt
  })

  it('PUT with a stale or null baseUpdatedAt answers 409 with the current review', async () => {
    const stale = await request(app).put(url).send({ review: draft(), baseUpdatedAt: '2026-01-01T09:59:00.000Z' })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatch(/changed/)
    expect(ReviewSchema.parse(stale.body.current).updatedAt).toBe(savedUpdatedAt)

    const nullBase = await request(app).put(url).send({ review: draft(), baseUpdatedAt: null })
    expect(nullBase.status).toBe(409)

    const fresh = await request(app).put(url).send({ review: draft(), baseUpdatedAt: savedUpdatedAt })
    expect(fresh.status).toBe(200)
    expect(fresh.body.updatedAt > savedUpdatedAt).toBe(true)
    expect(ReviewSchema.parse(JSON.parse(fs.readFileSync(reviewFile(), 'utf8'))).updatedAt).toBe(fresh.body.updatedAt)
  })
})
