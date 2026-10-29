import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { E2E_STORE } from './store.ts'

/**
 * Smoke test of the whole review loop against a throwaway copy of the fixture store (built into
 * `E2E_STORE` by `global-setup.ts`; a live git working tree in `<store>/repos/trial-app`), on the
 * test's own servers (see `playwright.config.ts`):
 * list → approve → reject with a comment → autosave survives a reload → a file edited on disk shows
 * up live → submit → the feedback is saved and the page shows the `/apply-review` command (Scout starts
 * no agent). It resets the f1a0 session's review state first and restores `src/app.ts` afterwards.
 * `fixtures/store` is never touched.
 */

const SESSION_ID = '20260926-1200-qi-15472-trial-bar-f1a0'
const SESSION_TITLE = 'QI-15472: Trial bar'
const FIRST_FILE = 'README.md'
const SECOND_FILE = 'package-lock.json'
const THIRD_FILE = 'src/app.ts'
const TOTAL_FILES = 12
const REJECT_COMMENT = 'Smoke test: the lockfile change needs an explanation.'
const LIVE_EDIT_LINE = '\n// smoke test: edited on disk\n'
const FINGERPRINT_RE = /^[0-9a-f]{16}$/
/** Watcher debounce (300 ms) plus some slack. */
const WATCHER_SETTLE_MS = 800
const LIVE_UPDATE_TIMEOUT_MS = 20_000

const reviewDir = path.join(E2E_STORE, 'sessions', SESSION_ID, 'review')
const fixtureRepo = path.join(E2E_STORE, 'repos', 'trial-app')
const appTsPath = path.join(fixtureRepo, THIRD_FILE)

