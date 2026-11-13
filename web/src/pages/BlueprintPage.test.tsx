import { type Blueprint, type BlueprintFile, type BlueprintLayout } from '@scout/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useEffect, useImperativeHandle, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JournalContext } from '@/state/journal-context'
import { fp, makeTreeFile, SESSION_ID, sessionDetailFixture, testRunDetailFixture } from '@/test/fixtures'
import { makeEntry, makeJournal } from '@/test/journal'
import { renderShell } from '@/test/render-shell'
import { BlueprintPage } from './BlueprintPage'

const mocks = vi.hoisted(() => ({
  save: vi.fn(() => Promise.resolve()),
  requestLineJump: vi.fn(),
  state: { blueprint: null as unknown, layout: null as unknown },
}))

vi.mock('@/lib/blueprint', async (importOriginal) => {
  const { buildBlueprintTree: build } = await import('@scout/shared')
  return {
    ...(await importOriginal<typeof import('@/lib/blueprint')>()),
    useBlueprint: () => {
      const blueprint = mocks.state.blueprint as Blueprint | null
      return { blueprint, root: blueprint ? build(blueprint.files.map((file) => file.path)) : null, loading: false, error: null, reload: () => {} }
    },
    useBlueprintLayout: () => ({ layout: mocks.state.layout as BlueprintLayout | null, loading: false, save: mocks.save }),
  }
})

vi.mock('@/lib/line-jump', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/line-jump')>()), requestLineJump: mocks.requestLineJump }))

// The pan and zoom library measures real layout; here it only has to render its content and report that it is ready.
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: forwardRef(function Wrapper({ children, onInit }: { children: ReactNode; onInit?: () => void }, ref) {
    useImperativeHandle(ref, () => ({ zoomIn: () => Promise.resolve(), zoomOut: () => Promise.resolve(), setTransform: () => Promise.resolve() }))
    useEffect(() => onInit?.(), [onInit])
    return <div>{children}</div>
  }),
  TransformComponent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

function file(path: string, overrides: Partial<BlueprintFile> = {}): BlueprintFile {
  return { path, kind: 'module', analyzed: true, members: [], imports: [], extends: [], ...overrides }
}

const PATHS = [...Array.from({ length: 8 }, (_, i) => `a/A${i}.ts`), ...Array.from({ length: 8 }, (_, i) => `b/B${i}.ts`)]

function setBlueprint(overrides: Record<string, Partial<BlueprintFile>> = {}, layout: BlueprintLayout | null = null) {
  mocks.state.blueprint = { fingerprint: fp('blueprint'), files: PATHS.map((path) => file(path, overrides[path])) } satisfies Blueprint
  mocks.state.layout = layout
}

const detail = { ...sessionDetailFixture, tree: { ...sessionDetailFixture.tree, files: PATHS.map((path) => makeTreeFile({ path, additions: 5, deletions: 2 })) } }

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{`${pathname}${search}`}</output>
}

function where(): URL {
  return new URL(screen.getByTestId('where').textContent ?? '', 'http://scout.test')
}

function open(search = '', journal = makeJournal([])) {
  renderShell(`/s/${SESSION_ID}/blueprint${search}`, {
    detail,
    page: (
      <JournalContext.Provider value={{ journal, loading: false, error: null, reload: () => {} }}>
        <BlueprintPage />
        <Where />
      </JournalContext.Provider>
    ),
  })
}

beforeEach(() => {
  mocks.save.mockClear()
  mocks.requestLineJump.mockClear()
  setBlueprint()
})

