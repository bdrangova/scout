import fs from 'node:fs'
import path from 'node:path'
import { BlueprintGroupsResponseSchema, BlueprintLayoutResponseSchema, BlueprintResponseSchema, PutBlueprintLayoutResponseSchema, StoreEventSchema } from '@scout/shared'
import type { Blueprint, BlueprintFile, BlueprintLayout } from '@scout/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Express } from 'express'
import { closeApp } from '../app.ts'
import { Store } from '../store/index.ts'
import { FIXTURE_SESSION_ID, TEST_RUN_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { listen, openSseReader } from '../testing/sse-client.ts'
import type { SseMessage } from '../testing/sse-client.ts'

let store: FixtureStore
let app: Express
let server: Awaited<ReturnType<typeof listen>>

beforeAll(async () => {
  store = await createFixtureStore({ testRun: true })
  const { repo } = store
  // Base side: a page base class and the tsconfig that defines the `@client` alias, on master.
  await repo.git(['checkout', '-q', 'master'])
  await repo.write('web/tsconfig.json', '{\n  // aliases\n  "compilerOptions": { "paths": { "@client/*": ["./*"] } }\n}\n')
  await repo.write('web/pages/base_page.js', ['export default class BasePage {', '  constructor(props) {', '    this.props = props', '  }', '  render() {', '    return null', '  }', '  title() {', "    return 'base'", '  }', '}', ''].join('\n'))
  await repo.git(['add', 'web'])
  await repo.git(['commit', '-q', '-m', 'base pages'])
  await repo.git(['push', '-q', 'origin', 'master'])
  await repo.git(['checkout', '-q', 'feature/fixture'])
  await repo.git(['merge', '-q', '--no-edit', 'master'])
  // Branch side: the base class changes, two subclasses reach it through the alias, one also uses a helper through `.js` and a component uses it too.
  await repo.write('web/pages/base_page.js', ['export default class BasePage {', '  constructor(props) {', '    this.props = props', '  }', '  render() {', '    return undefined', '  }', '  footer() {', '    return null', '  }', '}', ''].join('\n'))
  await repo.write('web/pages/login_page.js', ["import BasePage from '@client/pages/base_page'", '', 'export class LoginPage extends BasePage {', '  submit() {}', '}', ''].join('\n'))
  await repo.write('web/pages/home_page.js', ["import Base from '@client/pages/base_page'", "import { helper } from './helper.js'", "import React from 'react'", '', 'class HomePage extends Base {', '  render() {', '    return helper()', '  }', '}', 'export default HomePage', ''].join('\n'))
  await repo.write('web/pages/helper.ts', 'export function helper(): number {\n  return 1\n}\n')
  await repo.write('web/ui/Card.tsx', ["import { helper } from '../pages/helper'", '', 'export function Card() {', '  return <div>{helper()}</div>', '}', ''].join('\n'))
  await repo.git(['add', 'web'])
  await repo.git(['commit', '-q', '-m', 'pages'])
  app = appFor(store.home)
  server = await listen(app)
})
afterAll(async () => {
  await closeApp(app)
  await server.close()
  await store.cleanup()
})

const url = (id = FIXTURE_SESSION_ID) => `/api/sessions/${id}/blueprint`
const layoutUrl = (id = FIXTURE_SESSION_ID) => `${url(id)}/layout`
const groupsUrl = (id = FIXTURE_SESSION_ID) => `${url(id)}/groups`
const groupsFile = () => path.join(store.dir, 'review', 'groups.json')
const layoutFile = () => path.join(store.dir, 'review', 'blueprint.json')

async function blueprint(): Promise<Blueprint> {
  const res = await request(app).get(url())
  expect(res.status).toBe(200)
  const { blueprint: value } = BlueprintResponseSchema.parse(res.body)
  if (value === null) throw new Error('expected a blueprint')
  return value
}
const fileOf = (bp: Blueprint, file: string): BlueprintFile => {
  const found = bp.files.find((f) => f.path === file)
  if (!found) throw new Error(`${file} is not in the blueprint`)
  return found
}

describe('GET /sessions/:id/blueprint', () => {
  it('resolves alias imports to changed files and reports inheritance', async () => {
    const bp = await blueprint()
    const login = fileOf(bp, 'web/pages/login_page.js')
    expect(login).toMatchObject({ kind: 'page', analyzed: true, imports: ['web/pages/base_page.js'], extends: ['web/pages/base_page.js'] })
    expect(login.members).toEqual([
      { name: 'class LoginPage', change: 'added', side: 'new', line: 3 },
      { name: 'submit()', change: 'added', side: 'new', line: 4 },
    ])
    const home = fileOf(bp, 'web/pages/home_page.js')
    expect(home.imports).toEqual(['web/pages/base_page.js', 'web/pages/helper.ts'])
    expect(home.extends).toEqual(['web/pages/base_page.js'])
    expect(fileOf(bp, 'web/ui/Card.tsx')).toMatchObject({ kind: 'component', imports: ['web/pages/helper.ts'], extends: [] })
    expect(fileOf(bp, 'web/pages/helper.ts').members).toEqual([{ name: 'helper()', change: 'added', side: 'new', line: 1 }])
  })

  it('diffs members of a changed file against its base version, leaving the class itself alone', async () => {
    const base = fileOf(await blueprint(), 'web/pages/base_page.js')
    expect(base.imports).toEqual([])
    expect(base.members).toEqual([
      { name: 'render()', change: 'changed', side: 'new', line: 5 },
      { name: 'footer()', change: 'added', side: 'new', line: 8 },
      { name: 'title()', change: 'removed', side: 'old', line: 8 },
    ])
  })

  it('lists every file of the tree, in order, and leaves non-JS, binary and omitted files unanalysed', async () => {
    const detail = (await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body as { tree: { fingerprint: string; files: { path: string; status: string }[] } }
    const bp = await blueprint()
    expect(bp.fingerprint).toBe(detail.tree.fingerprint)
    expect(bp.files.map((f) => f.path)).toEqual(detail.tree.files.map((f) => f.path))
    for (const file of ['assets/logo.png', 'package-lock.json', 'big.bin', 'web/tsconfig.json']) {
      if (bp.files.some((f) => f.path === file)) expect(fileOf(bp, file)).toMatchObject({ analyzed: false, members: [], imports: [], extends: [] })
    }
    expect(fileOf(bp, 'package-lock.json').kind).toBe('config')
    // A deleted file has no imports and all its declarations removed; the rename reads its base from the old path.
    expect(fileOf(bp, 'src/old.ts')).toMatchObject({ analyzed: true, imports: [] })
    expect(fileOf(bp, 'src/old.ts').members.every((m) => m.change === 'removed')).toBe(true)
    expect(fileOf(bp, 'src/renamed.ts').analyzed).toBe(true)
  })

  it('answers { blueprint: null } for a test run and 404 for an unknown session', async () => {
    expect((await request(app).get(url(TEST_RUN_SESSION_ID))).body).toEqual({ blueprint: null })
    expect((await request(app).get(url('20260101-0900-missing-0000'))).status).toBe(404)
  })
})

describe('Store.getBlueprint cache', () => {
  it('shares one computation per tree fingerprint and recomputes when the tree changes', async () => {
    const own = new Store(store.home, { log: () => undefined, trees: { debounceMs: 20 } })
    try {
      const [a, b] = await Promise.all([own.getBlueprint(FIXTURE_SESSION_ID), own.getBlueprint(FIXTURE_SESSION_ID)])
      expect(a.blueprint).not.toBeNull()
      expect(b.blueprint).toBe(a.blueprint)
      expect((await own.getBlueprint(FIXTURE_SESSION_ID)).blueprint).toBe(a.blueprint)

      await store.repo.write('web/pages/extra.ts', 'export const extra = 1\n')
      own.invalidateTree(FIXTURE_SESSION_ID)
      await vi.waitFor(async () => {
        const next = (await own.getBlueprint(FIXTURE_SESSION_ID)).blueprint
        expect(next?.files.some((f) => f.path === 'web/pages/extra.ts')).toBe(true)
        expect(next?.fingerprint).not.toBe(a.blueprint?.fingerprint)
      })
    } finally {
      own.close()
    }
  })
})

const diagramA = { positions: { 'dir:web': { x: 10, y: 20 }, 'file:web/pages/helper.ts': { x: -5.5, y: 0 } }, viewport: { x: 1, y: 2, scale: 0.5 } }
const diagramB = { positions: { 'file:web/ui/Card.tsx': { x: 0, y: 0 } } }

describe('blueprint layout', () => {
  it('reads null, saves per diagram, replaces one and removes one with null', async () => {
    expect(BlueprintLayoutResponseSchema.parse((await request(app).get(layoutUrl())).body)).toEqual({ layout: null })

    const first = await request(app).put(layoutUrl()).send({ diagram: 'pkg:', layout: diagramA })
    expect(first.status).toBe(200)
    const { updatedAt } = PutBlueprintLayoutResponseSchema.parse(first.body)
    expect(fs.existsSync(layoutFile())).toBe(true)

    await request(app).put(layoutUrl()).send({ diagram: 'around:web/pages/helper.ts', layout: diagramB }).expect(200)
    let layout = BlueprintLayoutResponseSchema.parse((await request(app).get(layoutUrl())).body).layout as BlueprintLayout
    expect(layout).toMatchObject({ sessionId: FIXTURE_SESSION_ID, schemaVersion: 1 })
    expect(layout.diagrams).toEqual({ 'pkg:': diagramA, 'around:web/pages/helper.ts': diagramB })
    expect(Date.parse(layout.updatedAt)).toBeGreaterThan(Date.parse(updatedAt))

    const replacement = { positions: { 'dir:web': { x: 1, y: 1 } } }
    await request(app).put(layoutUrl()).send({ diagram: 'pkg:', layout: replacement }).expect(200)
    layout = BlueprintLayoutResponseSchema.parse((await request(app).get(layoutUrl())).body).layout as BlueprintLayout
    expect(layout.diagrams['pkg:']).toEqual(replacement)
    expect(layout.diagrams['around:web/pages/helper.ts']).toEqual(diagramB)

    await request(app).put(layoutUrl()).send({ diagram: 'pkg:', layout: null }).expect(200)
    layout = BlueprintLayoutResponseSchema.parse((await request(app).get(layoutUrl())).body).layout as BlueprintLayout
    expect(Object.keys(layout.diagrams)).toEqual(['around:web/pages/helper.ts'])
  })

  it('rejects a bad body with 400', async () => {
    expect((await request(app).put(layoutUrl()).send({ diagram: '', layout: null })).status).toBe(400)
    expect((await request(app).put(layoutUrl()).send({ diagram: 'pkg:', layout: { positions: { a: { x: 'no', y: 1 } } } })).status).toBe(400)
    expect((await request(app).put(layoutUrl()).send({ diagram: 'pkg:' })).status).toBe(400)
  })

  it('treats an invalid or foreign file as absent, and a PUT then starts afresh', async () => {
    fs.writeFileSync(layoutFile(), '{ nope')
    expect((await request(app).get(layoutUrl())).body).toEqual({ layout: null })
    fs.writeFileSync(layoutFile(), JSON.stringify({ schemaVersion: 1, sessionId: '20260101-0900-other-0000', updatedAt: '2026-01-01T10:00:00.000Z', diagrams: { 'pkg:': diagramA } }))
    expect((await request(app).get(layoutUrl())).body).toEqual({ layout: null })
    await request(app).put(layoutUrl()).send({ diagram: 'pkg:', layout: diagramB }).expect(200)
    const layout = BlueprintLayoutResponseSchema.parse((await request(app).get(layoutUrl())).body).layout as BlueprintLayout
    expect(layout.diagrams).toEqual({ 'pkg:': diagramB })
  })

  it('is 404 for a test run (PUT) and an unknown session, and null for a test run (GET)', async () => {
    expect((await request(app).put(layoutUrl(TEST_RUN_SESSION_ID)).send({ diagram: 'pkg:', layout: diagramA })).status).toBe(404)
    expect((await request(app).get(layoutUrl(TEST_RUN_SESSION_ID))).body).toEqual({ layout: null })
    expect((await request(app).put(layoutUrl('20260101-0900-missing-0000')).send({ diagram: 'pkg:', layout: null })).status).toBe(404)
    expect((await request(app).get(layoutUrl('20260101-0900-missing-0000'))).status).toBe(404)
  })

  it('never lets a diagram id such as __proto__ reach the prototype', async () => {
    await request(app).put(layoutUrl()).send({ diagram: '__proto__', layout: diagramB }).expect(200)
    const layout = BlueprintLayoutResponseSchema.parse((await request(app).get(layoutUrl())).body).layout as BlueprintLayout
    expect(Object.getPrototypeOf(layout.diagrams)).toBe(Object.prototype)
    expect('positions' in Object.prototype).toBe(false)
    expect(layout.diagrams['pkg:']).toEqual(diagramB)
  })
})

describe('GET /api/events for the layout file', () => {
  it('reports an external write as blueprint-layout.updated, but not our own PUT', async () => {
    const reader = await openSseReader(`${server.url}/api/events`)
    try {
      await reader.waitFor((m) => m.kind === 'comment' && m.text === 'ready')
      const isLayoutEvent = (m: SseMessage) => m.kind === 'event' && StoreEventSchema.parse(JSON.parse(m.data)).type === 'blueprint-layout.updated'

      const before = reader.messages.length
      const res = await fetch(`${server.url}${layoutUrl()}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ diagram: 'pkg:', layout: diagramA }) })
      expect(res.status).toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 800))
      expect(reader.messages.slice(before).some(isLayoutEvent)).toBe(false)

      const mark = reader.messages.length
      fs.writeFileSync(layoutFile(), JSON.stringify({ schemaVersion: 1, sessionId: FIXTURE_SESSION_ID, updatedAt: '2026-01-01T10:00:00.000Z', diagrams: {} }))
      const event = await reader.waitFor(isLayoutEvent, { timeoutMs: 8_000, from: mark })
      expect(event.kind === 'event' && JSON.parse(event.data)).toEqual({ type: 'blueprint-layout.updated', sessionId: FIXTURE_SESSION_ID })
    } finally {
      reader.close()
    }
  })
})

const groupsDoc = (sessionId = FIXTURE_SESSION_ID) => ({
  schemaVersion: 1,
  sessionId,
  updatedAt: '2026-11-13T10:00:00.000Z',
  groupings: { feature: { createdAt: '2026-11-13T10:00:00.000Z', groups: [{ id: 'pages', name: 'Pages', purpose: 'The pages', files: ['web/pages/helper.ts'] }] } },
})

describe('blueprint groups', () => {
  it('reads null when the agent grouped nothing', async () => {
    fs.rmSync(groupsFile(), { force: true })
    expect(BlueprintGroupsResponseSchema.parse((await request(app).get(groupsUrl())).body)).toEqual({ groups: null })
  })

  it('returns a valid file', async () => {
    fs.writeFileSync(groupsFile(), JSON.stringify(groupsDoc()))
    const res = await request(app).get(groupsUrl())
    expect(res.status).toBe(200)
    expect(BlueprintGroupsResponseSchema.parse(res.body).groups).toEqual(groupsDoc())
  })

  it('treats an unparsable, invalid or foreign file as absent', async () => {
    fs.writeFileSync(groupsFile(), '{ nope')
    expect((await request(app).get(groupsUrl())).body).toEqual({ groups: null })
    fs.writeFileSync(groupsFile(), JSON.stringify({ ...groupsDoc(), groupings: { feature: { createdAt: '2026-11-13T10:00:00.000Z', groups: [] } } }))
    expect((await request(app).get(groupsUrl())).body).toEqual({ groups: null })
    fs.writeFileSync(groupsFile(), JSON.stringify(groupsDoc('20260101-0900-other-0000')))
    expect((await request(app).get(groupsUrl())).body).toEqual({ groups: null })
  })

  it('is null for a test run and 404 for an unknown session', async () => {
    expect((await request(app).get(groupsUrl(TEST_RUN_SESSION_ID))).body).toEqual({ groups: null })
    expect((await request(app).get(groupsUrl('20260101-0900-missing-0000'))).status).toBe(404)
  })

  it('reports a write of the file as blueprint-groups.updated', async () => {
    fs.rmSync(groupsFile(), { force: true })
    const reader = await openSseReader(`${server.url}/api/events`)
    try {
      await reader.waitFor((m) => m.kind === 'comment' && m.text === 'ready')
      const isGroupsEvent = (m: SseMessage) => m.kind === 'event' && StoreEventSchema.parse(JSON.parse(m.data)).type === 'blueprint-groups.updated'
      const mark = reader.messages.length
      fs.writeFileSync(groupsFile(), JSON.stringify(groupsDoc()))
      const event = await reader.waitFor(isGroupsEvent, { timeoutMs: 8_000, from: mark })
      expect(event.kind === 'event' && JSON.parse(event.data)).toEqual({ type: 'blueprint-groups.updated', sessionId: FIXTURE_SESSION_ID })
    } finally {
      reader.close()
    }
  })
})

// Last: it rewrites the fixture session's manifest.
describe('a PR review', () => {
  it('gets the blueprint and its layout too', async () => {
    fs.writeFileSync(path.join(store.dir, 'manifest.json'), JSON.stringify({ ...store.manifest, kind: 'pr-review' }))
    const prApp = appFor(store.home)
    try {
      const res = await request(prApp).get(url())
      expect(res.status).toBe(200)
      expect(BlueprintResponseSchema.parse(res.body).blueprint?.files.length).toBeGreaterThan(0)
      expect((await request(prApp).get(layoutUrl())).status).toBe(200)
    } finally {
      await closeApp(prApp)
    }
  })
})
