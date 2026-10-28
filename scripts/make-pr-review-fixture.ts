// Adds a PR review demo to the existing fixture store without clearing other sessions.
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import { publishReport } from '@scout/shared/pr-review/report'
import { makeManifest, T0 } from '@scout/shared/testing/fixtures'
import { makePrReport } from '@scout/shared/testing/pr-review'
import { gitText } from '@scout/shared/git/run'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = process.env.FIXTURE_OUT ? path.resolve(process.env.FIXTURE_OUT) : path.join(root, 'fixtures/store')
const repo = path.join(home, 'repos/pr-review-demo')
const id = '20261023-1100-pr-review-demo-abcd'
const dir = path.join(home, 'sessions', id)
const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' }
const git = (args: string[]) => gitText(repo, args, { env })
await mkdir(repo, { recursive: true }); await mkdir(dir, { recursive: true })
try { await access(path.join(repo, '.git')) } catch {
  await git(['init', '-qb', 'main'])
  await mkdir(path.join(repo, 'src/api'), { recursive: true }); await mkdir(path.join(repo, 'src/components'), { recursive: true })
  await writeFile(path.join(repo, 'src/api/upgrade.ts'), `export async function upgrade(account, plan, payments) {
  const payment = await payments.charge(account, plan)
  if (!payment.ok) return { error: 'declined' }
  await account.setPlan(plan)
  return { ok: true }
}
`)
  await writeFile(path.join(repo, 'src/components/TrialBar.tsx'), `export function TrialBar({ expired }) {
  return expired ? <aside>Trial expired</aside> : null
}
`)
  await writeFile(path.join(repo, 'src/components/UpgradeButton.tsx'), `export function UpgradeButton({ onClick }) {
  return <button onClick={onClick}>Upgrade</button>
}
`)
  await git(['add', '.']); await git(['commit', '-qm', 'base'])
  await git(['checkout', '-qb', 'feature/upgrade'])
  await writeFile(path.join(repo, 'src/api/upgrade.ts'), `export async function upgrade(account, plan, payments) {
  const payment = await payments.charge(account, plan)
  if (!payment.ok) console.warn('declined')
  await account.setPlan(plan)
  return { ok: true }
}
`)
  await writeFile(path.join(repo, 'src/components/TrialBar.tsx'), `export function TrialBar({ expired, dismissed }) {
  if (dismissed) return null
  return expired ? <aside>Trial expired</aside> : null
}
`)
  await writeFile(path.join(repo, 'src/components/UpgradeButton.tsx'), `export function UpgradeButton({ onClick, pending }) {
  return <button disabled={pending} onClick={onClick}>Upgrade</button>
}
`)
  await git(['add', '.']); await git(['commit', '-qm', 'upgrade changes'])
}
const { tree, patches } = await computeWorkingTree({ repo, baseRef: 'main' })
const report = makePrReport(tree)
report.id = 'demo-upgrade-review'; report.findings[0]!.anchor = { side: 'new', line: 3, endLine: 4 }
const finding = report.findings[0]!
finding.reproduction = { status: 'reproduced', revision: tree.headSha, environment: 'Illustrative fixture only — Acme payment sandbox', prerequisites: ['Fixture account on Starter'], steps: [{ id: 's1', instruction: 'Open the fixture upgrade flow.' }, { id: 's2', instruction: 'Use a declined sandbox payment.' }], expected: 'The plan remains Starter.', actual: 'The upgrade reports success.', limitation: 'Demo report and sample screenshot demonstrate the review UI; this is not a finding against Scout.', evidence: [{ path: 'demo-plan.png', kind: 'screenshot', caption: 'Sample upgrade screenshot (demo evidence)', stepId: 's2', capturedAt: T0, revision: tree.headSha }] }
report.findings.push({ ...finding, id: 'f2', severity: 'medium', title: 'Expired trial notice can be dismissed', body: 'Keep the expired-trial notice visible until the account is upgraded.', path: 'src/components/TrialBar.tsx', anchor: { side: 'new', line: 2 }, reproduction: { ...finding.reproduction, status: 'blocked', actual: 'Could not verify the expired account state.', limitation: 'Fixture has no expired trial account available.', evidence: [] } })
await writeFile(path.join(home, 'demo-plan.png'), await readFile(path.join(root, 'fixtures/media/plan-confirmed.png')))
await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(makeManifest({ id, kind: 'pr-review', tickets: [], title: 'Review account upgrade flow', repo: { path: repo, baseRef: 'main', branch: 'feature/upgrade', remote: null } }), null, 2))
await publishReport(dir, report, home, tree, patches)
console.log(`PR review demo: /s/${id}/files`)
