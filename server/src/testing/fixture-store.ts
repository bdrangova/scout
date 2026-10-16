import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Express } from 'express'
import { SCHEMA_VERSION } from '@review-dash/shared'
import type { Manifest } from '@review-dash/shared'
import { defaultBase } from '@review-dash/shared/git/repo'
import { createApp } from '../app.ts'
import type { AppOverrides } from '../app.ts'
import { loadConfig } from '../config.ts'
import type { Config } from '../config.ts'
import { createFixtureRepo, pngBytes } from './fixture-repo.ts'
import type { FixtureRepo } from './fixture-repo.ts'

export const FIXTURE_SESSION_ID = '20260101-0900-fixture-abcd'
export const BROKEN_SESSION_ID = '20260102-1000-broken-ffff'
export const FIXTURE_T0 = '2026-01-01T09:00:00.000Z'

export interface FixtureStore {
  home: string
  repo: FixtureRepo
  /** `<home>/sessions/<FIXTURE_SESSION_ID>` */
  dir: string
  manifest: Manifest
  cleanup(): Promise<void>
}

export function fixtureSessionDir(home: string, id: string = FIXTURE_SESSION_ID): string {
  return path.join(home, 'sessions', id)
}

/** A `Config` pointing at `home`, built the same way the server does (`AI_REVIEW_HOME`). */
export function testConfig(home: string): Config {
  return loadConfig({ AI_REVIEW_HOME: home, AGENT_ADAPTER: 'fake', PATH: '' })
}

/** Quiet logs, fast watchers and a short tree debounce. Call `closeApp` in `afterAll`. */
export function appFor(home: string, overrides: AppOverrides = {}): Express {
  return createApp(testConfig(home), {
    log: () => undefined,
    watcher: { stabilityThreshold: 100, pollInterval: 20, debounceMs: 100 },
    trees: { debounceMs: 100 },
    ...overrides,
  })
}

async function writeFile(file: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

/**
 * A throwaway v2 store in `os.tmpdir()`: one session whose manifest points at a fresh fixture
 * repo (next to the store, or inside it with `repoInsideHome`), with evidence (indexed), extras
 * (invalid index, ignored), spec (indexed) and a PR description, plus a session with a broken manifest.
 */
export async function createFixtureStore(options: { repoInsideHome?: boolean } = {}): Promise<FixtureStore> {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'review-dash-store-')))
  let repoParent = os.tmpdir()
  if (options.repoInsideHome) {
    repoParent = path.join(home, 'repos')
    await fs.mkdir(repoParent, { recursive: true })
  }
  const repo = await createFixtureRepo(repoParent)
  const dir = fixtureSessionDir(home)

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    id: FIXTURE_SESSION_ID,
    title: 'Fixture session',
    createdAt: FIXTURE_T0,
    updatedAt: FIXTURE_T0,
    agent: { type: 'claude-code', sessionId: 'agent-session-1', cliVersion: '2.1.241', entrypoint: 'cli' },
    repo: { path: repo.repo, remote: null, branch: 'feature/fixture', baseRef: await defaultBase(repo.repo) },
    tickets: [{ key: 'QI-1', url: null }],
  }
  await writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(path.join(dir, 'pr-description.md'), '# Fixture change\n\nWhat changed and why.\n')

  await writeFile(path.join(dir, 'evidence', 'shot.png'), pngBytes(7))
  await writeFile(path.join(dir, 'evidence', 'flow.webm'), Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251)))
  await writeFile(path.join(dir, 'evidence', 'notes.txt'), 'not media\n')
  await writeFile(
    path.join(dir, 'evidence', 'index.json'),
    JSON.stringify({ items: [{ file: 'flow.webm', caption: 'Checkout flow', description: 'Full run' }, { file: 'gone.png', caption: 'missing' }] }),
  )

  await writeFile(path.join(dir, 'extras', 'notes.md'), '# Fixture notes\n\nSome notes.\n')
  await writeFile(path.join(dir, 'extras', 'report.html'), '<!doctype html><html><head><title>Fixture report</title></head><body>ok</body></html>\n')
  await writeFile(path.join(dir, 'extras', 'diagrams', 'flow.mmd'), 'graph TD\n  A --> B\n')
  await writeFile(path.join(dir, 'extras', 'index.json'), '{ "items": "not an array" }')

  await writeFile(path.join(dir, 'spec', 'jira.md'), '# QI-1 Fixture ticket\n\nAs a reviewer…\n')
  await writeFile(path.join(dir, 'spec', 'plan.md'), '# Plan\n\n1. Do it.\n')
  await writeFile(
    path.join(dir, 'spec', 'index.json'),
    JSON.stringify({ items: [{ file: 'jira.md', type: 'jira', url: 'https://example.atlassian.net/browse/QI-1', capturedAt: FIXTURE_T0 }] }),
  )

  await writeFile(path.join(fixtureSessionDir(home, BROKEN_SESSION_ID), 'manifest.json'), JSON.stringify({ schemaVersion: SCHEMA_VERSION, id: BROKEN_SESSION_ID }))

  return {
    home,
    repo,
    dir,
    manifest,
    cleanup: async () => {
      await fs.rm(home, { recursive: true, force: true })
      await repo.cleanup()
    },
  }
}
