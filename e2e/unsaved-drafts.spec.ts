import { expect, test } from '@playwright/test'

/**
 * A comment typed in a file card's composer counts only once it is added. Submit warns about text
 * left in a composer (a warning, not a block, and nothing is added for the reviewer) and links back
 * to the file; adding the comment clears the warning.
 */

const SESSION_ID = '20261001-0930-qi-15490-hotfix-no-notes-e5e0'
const DRAFT = 'Typed but not added yet.'

test('Submit warns about a comment typed in a file card and not added', async ({ page }) => {
  await page.goto(`/s/${SESSION_ID}/files`)
  const card = page.getByRole('article').first()
  const name = (await card.getAttribute('aria-label')) ?? ''
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: /^Comment on / }).click()
  await card.getByRole('textbox', { name: /^Comment on / }).fill(DRAFT)

  // Leave through the section tab: the draft lives in the review provider, not in the card.
  await page.getByRole('link', { name: /^Submit/ }).first().click()
  await expect(page).toHaveURL(new RegExp(`/s/${SESSION_ID}/submit$`))

  const warnings = page.getByTestId('unsaved-drafts')
  await expect(warnings).toHaveCount(2)
  await expect(warnings.first()).toContainText('1 comment typed but not added')

  // The link goes back to the file, and the text is still in its composer.
  await warnings.first().getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/s/${SESSION_ID}/files/`))
  const same = page.getByRole('article', { name })
  await expect(same.getByRole('textbox', { name: /^Comment on / })).toHaveValue(DRAFT)

  await same.getByRole('textbox', { name: /^Comment on / }).press('ControlOrMeta+Enter')
  await page.getByRole('link', { name: /^Submit/ }).first().click()
  await expect(page.getByTestId('unsaved-drafts')).toHaveCount(0)
  await expect(page.getByText(DRAFT)).toBeVisible()
})
