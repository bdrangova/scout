import { type Blueprint, type BlueprintFile, type BlueprintLayout, type FileReview, type ReviewAction } from '@scout/shared'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useEffect, useImperativeHandle, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBlueprintSelection } from '@/lib/blueprint'
import { type ReviewContextValue } from '@/state/review-context'
import { JournalContext } from '@/state/journal-context'
import { fp, makeTreeFile, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { makeJournal } from '@/test/journal'
import { mockReviewApi } from '@/test/mock-api'
import { renderShell } from '@/test/render-shell'
import { BlueprintPage } from './BlueprintPage'

const mocks = vi.hoisted(() => ({ state: { blueprint: null as unknown, layout: null as unknown } }))

vi.mock('@/lib/blueprint', async (importOriginal) => {
  const { buildBlueprintTree: build } = await import('@scout/shared')
  return {
    ...(await importOriginal<typeof import('@/lib/blueprint')>()),
    useBlueprint: () => {
      const blueprint = mocks.state.blueprint as Blueprint | null
      return { blueprint, root: blueprint ? build(blueprint.files.map((file) => file.path)) : null, groupTrees: {}, groupsLoading: false, groupsError: null, loading: false, error: null, reload: () => {} }
    },
    useBlueprintLayout: () => ({ layout: mocks.state.layout as BlueprintLayout | null, loading: false, save: () => Promise.resolve() }),
  }
})

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
  WorkerPoolContextProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

// The pan and zoom library measures real layout; here it only has to render its content and report that it is ready.
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: forwardRef(function Wrapper({ children, onInit }: { children: ReactNode; onInit?: () => void }, ref) {
    useImperativeHandle(ref, () => ({ zoomIn: () => Promise.resolve(), zoomOut: () => Promise.resolve(), setTransform: () => Promise.resolve() }))
    useEffect(() => onInit?.(), [onInit])
    return <div>{children}</div>
  }),
  TransformComponent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const PATHS = [...Array.from({ length: 8 }, (_, i) => `a/A${i}.ts`), ...Array.from({ length: 8 }, (_, i) => `b/B${i}.ts`)]
const TREE = PATHS.map((path) => makeTreeFile({ path, additions: 5, deletions: 2 }))
const detail = { ...sessionDetailFixture, tree: { ...sessionDetailFixture.tree, files: TREE } }

function approved(path: string): FileReview {
  return { verdict: 'approved', fingerprint: TREE.find((file) => file.path === path)?.fingerprint ?? fp(path), viewed: true }
}
function rejected(path: string): FileReview {
  return { ...approved(path), verdict: 'rejected' }
}

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{`${pathname}${search}`}</output>
}
function where(): URL {
  return new URL(screen.getByTestId('where').textContent ?? '', 'http://scout.test')
}

const dispatched: ReviewAction[] = []
const setVerdict = vi.fn<ReviewContextValue['setVerdict']>(() => false)
function open(search = '', entries: Record<string, FileReview> = {}) {
  dispatched.length = 0
  renderShell(`/s/${SESSION_ID}/blueprint${search}`, {
    detail,
    dispatch: (action) => dispatched.push(action as ReviewAction),
    setVerdict,
    fileReview: (path) => entries[path] ?? null,
    page: (
      <JournalContext.Provider value={{ journal: makeJournal([]), loading: false, error: null, reload: () => {} }}>
        <BlueprintPage />
        <Where />
      </JournalContext.Provider>
    ),
  })
}

const box = (path: string) => screen.getByRole('group', { name: new RegExp(`^File ${path.replace('.', '\\.')}`) })
const pickBox = (name: RegExp | string) => screen.getByRole('checkbox', { name })

beforeEach(() => {
  setVerdict.mockClear()
  // The review card of the preview fetches its patch.
  mockReviewApi(reviewResponseFixture())
  window.sessionStorage.clear()
  mocks.state.blueprint = { fingerprint: fp('blueprint'), files: PATHS.map((path): BlueprintFile => ({ path, kind: 'module', analyzed: true, members: [], imports: [], extends: [] })) } satisfies Blueprint
  mocks.state.layout = null
})

const openCard = (path: string) => fireEvent.click(within(box(path)).getByRole('button', { name: new RegExp(`${path.split('/').pop()?.replace('.', '\\.')}`) }))

