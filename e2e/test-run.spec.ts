import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { E2E_STORE } from './store.ts'

/**
 * The test-run module end to end on the throwaway fixture store and the fake agent adapter (see
 * `playwright.config.ts`): toggle the list to Test runs → open the demo run → the overview → the Review page →
 * Submit with "Changes requested" and an overall note → the fake run finishes and the note shows as resolved.
 * Verdicts on scenarios are not driven here: they belong to the storyboard (M4b) and join this spec when it lands.
 */

const SESSION_ID = '20261021-1800-diffing-run-7e2a'
const OVERALL = 'Test-run smoke: the empty state needs a better message.'
const FAKE_RESOLUTION_NOTE = 'Applied by the fake adapter'

const sessionDir = path.join(E2E_STORE, 'sessions', SESSION_ID)
const reviewDir = path.join(sessionDir, 'review')

interface SentSnapshot {
  kind: string
  decision: string
  comments: { body: string }[]
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

test.describe.configure({ mode: 'serial' })

test.describe('test-run session', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    // Repeatable within one store: drop an earlier run's review state.
    await fs.rm(reviewDir, { recursive: true, force: true })
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('toggles the list to Test runs and opens the run on its overview', async () => {
    await page.goto('/d')
    await expect(page.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()
    await page.getByRole('link', { name: 'Test runs', exact: true }).click()
    await expect(page).toHaveURL(/\/t$/)

    const row = page.locator(`[data-href*="${SESSION_ID}"]`)
    await expect(row).toBeVisible()
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/t/${SESSION_ID}/overview`))

    await page.goto(`/t/${SESSION_ID}/overview`)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  })

  test('opens the Review page', async () => {
    await page.goto(`/t/${SESSION_ID}/review`)
    // The index route lands on a scenario card; the deck shows one card at a time with its counter.
    await expect(page).toHaveURL(new RegExp(`/t/${SESSION_ID}/review/[\\w-]+`))
    await expect(page.getByRole('article', { name: 'Happy path' })).toBeVisible()
  })

  test('submits "Changes requested" with an overall note and the fake agent resolves it', async () => {
    await page.goto(`/t/${SESSION_ID}/submit`)
    await expect(page.getByRole('heading', { level: 1, name: 'Submit' })).toBeVisible()

    // The main app's Submit, worded for a test run: no PR description, no Reject.
    await expect(page.getByRole('radio', { name: /^Accept/ })).toBeVisible()
    await expect(page.getByRole('radio', { name: /^Reject/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'PR description' })).toHaveCount(0)

    await page.getByRole('radio', { name: /^Changes requested/ }).click()
    await expect(page.getByRole('radio', { name: /^Changes requested/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('textbox', { name: 'Overall feedback' }).fill(OVERALL)

    await page.getByRole('button', { name: 'Submit to current session' }).click()

    const status = page.getByRole('region', { name: 'Agent status' })
    await expect(status).toBeVisible()
    await expect(status.getByText('Claude Code finished working on your comments')).toBeVisible({ timeout: 60_000 })
    await expect(status.getByText('1 of 1', { exact: true })).toBeVisible()

    const comments = page.getByRole('region', { name: 'Comments', exact: true })
    await comments.getByRole('button', { name: 'Show 1 resolved' }).click()
    await expect(comments.getByText(FAKE_RESOLUTION_NOTE)).toBeVisible()
    await expect(comments.getByText(OVERALL)).toBeVisible()
  })

  test('wrote the test-run snapshot, its markdown and the resolutions to disk', async () => {
    const sentDir = path.join(reviewDir, 'sent')
    const sent = await listDir(sentDir)
    expect(sent.some((name) => name.endsWith('.json'))).toBe(true)
    expect(sent.some((name) => name.endsWith('.md'))).toBe(true)
    // A test run has no diff to attach.
    expect(sent.some((name) => name.endsWith('.patch'))).toBe(false)

    const json = sent.filter((name) => name.endsWith('.json')).sort().at(-1) ?? ''
    const snapshot = await readJson<SentSnapshot>(path.join(sentDir, json))
    expect(snapshot).toMatchObject({ kind: 'test-run', decision: 'request-changes' })
    expect(snapshot.comments.map((comment) => comment.body)).toContain(OVERALL)
    const markdown = await fs.readFile(path.join(sentDir, json.replace(/\.json$/, '.md')), 'utf8')
    expect(markdown).toContain(OVERALL)
    expect(markdown).toContain(`/t/${SESSION_ID}/review`)

    expect((await listDir(path.join(reviewDir, 'runs'))).some((name) => /^run-.*\.jsonl$/.test(name))).toBe(true)
    const resolutions = await readJson<{ comments: Record<string, { status: string; note: string | null }> }>(path.join(reviewDir, 'resolutions.json'))
    expect(Object.values(resolutions.comments)).toContainEqual(expect.objectContaining({ status: 'resolved', note: FAKE_RESOLUTION_NOTE }))
  })
})
