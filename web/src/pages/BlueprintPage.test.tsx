import { type Blueprint, type BlueprintFile, type BlueprintGroup, type BlueprintGroupingType, type BlueprintLayout } from '@scout/shared'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useEffect, useImperativeHandle, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JournalContext } from '@/state/journal-context'
import { fp, makeTreeFile, reviewResponseFixture, SESSION_ID, sessionDetailFixture, testRunDetailFixture } from '@/test/fixtures'
import { makeEntry, makeJournal } from '@/test/journal'
import { mockReviewApi } from '@/test/mock-api'
import { renderShell } from '@/test/render-shell'
import { BlueprintPage } from './BlueprintPage'

const mocks = vi.hoisted(() => ({
  save: vi.fn(() => Promise.resolve()),
  requestLineJump: vi.fn(),
  state: { blueprint: null as unknown, layout: null as unknown, groupings: {} as unknown },
}))

vi.mock('@/lib/blueprint', async (importOriginal) => {
  const { buildBlueprintTree: build, buildBlueprintGroupTree: buildGroups, BLUEPRINT_GROUPING_TYPES } = await import('@scout/shared')
  return {
    ...(await importOriginal<typeof import('@/lib/blueprint')>()),
    useBlueprint: () => {
      const blueprint = mocks.state.blueprint as Blueprint | null
      const paths = blueprint ? blueprint.files.map((file) => file.path) : []
      const groupings = mocks.state.groupings as Partial<Record<BlueprintGroupingType, { createdAt: string; groups: BlueprintGroup[] }>>
      const groupTrees: Partial<Record<BlueprintGroupingType, ReturnType<typeof buildGroups>>> = {}
      for (const type of BLUEPRINT_GROUPING_TYPES) {
        const grouping = groupings[type]
        if (blueprint && grouping) groupTrees[type] = buildGroups(type, grouping, paths)
      }
      return { blueprint, root: blueprint ? build(paths) : null, groupTrees, groupsLoading: false, groupsError: null, loading: false, error: null, reload: () => {} }
    },
    useBlueprintLayout: () => ({ layout: mocks.state.layout as BlueprintLayout | null, loading: false, save: mocks.save }),
  }
})

vi.mock('@/lib/line-jump', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/line-jump')>()), requestLineJump: mocks.requestLineJump }))

// The pan and zoom library measures real layout; here it only has to render its content and report that it is ready.
vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
  WorkerPoolContextProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

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
  return renderShell(`/s/${SESSION_ID}/blueprint${search}`, {
    detail,
    page: (
      <JournalContext.Provider value={{ journal, loading: false, error: null, reload: () => {} }}>
        <BlueprintPage />
        <Where />
      </JournalContext.Provider>
    ),
  })
}

function setGrouping(type: BlueprintGroupingType, groups: BlueprintGroup[]) {
  mocks.state.groupings = { [type]: { createdAt: '2026-11-13T10:00:00.000Z', groups } }
}

const TOP_BAR: BlueprintGroup = { id: 'top-bar', name: 'Top bar', purpose: 'The bar that counts the trial down.', files: PATHS.filter((path) => path.startsWith('a/')) }
const REST: BlueprintGroup = { id: 'rest', name: 'Everything else', purpose: 'Supporting code.', files: PATHS.filter((path) => path.startsWith('b/')) }