describe('BlueprintPage', () => {
  it('draws a package box per folder for the whole change, with the summary and the rail outline', () => {
    open()
    expect(screen.getByRole('group', { name: 'Package a' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Package b' })).toBeInTheDocument()
    expect(screen.getByText('2 boxes · 16 files · 0 reviewed')).toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Packages' })
    expect(within(rail).getByRole('button', { name: /Whole change/ })).toHaveAttribute('aria-current', 'page')
    expect(within(rail).getByRole('button', { name: /^a\s*8$/ })).toBeInTheDocument()
  })

  it('folds the rail outline, all at once too, and filters it by name', async () => {
    const many = (dir: string) => Array.from({ length: 8 }, (_, i) => `${dir}/F${i}.ts`)
    mocks.state.blueprint = { fingerprint: fp('blueprint'), files: [...many('x/p'), ...many('x/q'), ...many('y')].map((path) => file(path)) } satisfies Blueprint
    open()
    const rail = within(screen.getByRole('navigation', { name: 'Packages' }))
    expect(rail.getByRole('button', { name: /^p\s*8$/ })).toBeInTheDocument()

    await userEvent.click(rail.getByRole('button', { name: 'Collapse x' }))
    expect(rail.queryByRole('button', { name: /^p\s*8$/ })).not.toBeInTheDocument()
    await userEvent.click(rail.getByRole('button', { name: 'Expand all' }))
    expect(rail.getByRole('button', { name: /^p\s*8$/ })).toBeInTheDocument()
    await userEvent.click(rail.getByRole('button', { name: 'Collapse all' }))
    expect(rail.queryByRole('button', { name: /^q\s*8$/ })).not.toBeInTheDocument()

    await userEvent.type(rail.getByRole('searchbox', { name: 'Filter packages' }), 'x/q')
    expect(rail.getByRole('button', { name: /^q\s*8$/ })).toBeInTheDocument()
    expect(rail.getByRole('button', { name: /^x\s*16$/ })).toBeInTheDocument()
    expect(rail.queryByRole('button', { name: /^p\s*8$/ })).not.toBeInTheDocument()
    expect(rail.queryByRole('button', { name: /^y\s*8$/ })).not.toBeInTheDocument()
    expect(rail.getByText('1 of 4')).toBeInTheDocument()
  })

  it('opens a package diagram from its name', async () => {
    open()
    await userEvent.click(within(screen.getByRole('group', { name: 'Package a' })).getByRole('button', { name: /^a/ }))
    expect(where().searchParams.get('at')).toBe('pkg:a')
  })

  it('draws file boxes for a package, with the breadcrumb back to the whole change', async () => {
    open('?at=pkg:a')
    expect(screen.getAllByRole('group', { name: /^File a\/A\d\.ts$/ })).toHaveLength(8)
    const path = screen.getByRole('navigation', { name: 'Diagram path' })
    expect(within(path).getByText('a')).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(path).getByRole('button', { name: 'Whole change' }))
    expect(where().searchParams.get('at')).toBeNull()
  })

  it('lists the changed members, strikes the removed ones and jumps to a line from a member', async () => {
    setBlueprint({
      'a/A0.ts': {
        members: [
          { name: 'addedFn()', change: 'added', side: 'new', line: 4 },
          { name: 'goneFn()', change: 'removed', side: 'old', line: 9 },
          { name: 'touchedFn()', change: 'changed', side: 'new', line: 12 },
        ],
      },
    })
    open('?at=pkg:a')
    const box = screen.getByRole('group', { name: 'File a/A0.ts' })
    expect(within(box).getByRole('button', { name: /added addedFn\(\)/ })).toBeInTheDocument()
    expect(within(box).getByText('goneFn()')).toHaveClass('line-through')
    await userEvent.click(within(box).getByRole('button', { name: /removed goneFn\(\)/ }))
    expect(mocks.requestLineJump).toHaveBeenCalledWith('a/A0.ts', 'old', 9)
    expect(where().pathname).toBe(`/s/${SESSION_ID}/files/a/A0.ts`)
    expect(where().searchParams.get('bp')).toBe('pkg:a')
  })

  it('shows the journal summary of a file', () => {
    open('?at=pkg:a', makeJournal([makeEntry('j1', { kind: 'summary', title: 'Adds the countdown', file: 'a/A0.ts' })]))
    expect(within(screen.getByRole('group', { name: 'File a/A0.ts' })).getByText('Adds the countdown')).toBeInTheDocument()
  })

  it('opens the Files page limited to the diagram from a file header', async () => {
    open('?at=pkg:a')
    await userEvent.click(within(screen.getByRole('group', { name: 'File a/A3.ts' })).getByRole('button', { name: /A3\.ts/ }))
    expect(where().pathname).toBe(`/s/${SESSION_ID}/files/a/A3.ts`)
    expect(where().searchParams.get('bp')).toBe('pkg:a')
    expect(where().searchParams.get('mode')).toBe('swipe')
  })

  it('draws arrows between files and redraws the diagram around a file', async () => {
    setBlueprint({ 'a/A1.ts': { imports: ['a/A0.ts'], extends: ['a/A0.ts'] }, 'a/A2.ts': { imports: ['a/A0.ts'] } })
    open('?at=pkg:a')
    expect(document.querySelectorAll('[data-arrow="extends"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-arrow="uses"]')).toHaveLength(1)
    await userEvent.click(within(screen.getByRole('group', { name: 'File a/A0.ts' })).getByRole('button', { name: /2 lean on it/ }))
    expect(where().searchParams.get('at')).toBe('around:a/A0.ts')
  })

  it('shows the around-diagram with its crumb and goes up to the package on Esc', () => {
    setBlueprint({ 'a/A1.ts': { imports: ['a/A0.ts'] } })
    open('?at=around:a/A0.ts')
    expect(within(screen.getByRole('navigation', { name: 'Diagram path' })).getByText('around A0.ts')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('group', { name: 'File a/A0.ts' })).toHaveClass('outline-coral')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(where().searchParams.get('at')).toBe('pkg:a')
  })

  it('goes back to the whole change from an unknown diagram', () => {
    open('?at=pkg:missing')
    expect(where().searchParams.get('at')).toBeNull()
    expect(screen.getByRole('group', { name: 'Package a' })).toBeInTheDocument()
  })

  it('puts boxes where the user left them', () => {
    setBlueprint({}, {
      schemaVersion: 1,
      sessionId: SESSION_ID,
      updatedAt: '2026-11-13T10:00:00.000Z',
      diagrams: { 'pkg:a': { positions: { 'file:a/A0.ts': { x: 500, y: 700 } } } },
    })
    open('?at=pkg:a')
    const box = screen.getByRole('group', { name: 'File a/A0.ts' })
    expect(box.style.left).toBe('500px')
    expect(box.style.top).toBe('700px')
  })

  it('forgets the arrangement of the diagram on Tidy up', async () => {
    open('?at=pkg:a')
    await userEvent.click(screen.getByRole('button', { name: 'Tidy up' }))
    expect(mocks.save).toHaveBeenCalledWith('pkg:a', null)
  })

  it('hides summaries and members with Details off', async () => {
    setBlueprint({ 'a/A0.ts': { members: [{ name: 'addedFn()', change: 'added', side: 'new', line: 4 }] } })
    open('?at=pkg:a')
    expect(screen.getByText('addedFn()')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.queryByText('addedFn()')).not.toBeInTheDocument()
  })

  it('has labelled canvas controls and a named canvas', () => {
    open()
    for (const name of ['Zoom out', 'Zoom in', 'Fit to view']) expect(screen.getByRole('button', { name })).toHaveAttribute('title')
    expect(screen.getByRole('region', { name: /Blueprint diagram/ })).toBeInTheDocument()
  })

  it('says so when no file changed', () => {
    mocks.state.blueprint = { fingerprint: fp('blueprint'), files: [] } satisfies Blueprint
    open()
    expect(screen.getByText('No files changed')).toBeInTheDocument()
  })

  it('has no blueprint for a test run', () => {
    renderShell(`/t/${SESSION_ID}/blueprint`, { detail: testRunDetailFixture, page: <BlueprintPage /> })
    expect(screen.getByText('No blueprint for a test run')).toBeInTheDocument()
  })
})

