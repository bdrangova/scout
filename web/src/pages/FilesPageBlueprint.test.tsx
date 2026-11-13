import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionShell } from '@/components/layout/SessionShell'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import {
  reviewResponseFixture,
  SESSION_ID,
  sessionDetailFixture,
} from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { stubEventSource } from '@/test/mock-event-source'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { BlueprintDiagram } from '@scout/shared'
import * as blueprintLib from '@/lib/blueprint'
import { FilesPage } from './FilesPage'

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

// happy-dom has no layout: render every row instead of measuring the scroller.
vi.mock('@tanstack/react-virtual', async () => (await import('@/test/mock-virtualizer')).virtualizerModuleMock())

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname + loc.search}</span>
}

function renderFiles(initialPath: string, response = reviewResponseFixture()) {
  stubEventSource()
  const api = mockReviewApi(response)
  // StrictMode double-invokes effects on mount, like the dev build does. The page sits in the real shell (bar and rail).
  render(
    <StrictMode>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={[initialPath]}>
          <LocationProbe />
          <Routes>
            <Route
              path="/s/:id"
              element={
                <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
                  <ReviewProvider>
                    <SessionShell />
                  </ReviewProvider>
                </SessionContext.Provider>
              }
            >
              <Route path="files" element={<FilesPage />} />
              <Route path="files/*" element={<FilesPage />} />
              <Route path="submit" element={<h2>Submit page</h2>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </StrictMode>,
  )
  return api
}

vi.mock('@/lib/blueprint', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/blueprint')>()),
  useBlueprint: vi.fn(),
  blueprintDiagramOf: vi.fn(),
}))

const files = sessionDetailFixture.tree.files
const [P0, P1, P2] = [files[0]?.path ?? '', files[1]?.path ?? '', files[2]?.path ?? '']

function diagramOf(paths: string[]): BlueprintDiagram {
  return {
    id: 'pkg:src/a',
    ref: { type: 'package', dir: 'src/a' },
    title: 'src/a',
    boxes: paths.map((path) => ({
      key: `file:${path}`,
      ref: { type: 'file', path },
      name: path,
      files: [path],
      layer: -1,
      usedByOutside: 0,
      extendedByOutside: 0,
      usesOutside: 0,
    })),
    arrows: [],
    center: null,
  }
}

function stubBlueprint(diagram: BlueprintDiagram | null, state: { loading?: boolean } = {}) {
  const loading = state.loading ?? false
  vi.mocked(blueprintLib.useBlueprint).mockReturnValue({
    blueprint: loading ? null : ({} as never),
    root: null,
    loading,
    error: null,
    reload: () => {},
  })
  vi.mocked(blueprintLib.blueprintDiagramOf).mockReturnValue(diagram)
}

function currentUrl(): string {
  return screen.getByTestId('loc').textContent ?? ''
}

describe('FilesPage with ?bp=', () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true
  })
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(blueprintLib.useBlueprint).mockReset()
    vi.mocked(blueprintLib.blueprintDiagramOf).mockReset()
    stubBlueprint(null)
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('lists only the diagram files, in the diagram order, with a strip that names it', async () => {
    stubBlueprint(diagramOf([P2, P0, 'not/in/tree.ts']))
    renderFiles(`/s/${SESSION_ID}/files?mode=grid&bp=pkg%3Asrc%2Fa`)
    const grid = await screen.findByRole('list', { name: 'All files' })
    const tiles = within(grid).getAllByRole('listitem')
    expect(tiles).toHaveLength(2)
    expect(tiles[0]).toHaveTextContent(P2.split('/').pop() ?? '')
    expect(tiles[1]).toHaveTextContent(P0.split('/').pop() ?? '')
    expect(within(screen.getByRole('region', { name: 'Blueprint scope' })).getByText('src/a')).toBeInTheDocument()
    expect(screen.getByLabelText('2 files')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Blueprint' })).toHaveAttribute('href', `/s/${SESSION_ID}/blueprint?at=pkg%3Asrc%2Fa`)
  })

  it('"Show all files" drops bp and keeps the other params', async () => {
    stubBlueprint(diagramOf([P0, P1]))
    renderFiles(`/s/${SESSION_ID}/files?mode=grid&bp=pkg%3Asrc%2Fa`)
    await userEvent.click(await screen.findByRole('button', { name: 'Show all files' }))
    await waitFor(() => expect(currentUrl()).not.toContain('bp='))
    expect(currentUrl()).toContain('mode=grid')
    expect(screen.queryByRole('region', { name: 'Blueprint scope' })).not.toBeInTheDocument()
  })

  it('falls back to all files when the diagram is unknown', async () => {
    stubBlueprint(null)
    renderFiles(`/s/${SESSION_ID}/files?mode=grid&bp=gone`)
    await waitFor(() => expect(currentUrl()).not.toContain('bp='))
    expect(await screen.findByRole('list', { name: 'All files' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Blueprint scope' })).not.toBeInTheDocument()
  })

  it('shows a loading state, not the full list, while the blueprint loads', async () => {
    stubBlueprint(null, { loading: true })
    renderFiles(`/s/${SESSION_ID}/files?mode=grid&bp=pkg%3Asrc%2Fa`)
    expect(await screen.findByText('Loading the Blueprint…')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'All files' })).not.toBeInTheDocument()
    expect(currentUrl()).toContain('bp=')
  })

  it('moves a current file outside the scope to the first scoped file, keeping the params', async () => {
    stubBlueprint(diagramOf([P2, P1]))
    renderFiles(`/s/${SESSION_ID}/files/${P0}?bp=pkg%3Asrc%2Fa`)
    await waitFor(() => expect(currentUrl()).toContain(`/files/${P2}`))
    expect(currentUrl()).toContain('bp=')
  })

  it('does not ask for the blueprint without ?bp=', async () => {
    renderFiles(`/s/${SESSION_ID}/files?mode=grid`)
    await screen.findByRole('list', { name: 'All files' })
    expect(vi.mocked(blueprintLib.useBlueprint).mock.calls.every(([, enabled]) => enabled === false)).toBe(true)
  })
})