beforeEach(() => {
  window.localStorage.clear()
  mockReviewApi(reviewResponseFixture())
  mocks.state.groupings = {}
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
    expect(where().pathname).toBe(`/s/${SESSION_ID}/blueprint`)
    expect(where().searchParams.get('file')).toBe('a/A0.ts')
    expect(screen.getByRole('dialog', { name: 'a' })).toBeInTheDocument()
  })

  it('shows the journal summary of a file', () => {
    open('?at=pkg:a', makeJournal([makeEntry('j1', { kind: 'summary', title: 'Adds the countdown', file: 'a/A0.ts' })]))
    expect(within(screen.getByRole('group', { name: 'File a/A0.ts' })).getByText('Adds the countdown')).toBeInTheDocument()
  })

  it('draws arrows between files and redraws the diagram around a file', async () => {
    setBlueprint({ 'a/A1.ts': { imports: ['a/A0.ts'], extends: ['a/A0.ts'] }, 'a/A2.ts': { imports: ['a/A0.ts'] } })
    open('?at=pkg:a')
    expect(document.querySelectorAll('[data-arrow="extends"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-arrow="uses"]')).toHaveLength(1)
    await userEvent.click(within(screen.getByRole('group', { name: 'File a/A0.ts' })).getByRole('button', { name: /2 lean on it/ }))
    expect(where().searchParams.get('at')).toBe('around:a/A0.ts')
  })

  it('hides a kind of arrow from the legend and remembers it for the session', async () => {
    setBlueprint({ 'a/A1.ts': { imports: ['a/A0.ts'], extends: ['a/A0.ts'] }, 'a/A2.ts': { imports: ['a/A0.ts'] } })
    open('?at=pkg:a')
    const leansOn = screen.getByRole('button', { name: 'Show the "leans on" arrows' })
    expect(leansOn).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(leansOn)
    expect(leansOn).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('[data-arrow="uses"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-arrow="extends"]')).toHaveLength(1)
    cleanup()
    open('?at=pkg:a')
    expect(screen.getByRole('button', { name: 'Show the "leans on" arrows' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('[data-arrow="uses"]')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Show the "leans on" arrows' }))
    expect(document.querySelectorAll('[data-arrow="uses"]')).toHaveLength(1)
  })

  it('shows only the boxes no arrow touches from the legend and remembers it for the session', async () => {
    setBlueprint({ 'a/A1.ts': { imports: ['a/A0.ts'] } })
    open('?at=pkg:a')
    const shown = screen.getByRole('group', { name: 'Boxes shown' })
    // No packages on this diagram: there is nothing for "files" to do.
    expect(within(shown).queryByRole('button', { name: /loose files/ })).not.toBeInTheDocument()
    const only = within(shown).getByRole('button', { name: 'Only the boxes no arrow touches' })
    expect(only).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(only)
    expect(only).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'File a/A2.ts' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'File a/A0.ts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'File a/A1.ts' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-arrow]')).toHaveLength(0)
    expect(shown).toHaveAttribute('title', '2 boxes hidden')
    cleanup()
    open('?at=pkg:a')
    expect(screen.getByRole('button', { name: 'Only the boxes no arrow touches' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'File a/A0.ts' })).not.toBeInTheDocument()
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

  describe('grouped views', () => {
    const clipboard = vi.fn(() => Promise.resolve())
    beforeEach(() => {
      clipboard.mockClear()
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: clipboard } })
    })

    it('has a switch for a code review, on Folders by default, also for a PR review', () => {
      open()
      const switcher = screen.getByRole('group', { name: 'Group the change by' })
      expect(within(switcher).getByRole('button', { name: 'Folders' })).toHaveAttribute('aria-pressed', 'true')
      for (const name of ['Feature', 'Layer', 'Priority']) expect(within(switcher).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    })

    it('has the switch for a PR review too', () => {
      renderShell(`/s/${SESSION_ID}/blueprint`, {
        detail: { ...detail, manifest: { ...detail.manifest, kind: 'pr-review' } },
        page: (
          <JournalContext.Provider value={{ journal: makeJournal([]), loading: false, error: null, reload: () => {} }}>
            <BlueprintPage />
          </JournalContext.Provider>
        ),
      })
      expect(screen.getByRole('group', { name: 'Package a' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Group the change by' })).toBeInTheDocument()
    })

    it('switches to a view without a grouping: how to ask for it, copied only on the button', async () => {
      open()
      await userEvent.click(screen.getByRole('button', { name: 'Feature' }))
      expect(where().searchParams.get('view')).toBe('feature')
      expect(where().searchParams.get('at')).toBeNull()
      expect(screen.getByText('Not grouped by feature yet')).toBeInTheDocument()
      expect(screen.getByText(`/scout-blueprint-groups ${SESSION_ID} feature`)).toBeInTheDocument()
      expect(screen.getByText(/uses tokens/)).toBeInTheDocument()
      expect(screen.getByText("Run it in this session's Claude Code; this page updates when it is done.")).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /Blueprint diagram/ })).not.toBeInTheDocument()
      expect(clipboard).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
      expect(clipboard).toHaveBeenCalledWith(`/scout-blueprint-groups ${SESSION_ID} feature`)
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })

    it('draws the groups as boxes with their purpose, titled by the view', async () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?view=feature')
      const box = screen.getByRole('group', { name: 'Group Top bar' })
      expect(within(box).getByText('«group»')).toBeInTheDocument()
      expect(within(box).getByText('The bar that counts the trial down.')).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Group Everything else' })).toBeInTheDocument()
      expect(within(screen.getByRole('navigation', { name: 'Diagram path' })).getByText('By feature')).toHaveAttribute('aria-current', 'page')
      expect(screen.queryByText('Whole change')).not.toBeInTheDocument()
      const rail = screen.getByRole('navigation', { name: 'Groups' })
      expect(within(rail).getByRole('button', { name: /By feature/ })).toHaveAttribute('aria-current', 'page')
      expect(screen.queryByRole('status', { name: 'Grouping is out of date' })).not.toBeInTheDocument()
    })

    it('opens a group, keeps the view in the URL, and filters the outline by name', async () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?view=feature')
      await userEvent.click(within(screen.getByRole('group', { name: 'Group Top bar' })).getByRole('button', { name: /Top bar/ }))
      expect(where().searchParams.get('at')).toBe('pkg:@feature/top-bar')
      expect(where().searchParams.get('view')).toBe('feature')
      expect(screen.getAllByRole('group', { name: /^File a\/A\d\.ts$/ })).toHaveLength(8)
      const path = screen.getByRole('navigation', { name: 'Diagram path' })
      await userEvent.click(within(path).getByRole('button', { name: 'By feature' }))
      expect(where().searchParams.get('at')).toBeNull()
      expect(where().searchParams.get('view')).toBe('feature')

      const rail = within(screen.getByRole('navigation', { name: 'Groups' }))
      await userEvent.type(rail.getByRole('searchbox', { name: 'Filter groups' }), 'everything')
      expect(rail.getByRole('button', { name: /Everything else/ })).toBeInTheDocument()
      expect(rail.queryByRole('button', { name: /Top bar/ })).not.toBeInTheDocument()
    })

    it('opens a file from a group diagram in the cards over it, titled by the group', async () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?at=pkg:@feature/top-bar&view=feature')
      await userEvent.click(within(screen.getByRole('group', { name: 'File a/A3.ts' })).getByRole('button', { name: /A3\.ts/ }))
      expect(where().searchParams.get('file')).toBe('a/A3.ts')
      expect(where().searchParams.get('at')).toBe('pkg:@feature/top-bar')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('draws files no group names in a dashed Ungrouped box and says the grouping is out of date', async () => {
      setGrouping('feature', [{ ...TOP_BAR, files: TOP_BAR.files.slice(0, 6) }, REST])
      open('?view=feature')
      const ungrouped = screen.getByRole('group', { name: 'Group Ungrouped' })
      expect(within(ungrouped).getByText('«ungrouped»')).toBeInTheDocument()
      expect(ungrouped).toHaveClass('border-dashed')
      const notice = screen.getByRole('status', { name: 'Grouping is out of date' })
      expect(within(notice).getByText('2 files changed since this grouping')).toBeInTheDocument()
      await userEvent.click(within(notice).getByRole('button', { name: 'Regroup' }))
      expect(clipboard).toHaveBeenCalledWith(`/scout-blueprint-groups ${SESSION_ID} feature`)
      expect(await within(notice).findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })

    it('mentions removed files only when nothing is ungrouped', () => {
      setGrouping('feature', [{ ...TOP_BAR, files: [...TOP_BAR.files, 'a/Gone.ts'] }, REST])
      open('?view=feature')
      expect(screen.getByText('1 file left the change since this grouping')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Group Ungrouped' })).not.toBeInTheDocument()
    })

    it('lets ?at= win over ?view=: a folder diagram shows the folders and the switch says so', () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?view=feature&at=pkg:a')
      expect(screen.getAllByRole('group', { name: /^File a\/A\d\.ts$/ })).toHaveLength(8)
      expect(screen.getByRole('button', { name: 'Folders' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows the view named by a group diagram even without ?view=', () => {
      setGrouping('layer', [TOP_BAR, REST])
      open('?at=pkg:@layer/rest')
      expect(screen.getByRole('button', { name: 'Layer' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByRole('group', { name: /^File b\/B\d\.ts$/ })).toHaveLength(8)
    })

    it('keeps the view on an around-a-file diagram and goes up to the group holding the file', () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?at=around:a/A0.ts&view=feature')
      expect(screen.getByRole('button', { name: 'Feature' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(where().searchParams.get('at')).toBe('pkg:@feature/top-bar')
      expect(where().searchParams.get('view')).toBe('feature')
    })

    it('falls back to the view root when a group no longer exists', () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?at=pkg:@feature/old&view=feature')
      expect(where().searchParams.get('at')).toBeNull()
      expect(where().searchParams.get('view')).toBe('feature')
      expect(screen.getByRole('group', { name: 'Group Top bar' })).toBeInTheDocument()
    })

    it('goes back to Folders and drops the view and the diagram', async () => {
      setGrouping('feature', [TOP_BAR, REST])
      open('?at=pkg:@feature/top-bar&view=feature')
      await userEvent.click(screen.getByRole('button', { name: 'Folders' }))
      expect(where().searchParams.get('view')).toBeNull()
      expect(where().searchParams.get('at')).toBeNull()
      expect(screen.getByRole('group', { name: 'Package a' })).toBeInTheDocument()
      expect(within(screen.getByRole('navigation', { name: 'Diagram path' })).getByText('Whole change')).toBeInTheDocument()
    })
  })

  it('has no blueprint for a test run', () => {
    renderShell(`/t/${SESSION_ID}/blueprint`, { detail: testRunDetailFixture, page: <BlueprintPage /> })
    expect(screen.getByText('No blueprint for a test run')).toBeInTheDocument()
  })
})

