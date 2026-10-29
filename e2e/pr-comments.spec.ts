import { expect, test } from '@playwright/test'

/**
 * GitHub PR comments, read-only: inline under their diff lines in Files, outdated ones in the card
 * footer, per-file counts and the rail filter; on Submit they sit inside the Open comments panel
 * (no section of their own), resolved ones behind "Show n resolved". Uses the fixture session with every comment
 * state; the last test saves instructions and replies in it, so it stays last.
 */

const SESSION_ID = '20261005-0900-var-201-pr-comments-b4e1'
const NO_PR_SESSION_ID = '20260926-1200-qi-15472-trial-bar-f1a0'

test('shows PR comments inline, in the footer and in the rail', async ({ page }) => {
  await page.goto(`/s/${SESSION_ID}/files/src/components/Avatar.tsx?mode=scroll`)

  const card = page.getByRole('article', { name: 'src/components/Avatar.tsx' })
  await expect(card.locator('[data-slot="card-header"]').getByText(/2 PR comments/)).toBeVisible()
  // The open comment hangs under its line; the outdated one (no current line) is in the footer group.
  await expect(card.locator('[data-pr-comments] [data-pr-comment][data-status="open"]')).toBeVisible()
  await expect(card.locator('[data-pr-footer] [data-pr-comment][data-status="outdated"]')).toBeVisible()
  await expect(card.getByRole('link', { name: /on GitHub/ }).first()).toHaveAttribute('href', /github\.com/)

  // Never in Open comments or the review counts.
  await expect(page.getByRole('complementary', { name: 'Session panel' }).getByText('0/26', { exact: true })).toBeVisible()

  const tree = page.getByRole('tree', { name: 'Changed files' })
  await expect(tree.getByRole('treeitem', { name: /Avatar\.tsx/ }).getByTitle('2 PR comments, 1 open')).toBeVisible()
  await page.getByRole('button', { name: /GitHub comments/ }).click()
  await expect(tree.getByRole('treeitem', { name: /ci\.yml/ })).toHaveCount(0)
  await expect(tree.getByRole('treeitem', { name: /Avatar\.tsx/ })).toBeVisible()
})

test('Submit lists PR threads inside the comments panel, resolved ones behind the toggle', async ({ page }) => {
  await page.goto(`/s/${SESSION_ID}/submit`)

  await expect(page.getByRole('region', { name: 'GitHub comments' })).toHaveCount(0)
  const panel = page.getByRole('region', { name: 'Open comments' })
  const files = panel.getByRole('heading', { level: 3, name: 'Files' })
  await expect(files).toBeVisible()
  await expect(panel.locator('[data-pr-comment][data-status="open"]').first()).toBeVisible()
  // An answered thread with a reply still to review stays in the list; the posted one (rc9003) collapses.
  await expect(panel.locator('[data-pr-comment="rc9001"]')).toBeVisible()
  await expect(panel.locator('[data-pr-comment="rc9003"]')).toHaveCount(0)
  await expect(page.getByText('In last send')).toHaveCount(0)

  await panel.getByRole('button', { name: /^Show \d+ resolved$/ }).click()
  await expect(panel.locator('[data-pr-comment="rc9003"]')).toBeVisible()
  const addressed = panel.locator('[data-pr-comment][data-status="addressed"]').first()
  await expect(addressed).toBeVisible()
  await expect(addressed.locator('[data-pr-tint="addressed"]')).toBeAttached()
  await expect(panel.locator('[data-pr-comment][data-status="declined"] [data-pr-tint="declined"]').first()).toBeAttached()
  await expect(panel.getByRole('link', { name: /on GitHub/ }).first()).toHaveAttribute('href', /github\.com/)
})

test('a session without a PR shows nothing new', async ({ page }) => {
  await page.goto(`/s/${NO_PR_SESSION_ID}/files?mode=scroll`)
  await expect(page.getByRole('tree', { name: 'Changed files' })).toBeVisible()
  await expect(page.getByRole('button', { name: /GitHub comments/ })).toHaveCount(0)
  await expect(page.locator('[data-pr-chip], [data-pr-count], [data-pr-comments]')).toHaveCount(0)
})

test('edits instructions and replies on PR threads, and counts them in Will be sent', async ({ page }) => {
  await page.goto(`/s/${SESSION_ID}/submit`)
  const panel = page.getByRole('region', { name: 'Open comments' })
  const rail = page.getByRole('region', { name: 'Will be sent' })

  // The seeded instruction (rc9002, open) and the seeded unsent reply (rc9001) are queued already.
  const instruction = panel.locator('[data-pr-comment="rc9002"]')
  await expect(instruction.getByText('Instruction for Claude', { exact: true })).toBeVisible()
  await instruction.getByRole('button', { name: /^Edit your instruction/ }).click()
  const box = instruction.getByRole('textbox')
  await expect(box).toHaveValue('Yes, switch it to a <ul> and keep the timestamps.')
  await box.fill('Yes, switch it to a <ul> and keep the timestamps. Add a test.')
  await expect(instruction.getByText('Saved')).toBeVisible()

  const reply = panel.locator('[data-pr-comment="rc9001"]')
  await reply.getByRole('button', { name: /^Edit your reply/ }).click()
  await reply.getByRole('textbox').fill('Fixed in 3f9a1c2, thanks for catching it.')
  await expect(reply.getByText('Saved')).toBeVisible()
  await expect(reply.getByText('Queued')).toBeVisible()

  // The posted reply (rc9003) is a read-only quote behind "Show n resolved".
  await panel.getByRole('button', { name: /^Show \d+ resolved$/ }).click()
  const posted = panel.locator('[data-pr-comment="rc9003"]')
  await expect(posted.getByText('Posted to GitHub')).toBeVisible()
  await expect(posted.getByRole('textbox')).toHaveCount(0)

  // A proposal (rc9005) is not queued until "Use this reply".
  const proposal = panel.locator('[data-pr-comment="rc9005"]')
  await expect(proposal.getByText(/Not queued yet/)).toBeVisible()
  await expect(rail.getByText('PR replies')).toBeVisible()
  await expect(rail.locator('dd', { hasText: /^1$/ })).toHaveCount(2)
  await proposal.getByRole('button', { name: 'Use this reply' }).click()
  await expect(proposal.getByText('Queued')).toBeVisible()
  await expect(rail.locator('div', { has: page.locator('dt', { hasText: 'PR replies' }) }).locator('dd')).toHaveText('2')
  await expect(rail.locator('div', { has: page.locator('dt', { hasText: 'Instructions' }) }).locator('dd')).toHaveText('1')

  // It all survives a reload.
  await page.reload()
  await expect(page.locator('[data-pr-comment="rc9002"]').getByRole('textbox')).toHaveValue('Yes, switch it to a <ul> and keep the timestamps. Add a test.')
  await expect(page.locator('[data-pr-comment="rc9005"]').getByText('Queued')).toBeVisible()
})
