// Evidence media rendered with Playwright into fixtures/media (cached: only missing files are made).
// `trial-bar.png` and `upgrade-flow.webm` belong to the two original sessions; the others feed the
// rich-spec session and the variety repo's binary change.
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
import { exists, mediaDir } from './common.ts'

const EVIDENCE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Acme Console</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1f2933; }
  .trial-bar { display: flex; align-items: center; gap: 12px; padding: 10px 20px; font-size: 14px; background: #e8f0fe; color: #174ea6; }
  .trial-bar span { flex: 1; }
  .trial-bar button, .modal button { border: 0; border-radius: 6px; padding: 6px 14px; font-weight: 600; cursor: pointer; background: #174ea6; color: #fff; }
  header { display: flex; justify-content: space-between; padding: 16px 20px; background: #fff; border-bottom: 1px solid #e5e7eb; }
  header h1 { margin: 0; font-size: 18px; }
  main { display: grid; grid-template-columns: 200px 1fr; }
  nav { display: flex; flex-direction: column; gap: 8px; padding: 16px; background: #fff; border-right: 1px solid #e5e7eb; min-height: 300px; }
  nav a { color: #374151; text-decoration: none; }
  section { padding: 16px 24px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .modal { display: none; position: fixed; inset: 0; background: rgba(17, 24, 39, .45); align-items: center; justify-content: center; }
  .modal.open { display: flex; }
  .modal .box { background: #fff; border-radius: 12px; padding: 24px; width: 420px; box-shadow: 0 12px 40px rgba(0,0,0,.2); }
  .plans { display: flex; gap: 12px; margin: 16px 0; }
  .plan { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .done { color: #047857; font-weight: 600; }
</style>
</head>
<body>
  <div class="trial-bar" id="trial-bar"><span>Your trial ends in <strong>7 days</strong>. Keep your workspace by upgrading.</span><button id="upgrade">Upgrade</button></div>
  <header><h1>Acme Console</h1><span>Alex Rivera · free</span></header>
  <main>
    <nav><a href="#">Dashboard</a><a href="#">Workspaces</a><a href="#">Settings</a></nav>
    <section>
      <div class="card"><strong>Workspaces</strong><div>3 active · 12 members</div></div>
      <div class="card"><strong>Recent activity</strong><div>Import finished · 2 minutes ago</div></div>
    </section>
  </main>
  <div class="modal" id="modal">
    <div class="box">
      <h2 style="margin-top:0">Choose a plan</h2>
      <div class="plans">
        <div class="plan"><strong>Pro</strong><div>$12 / user</div><button id="choose-pro" style="margin-top:8px">Choose Pro</button></div>
        <div class="plan"><strong>Team</strong><div>$29 / user</div><button style="margin-top:8px">Choose Team</button></div>
      </div>
      <div id="confirm"></div>
    </div>
  </div>
  <script>
    document.getElementById('upgrade').addEventListener('click', () => document.getElementById('modal').classList.add('open'))
    document.getElementById('choose-pro').addEventListener('click', () => {
      document.getElementById('confirm').innerHTML = '<div class="done">Pro plan selected. Your workspace stays active.</div>'
      document.getElementById('trial-bar').style.display = 'none'
    })
  </script>
</body>
</html>
`

const WARNING_PAGE = EVIDENCE_PAGE.replace('background: #e8f0fe; color: #174ea6;', 'background: #fff4e5; color: #8a4b00;')
  .replace('background: #174ea6; color: #fff;', 'background: #b45309; color: #fff;')
  .replace('Your trial ends in <strong>7 days</strong>. Keep your workspace by upgrading.', 'Your trial ends in <strong>2 days</strong>. Upgrade now to avoid read-only mode.')

export interface Media {
  png: string
  webm: string
  /** Amber variant of the bar, same viewport. */
  warningPng: string
  /** The plan picker open over the dashboard. */
  pickerPng: string
  /** After choosing Pro: inline confirmation, bar hidden. */
  confirmedPng: string
  /** Narrow viewport where the bar wraps. */
  mobilePng: string
}

async function screenshot(browser: Browser, file: string, html: string, viewport: { width: number; height: number }, prepare?: (page: Page) => Promise<void>): Promise<void> {
  console.log(`make-fixture: rendering ${path.relative(process.cwd(), file)}`)
  const page = await browser.newPage({ viewport })
  await page.setContent(html)
  if (prepare) await prepare(page)
  await page.screenshot({ path: file })
  await page.close()
}

export async function ensureMedia(): Promise<Media> {
  const media: Media = {
    png: path.join(mediaDir, 'trial-bar.png'),
    webm: path.join(mediaDir, 'upgrade-flow.webm'),
    warningPng: path.join(mediaDir, 'trial-bar-warning.png'),
    pickerPng: path.join(mediaDir, 'plan-picker.png'),
    confirmedPng: path.join(mediaDir, 'plan-confirmed.png'),
    mobilePng: path.join(mediaDir, 'trial-bar-mobile.png'),
  }
  const missing = new Set<string>()
  for (const file of Object.values(media)) if (!(await exists(file))) missing.add(file)
  if (missing.size === 0) return media
  await mkdir(mediaDir, { recursive: true })
  const viewport = { width: 1280, height: 400 }
  const browser = await chromium.launch()
  try {
    if (missing.has(media.png)) await screenshot(browser, media.png, EVIDENCE_PAGE, viewport)
    if (missing.has(media.warningPng)) await screenshot(browser, media.warningPng, WARNING_PAGE, viewport)
    if (missing.has(media.pickerPng)) await screenshot(browser, media.pickerPng, EVIDENCE_PAGE, viewport, (page) => page.click('#upgrade'))
    if (missing.has(media.confirmedPng)) {
      await screenshot(browser, media.confirmedPng, EVIDENCE_PAGE, viewport, async (page) => {
        await page.click('#upgrade')
        await page.click('#choose-pro')
      })
    }
    if (missing.has(media.mobilePng)) await screenshot(browser, media.mobilePng, WARNING_PAGE, { width: 390, height: 520 })
    if (missing.has(media.webm)) {
      console.log('make-fixture: recording fixtures/media/upgrade-flow.webm')
      const videoDir = await mkdtemp(path.join(os.tmpdir(), 'ai-review-video-'))
      const context = await browser.newContext({ viewport, recordVideo: { dir: videoDir, size: viewport } })
      const page = await context.newPage()
      await page.setContent(EVIDENCE_PAGE)
      await page.waitForTimeout(900)
      await page.click('#upgrade')
      await page.waitForTimeout(1200)
      await page.click('#choose-pro')
      await page.waitForTimeout(1300)
      const video = page.video()
      await context.close()
      if (video === null) throw new Error('recordVideo produced no video')
      await video.saveAs(media.webm)
      await rm(videoDir, { recursive: true, force: true })
    }
  } finally {
    await browser.close()
  }
  return media
}