describe('cards over the diagram', () => {
  it('opens on a file header click with the diagram\'s files, on that file, and puts it in the URL', () => {
    open('?at=pkg:a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openCard('a/A3.ts')
    const dialog = screen.getByRole('dialog', { name: 'a' })
    expect(within(dialog).getByRole('article', { name: 'a/A3.ts' })).toBeInTheDocument()
    expect(within(dialog).getByText('4 / 8')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="deck-peek"]')).toBeNull()
    expect(within(dialog).getByRole('button', { name: /Approve/ })).toBeInTheDocument()
    expect(where().pathname).toBe(`/s/${SESSION_ID}/blueprint`)
    expect(where().searchParams.get('file')).toBe('a/A3.ts')
    expect(where().searchParams.get('at')).toBe('pkg:a')
    expect(where().searchParams.get('sel')).toBeNull()
  })

  it('moves with the arrows and the arrow keys, keeping ?file= in step', () => {
    open('?at=pkg:a')
    openCard('a/A3.ts')
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }))
    expect(where().searchParams.get('file')).toBe('a/A4.ts')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(where().searchParams.get('file')).toBe('a/A2.ts')
    expect(screen.getByRole('article', { name: 'a/A2.ts' })).toBeInTheDocument()
  })

  it('approves through the review action and stays open', () => {
    open('?at=pkg:a')
    openCard('a/A3.ts')
    fireEvent.keyDown(window, { key: 'a' })
    expect(setVerdict).toHaveBeenCalledWith('a/A3.ts', 'approved', TREE.find((file) => file.path === 'a/A3.ts')?.fingerprint)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not take the keys while a comment is being typed', () => {
    open('?at=pkg:a')
    openCard('a/A3.ts')
    const field = document.createElement('textarea')
    document.body.append(field)
    fireEvent.keyDown(field, { key: 'a' })
    field.remove()
    expect(setVerdict).not.toHaveBeenCalled()
  })

  it('closes on Esc, on the scrim and on the corner button, and clears the URL each time', async () => {
    open('?at=pkg:a')
    openCard('a/A0.ts')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where().searchParams.get('file')).toBeNull()
    expect(where().searchParams.get('at')).toBe('pkg:a')

    openCard('a/A1.ts')
    const scrim = document.querySelector('[data-slot="blueprint-deck-scrim"]')
    expect(scrim).toHaveClass('bg-black/75')
    fireEvent.click(scrim as Element)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where().searchParams.get('file')).toBeNull()

    openCard('a/A2.ts')
    await userEvent.click(screen.getByRole('button', { name: 'Close cards' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where().searchParams.get('file')).toBeNull()
  })

  it('opens when the page loads with ?file=, and drops a file the diagram does not have', () => {
    open('?at=pkg:a&file=a/A5.ts')
    expect(screen.getByRole('article', { name: 'a/A5.ts' })).toBeInTheDocument()
    cleanup()
    open('?at=pkg:a&file=b/B1.ts')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where().searchParams.get('file')).toBeNull()
    expect(where().searchParams.get('at')).toBe('pkg:a')
  })

  it('keeps the canvas keys quiet while open: S does nothing, and Esc closes the cards instead of going up a level', () => {
    open('?at=pkg:a')
    openCard('a/A0.ts')
    fireEvent.keyDown(window, { key: 's' })
    // The page behind a modal dialog is hidden from the accessibility tree.
    expect(screen.getByRole('button', { name: 'Select', hidden: true })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(where().searchParams.get('at')).toBe('pkg:a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does nothing special for Ctrl or Cmd + click, or the macOS Ctrl right-click', () => {
    open('?at=pkg:a')
    fireEvent.click(box('a/A0.ts'), { ctrlKey: true })
    fireEvent.click(box('a/A1.ts'), { metaKey: true })
    expect(fireEvent.contextMenu(box('a/A0.ts'), { ctrlKey: true })).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no cards for a package box', () => {
    open()
    fireEvent.click(screen.getByRole('group', { name: 'Package a' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('select mode', () => {
  it('toggles with the button and the S key, and Esc leaves it before going up a level', async () => {
    open('?at=pkg:a')
    const toggle = screen.getByRole('button', { name: 'Select' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('toolbar', { name: 'Selected files' })).not.toBeInTheDocument()
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('toolbar', { name: 'Selected files' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 's' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(document.body, { key: 'S' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(where().searchParams.get('at')).toBe('pkg:a')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(where().searchParams.get('at')).toBeNull()
  })

  it('picks on a click in select mode instead of opening the cards', () => {
    open('?at=pkg:a')
    fireEvent.keyDown(document.body, { key: 's' })
    fireEvent.click(pickBox(/^File a\/A0\.ts/))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(pickBox(/^File a\/A0\.ts/)).toHaveAttribute('aria-checked', 'true')
    expect(where().searchParams.get('file')).toBeNull()
  })

  it('enters select mode with the box picked on Shift + click', () => {
    open('?at=pkg:a')
    fireEvent.click(box('a/A3.ts'), { shiftKey: true })
    expect(pickBox(/^File a\/A3\.ts/)).toHaveAttribute('aria-checked', 'true')
    expect(pickBox(/^File a\/A4\.ts/)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('picks a file with a click and Space, makes the other boxes look pickable, and leaves its buttons inert', async () => {
    open('?at=pkg:a')
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    const first = pickBox(/^File a\/A0\.ts/)
    expect(first).toHaveAttribute('aria-checked', 'false')
    expect(first).toHaveClass('opacity-55', 'cursor-pointer')
    expect(first.querySelector('[data-slot="blueprint-pick"]')).toHaveAttribute('data-state', 'none')
    await userEvent.click(within(first).getByRole('button', { name: /A0\.ts/ }))
    expect(where().pathname).toBe(`/s/${SESSION_ID}/blueprint`)
    expect(first).toHaveAttribute('aria-checked', 'true')
    expect(first).toHaveClass('outline-selected')
    expect(first).not.toHaveClass('opacity-55')
    expect(first.querySelector('[data-slot="blueprint-pick"]')).toHaveAttribute('data-state', 'all')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    first.focus()
    await userEvent.keyboard(' ')
    expect(first).toHaveAttribute('aria-checked', 'false')
    await userEvent.keyboard('{Enter}')
    expect(first).toHaveAttribute('aria-checked', 'true')
  })

  it('picks every file of a package box, shows a partly picked one as mixed, and keeps picks across diagrams', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    await userEvent.click(pickBox('Package a'))
    expect(pickBox('Package a')).toHaveAttribute('aria-checked', 'true')
    expect(pickBox('Package b')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('8 selected')).toBeInTheDocument()
    await userEvent.click(pickBox('Package a'))
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()

    // One file of b picked inside its diagram: back on the whole change the package is mixed.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Packages' })).getByRole('button', { name: /^b\s*8$/ }))
    await userEvent.click(pickBox(/^File b\/B1\.ts/))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Diagram path' })).getByRole('button', { name: 'Whole change' }))
    expect(pickBox('Package b')).toHaveAttribute('aria-checked', 'mixed')
    expect(pickBox('Package b').querySelector('[data-slot="blueprint-pick"]')).toHaveAttribute('data-state', 'some')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(pickBox('Package b'))
    expect(screen.getByText('8 selected')).toBeInTheDocument()
    expect(pickBox('Package b')).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
  })

  it('does not drag a box in select mode, while it still drags outside it', () => {
    open('?at=pkg:a')
    const drag = (element: HTMLElement) => {
      fireEvent.pointerDown(element, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 110, clientY: 90 })
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 110, clientY: 90 })
    }
    const before = box('a/A0.ts').style.left
    drag(box('a/A0.ts'))
    expect(box('a/A0.ts').style.left).not.toBe(before)

    fireEvent.keyDown(document.body, { key: 's' })
    const picked = pickBox(/^File a\/A1\.ts/)
    const left = picked.style.left
    const top = picked.style.top
    drag(picked)
    expect(pickBox(/^File a\/A1\.ts/).style.left).toBe(left)
    expect(pickBox(/^File a\/A1\.ts/).style.top).toBe(top)
    expect(picked).not.toHaveAttribute('data-dragging')
  })
})

describe('selection bar', () => {
  it('shows only in select mode, with View all, Approve all and Deselect all off at zero', async () => {
    open('?at=pkg:a')
    expect(screen.queryByRole('toolbar', { name: 'Selected files' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    const bar = within(screen.getByRole('toolbar', { name: 'Selected files' }))
    expect(bar.getByText('Nothing selected')).toBeInTheDocument()
    for (const name of ['View all', 'Approve all', 'Deselect all']) expect(bar.getByRole('button', { name })).toBeDisabled()
    for (const name of ['Select all', 'Done']) expect(bar.getByRole('button', { name })).toBeEnabled()
    await userEvent.click(pickBox(/^File a\/A0\.ts/))
    expect(bar.getByText('1 selected')).toBeInTheDocument()
    for (const name of ['View all', 'Approve all', 'Deselect all']) expect(bar.getByRole('button', { name })).toBeEnabled()
  })

  it('selects every file of the diagram on screen on top of what is picked, deselects, and Done leaves', async () => {
    open('?at=pkg:a')
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    const bar = within(screen.getByRole('toolbar', { name: 'Selected files' }))
    await userEvent.click(bar.getByRole('button', { name: 'Select all' }))
    expect(bar.getByText('8 selected')).toBeInTheDocument()
    await userEvent.click(bar.getByRole('button', { name: 'Deselect all' }))
    expect(bar.getByText('Nothing selected')).toBeInTheDocument()
    await userEvent.click(bar.getByRole('button', { name: 'Select all' }))
    await userEvent.click(bar.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('toolbar', { name: 'Selected files' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^File a\/A\d\.ts$/ })).toHaveLength(8)
  })

  it('counts files, not boxes, and adds Select all to the picks of other diagrams', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    await userEvent.click(pickBox('Package a'))
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'Selected files' })).getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('16 selected')).toBeInTheDocument()
  })

  it('approves every picked file that is not approved yet, then offers an Undo that restores each previous verdict', async () => {
    open('?at=pkg:a', { 'a/A0.ts': approved('a/A0.ts'), 'a/A1.ts': rejected('a/A1.ts') })
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    const bar = within(screen.getByRole('toolbar', { name: 'Selected files' }))
    await userEvent.click(bar.getByRole('button', { name: 'Select all' }))
    await userEvent.click(bar.getByRole('button', { name: 'Approve all' }))

    const verdicts = dispatched.filter((action) => action.type === 'SET_VERDICT')
    expect(verdicts.map((action) => (action.type === 'SET_VERDICT' ? action.path : ''))).toEqual(PATHS.filter((path) => path.startsWith('a/') && path !== 'a/A0.ts'))
    expect(verdicts.every((action) => action.type === 'SET_VERDICT' && action.verdict === 'approved' && action.fingerprint !== null)).toBe(true)
    expect(screen.getByRole('toolbar', { name: 'Selected files' })).toHaveTextContent('Approved 7 files')
    expect(screen.getByRole('button', { name: 'Approve all' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    const load = dispatched.find((action) => action.type === 'LOAD')
    // The approved file was left alone; the rejected one is put back, the ones that had nothing lose the new entry.
    expect(load?.type === 'LOAD' ? load.review.files : null).toEqual({ 'a/A1.ts': rejected('a/A1.ts') })
    expect(screen.getByRole('toolbar', { name: 'Selected files' })).toHaveTextContent('Nothing selected')
  })

  it('puts a rejected file back as rejected on Undo', async () => {
    open('?at=pkg:a', { 'a/A1.ts': rejected('a/A1.ts') })
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    await userEvent.click(pickBox(/^File a\/A1\.ts/))
    await userEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    expect(screen.getByRole('toolbar', { name: 'Selected files' })).toHaveTextContent('Approved 1 file')
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    const load = dispatched.find((action) => action.type === 'LOAD')
    expect(load?.type === 'LOAD' ? load.review.files['a/A1.ts'] : null).toEqual(rejected('a/A1.ts'))
  })

  it('drops the "Approved" line after about four seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      open('?at=pkg:a')
      await userEvent.click(screen.getByRole('button', { name: 'Select' }))
      await userEvent.click(pickBox(/^File a\/A0\.ts/))
      await userEvent.click(screen.getByRole('button', { name: 'Approve all' }))
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(4100)
      })
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
      expect(screen.getByText('Nothing selected')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens the cards on exactly the picked files in the diagram order, keeping at and saving the list under sel', async () => {
    open('?at=pkg:a')
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    await userEvent.click(pickBox(/^File a\/A5\.ts/))
    await userEvent.click(pickBox(/^File a\/A2\.ts/))
    await userEvent.click(screen.getByRole('button', { name: 'View all' }))
    const url = where()
    expect(url.pathname).toBe(`/s/${SESSION_ID}/blueprint`)
    expect(url.searchParams.get('at')).toBe('pkg:a')
    expect(url.searchParams.get('file')).toBe('a/A2.ts')
    const key = url.searchParams.get('sel')
    expect(key).toMatch(/^[a-z0-9]+$/)
    expect(loadBlueprintSelection(SESSION_ID, key ?? '')).toEqual(['a/A2.ts', 'a/A5.ts'])
    const dialog = screen.getByRole('dialog', { name: '2 selected files' })
    expect(within(dialog).getByText('1 / 2')).toBeInTheDocument()
    // Picked files show as a stack; a card opened from its box does not (checked above).
    expect(document.querySelectorAll('[data-slot="deck-peek"]').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }))
    expect(where().searchParams.get('file')).toBe('a/A5.ts')
    expect(where().searchParams.get('sel')).toBe(key)
    expect(screen.getByRole('button', { name: 'Next file' })).toBeDisabled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    // Closing leaves the diagram as it was, picks and select mode included.
    expect(screen.getByRole('toolbar', { name: 'Selected files' })).toHaveTextContent('2 selected')
    expect(where().searchParams.get('sel')).toBeNull()
  })
})