interface ReviewFile {
  files: Record<string, { verdict: string; fingerprint: string | null }>
  comments: { id: string; target: { kind: string; ref?: string }; body: string; sentAt: string | null }[]
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** `reviewed 2/12` in the session rail. */
function headerProgress(page: Page, reviewed: number) {
  return page.getByRole('complementary', { name: 'Session panel' }).getByText(`${reviewed}/${TOTAL_FILES}`, { exact: true })
}

/** The diff totals under the timeline's Full diff node (`12 files +2,154 −2,010`). */
function headerAdditions(page: Page) {
  return page.getByRole('region', { name: 'Commits' }).getByRole('button', { name: /^Full diff/ })
}

test.describe.configure({ mode: 'serial' })

test.describe('review loop smoke', () => {
  let page: Page
  let originalAppTs: string | null = null

  test.beforeAll(async ({ browser }) => {
    await fs.rm(reviewDir, { recursive: true, force: true })
    // Give the store and repo watchers a moment to notice before the first request.
    await sleep(WATCHER_SETTLE_MS)
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    if (originalAppTs !== null) await fs.writeFile(appTsPath, originalAppTs)
    await page.close()
  })

  test('opens the session from the list', async () => {
    await page.goto('/d')
    await expect(page.getByRole('heading', { level: 1, name: 'Development' })).toBeVisible()

    // Two fixture sessions share the title; the row's `data-href` carries the session id.
    const row = page.getByRole('link', { name: SESSION_TITLE, exact: true }).and(page.locator(`[data-href*="${SESSION_ID}"]`))
    await expect(row).toBeVisible()
    await expect(row.getByText('Awaiting review', { exact: true })).toBeVisible()

    await row.click()
    // An untouched session opens on its first step with content (the fixture has a spec); the review starts on Files.
    await expect(page).toHaveURL(new RegExp(`/s/${SESSION_ID}/spec$`))
    await page.goto(`/s/${SESSION_ID}/files`)
    await expect(page.getByRole('article', { name: FIRST_FILE })).toBeVisible()
    await expect(page.getByText(`file 1 of ${TOTAL_FILES}`)).toBeVisible()
    await expect(headerProgress(page, 0)).toBeVisible()
  })

  test('approves the first card', async () => {
    const card = page.getByRole('article', { name: FIRST_FILE })
    await card.getByRole('button', { name: 'Approve' }).click()

    await expect(headerProgress(page, 1)).toBeVisible()
    // Approving advances the deck to the next unreviewed file.
    await expect(page.getByRole('article', { name: SECOND_FILE })).toBeVisible()
  })

  test('rejects the second card with a comment', async () => {
    const card = page.getByRole('article', { name: SECOND_FILE })
    await card.getByRole('button', { name: 'Reject' }).click()
    await expect(card.getByText('Rejecting · add a comment')).toBeVisible()

    const box = card.getByLabel(`Why reject ${SECOND_FILE}?`)
    await box.fill(REJECT_COMMENT)
    await card.getByRole('button', { name: 'Comment & Reject' }).click()

    await expect(headerProgress(page, 2)).toBeVisible()
  })

  test('keeps the verdicts across a reload (autosave)', async () => {
    const reviewPath = path.join(reviewDir, 'review.json')
    await expect
      .poll(async () => {
        try {
          const review = await readJson<ReviewFile>(reviewPath)
          return review.files[SECOND_FILE]?.verdict ?? null
        } catch {
          return null
        }
      })
      .toBe('rejected')

    await page.reload()
    await expect(headerProgress(page, 2)).toBeVisible()

    const review = await readJson<ReviewFile>(reviewPath)
    const judged = Object.values(review.files).filter((file) => file.verdict !== 'none')
    expect(judged.filter((file) => file.verdict === 'approved')).toHaveLength(1)
    expect(judged.filter((file) => file.verdict === 'rejected')).toHaveLength(1)
    for (const file of judged) expect(file.fingerprint).toMatch(FINGERPRINT_RE)
    expect(review.files[FIRST_FILE]?.verdict).toBe('approved')
    expect(review.files[SECOND_FILE]?.verdict).toBe('rejected')
    expect(review.comments).toHaveLength(1)
    expect(review.comments[0]).toMatchObject({ target: { kind: 'file', ref: SECOND_FILE }, body: REJECT_COMMENT, sentAt: null })
  })

  test('shows a file edited on disk without a reload', async () => {
    // After the reject the deck sits on the third file.
    const card = page.getByRole('article', { name: THIRD_FILE })
    await expect(card).toBeVisible()
    const additionsBefore = await headerAdditions(page).innerText()

    originalAppTs = await fs.readFile(appTsPath, 'utf8')
    await fs.writeFile(appTsPath, originalAppTs + LIVE_EDIT_LINE)

    const toast = page.getByText(/changed on disk/)
    const changedChip = card.getByRole('status').filter({ hasText: 'changed just now' })
    await expect(toast.or(changedChip).first()).toBeVisible({ timeout: LIVE_UPDATE_TIMEOUT_MS })
    await expect(headerAdditions(page)).not.toHaveText(additionsBefore, { timeout: LIVE_UPDATE_TIMEOUT_MS })
    // The edit touched an unreviewed file; the progress is unchanged.
    await expect(headerProgress(page, 2)).toBeVisible()
  })

  test('submits with "Request changes" and shows the pending command', async () => {
    await page.goto(`/s/${SESSION_ID}/submit`)
    await expect(page.getByRole('heading', { level: 1, name: 'Submit' })).toBeVisible()

    await page.getByRole('radio', { name: 'Request changes' }).click()
    await expect(page.getByRole('radio', { name: 'Request changes' })).toHaveAttribute('aria-checked', 'true')

    // No confirmation step: the split button's main action sends at once.
    await page.getByRole('button', { name: 'Submit to current session' }).click()

    const pending = page.getByRole('region', { name: 'Feedback pending' })
    await expect(pending).toBeVisible()
    await expect(pending.getByText('/apply-review').first()).toBeVisible()
  })

  test('wrote the sent snapshot and stamped the comment as sent', async () => {
    const sent = await listDir(path.join(reviewDir, 'sent'))
    expect(sent.some((name) => name.endsWith('.json'))).toBe(true)
    expect(sent.some((name) => name.endsWith('.md'))).toBe(true)
    expect(sent.some((name) => name.endsWith('.patch'))).toBe(true)

    const review = await readJson<ReviewFile>(path.join(reviewDir, 'review.json'))
    const comment = review.comments.find((entry) => entry.body === REJECT_COMMENT)
    expect(comment).toBeDefined()
    expect(comment?.sentAt).not.toBeNull()
  })

  test('sends overall feedback typed a moment before clicking Submit', async () => {
    const OVERALL = 'Smoke test: overall note typed right before Submit.'
    await page.goto(`/s/${SESSION_ID}/submit`)
    await expect(page.getByRole('heading', { level: 1, name: 'Submit' })).toBeVisible()
    await page.getByRole('radio', { name: 'Request changes' }).click()
    await page.getByRole('textbox', { name: 'Overall feedback' }).fill(OVERALL)
    // The click blurs the field and sends well inside the 250 ms autosave delay.
    await page.getByRole('button', { name: 'Submit to current session' }).click()
    await expect(page.getByRole('region', { name: 'Feedback pending' })).toBeVisible()

    const sentDir = path.join(reviewDir, 'sent')
    const newest = (await listDir(sentDir)).filter((name) => name.endsWith('.json')).sort().at(-1)
    expect(newest).toBeDefined()
    const snapshot = await readJson<{ comments: { body: string }[] }>(path.join(sentDir, newest ?? ''))
    expect(snapshot.comments.map((comment) => comment.body)).toContain(OVERALL)
    const markdown = (await listDir(sentDir)).filter((name) => name.endsWith('.md')).sort().at(-1)
    expect(await fs.readFile(path.join(sentDir, markdown ?? ''), 'utf8')).toContain(OVERALL)
  })
})

/** The session shell: rail toggle and hotkey, remembered density, the Files fold, one block per page and the drawer under 1024px. */
test.describe('session shell', () => {
  const rail = (page: Page) => page.getByRole('complementary', { name: 'Session panel' })
  const base = `/s/${SESSION_ID}`

  test.describe.configure({ mode: 'serial' })

  test('hides and shows the rail with the bar toggle and the B hotkey, and remembers it', async ({ page }) => {
    await page.goto(`${base}/spec`)
    await expect(rail(page)).toBeVisible()
    await page.getByRole('button', { name: 'Hide sidebar' }).click()
    await expect(rail(page)).toHaveCount(0)
    // Closed, the toggle wears the review progress.
    await expect(page.getByRole('button', { name: 'Show sidebar' })).toContainText(`/${TOTAL_FILES}`)
    await page.reload()
    await expect(rail(page)).toHaveCount(0)
    await page.keyboard.press('b')
    await expect(rail(page)).toBeVisible()
    await page.keyboard.press('b')
    await expect(rail(page)).toHaveCount(0)
    await page.keyboard.press('b')
    await expect(rail(page)).toBeVisible()
  })

  test('remembers the density separately for Files and the other pages', async ({ page }) => {
    await page.goto(`${base}/spec`)
    await expect(rail(page).locator('[data-density="roomy"]').first()).toBeVisible()
    await rail(page).getByRole('button', { name: 'Collapse session details' }).click()
    await expect(rail(page).locator('[data-density="compact"]').first()).toBeVisible()
    await page.reload()
    await expect(rail(page).locator('[data-density="compact"]').first()).toBeVisible()
    // Files has its own choice (compact by default); expanding it does not touch the other pages.
    await page.getByRole('link', { name: /^Files/ }).first().click()
    await expect(rail(page).getByRole('button', { name: 'Expand session details' })).toBeVisible()
    await rail(page).getByRole('button', { name: 'Expand session details' }).click()
    await expect(rail(page).locator('[data-density="roomy"]').first()).toBeVisible()
    await page.getByRole('link', { name: /^Spec/ }).first().click()
    await expect(rail(page).locator('[data-density="compact"]').first()).toBeVisible()
  })

  test('folds the Files tree from its header chevron and remembers it', async ({ page }) => {
    await page.goto(`${base}/files`)
    await expect(rail(page).getByRole('tree')).toBeVisible()
    await rail(page).getByRole('button', { name: 'Collapse files' }).click()
    await expect(rail(page).getByRole('tree')).toHaveCount(0)
    await page.reload()
    await expect(rail(page).getByRole('button', { name: 'Expand files' })).toBeVisible()
    await rail(page).getByRole('button', { name: 'Expand files' }).click()
    await expect(rail(page).getByRole('tree')).toBeVisible()
  })

  test('fills the rail with each page\'s own block', async ({ page }) => {
    for (const [route, heading] of [
      ['spec', 'Spec'],
      ['extras', 'Extras'],
      ['evidence', 'Evidence'],
      ['submit', 'Will be sent'],
    ] as const) {
      await page.goto(`${base}/${route}`)
      await expect(rail(page).getByRole('heading', { name: heading, exact: true })).toBeVisible()
    }
    await page.goto(`${base}/files`)
    await expect(rail(page).getByRole('tree')).toBeVisible()
  })

  test('is a left drawer under 1024px: the toggle opens it, Esc and the scrim close it', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 })
    await page.goto(`${base}/spec`)
    await expect(rail(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Show sidebar' }).click()
    await expect(rail(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(rail(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Show sidebar' }).click()
    await page.getByRole('button', { name: 'Close sidebar' }).click({ position: { x: 780, y: 300 } })
    await expect(rail(page)).toHaveCount(0)
  })
})
