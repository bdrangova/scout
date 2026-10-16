import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilePatchOptions, FilePatchState } from '@/lib/hooks'
import { collapseReason, omitReason } from '@/lib/file-status'
import { fp, makeTreeFile } from '@/test/fixtures'
import { LargeFileGate } from './LargeFileGate'

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
}))

const useFilePatchMock = vi.hoisted(() =>
  vi.fn(
    (_sessionId: string, _path: string, options: FilePatchOptions = {}): FilePatchState => ({
      patch: options.enabled === false ? null : 'diff --git a/package-lock.json b/package-lock.json',
      isLarge: false,
      isOmitted: false,
      loading: false,
      error: null,
      reload: () => {},
    }),
  ),
)

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useFilePatch: useFilePatchMock,
}))

describe('LargeFileGate', () => {
  it('shows "Show diff anyway" for a collapsed file and refetches with force when clicked', async () => {
    const file = makeTreeFile({
      path: 'package-lock.json',
      additions: 2400,
      deletions: 1800,
      collapsed: true,
      collapseReason: 'generated-or-vendored',
      sizeAfter: 900_000,
    })
    render(<LargeFileGate file={file} sessionId="sid" diffStyle="unified" />)

    expect(screen.getByText('Collapsed by default')).toBeInTheDocument()
    expect(screen.getByText(/4,200 changed lines · 879 KB · generated or vendored file/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve without viewing' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('patch-diff')).not.toBeInTheDocument()
    expect(useFilePatchMock).toHaveBeenLastCalledWith('sid', 'package-lock.json', { force: false, enabled: false, fingerprint: file.fingerprint, scope: null })

    await userEvent.click(screen.getByRole('button', { name: 'Show diff anyway' }))

    expect(useFilePatchMock).toHaveBeenLastCalledWith('sid', 'package-lock.json', { force: true, enabled: true, fingerprint: file.fingerprint, scope: null })
    expect(screen.getByTestId('patch-diff')).toHaveTextContent('package-lock.json')
  })

  it('shows the omission reason for omitted files, with approve but no "show anyway"', async () => {
    const onApprove = vi.fn()
    const file = makeTreeFile({ path: 'huge.bin', status: 'added', additions: 0, deletions: 0, omitted: true, omitReason: 'too-large', collapsed: true, collapseReason: 'omitted' })
    render(<LargeFileGate file={file} sessionId="sid" diffStyle="unified" onApprove={onApprove} />)
    expect(screen.getByText('Diff omitted')).toBeInTheDocument()
    expect(screen.getByText(/0 changed lines · larger than 5.0 MB on one side/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show diff anyway' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve without viewing' }))
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('treats a 410 from the patch route like an omitted file', () => {
    useFilePatchMock.mockReturnValueOnce({ patch: null, isLarge: false, isOmitted: true, loading: false, error: null, reload: () => {} })
    render(<LargeFileGate file={makeTreeFile({ path: 'src/a.tsx' })} sessionId="sid" diffStyle="unified" />)
    expect(screen.getByText('Diff omitted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show diff anyway' })).not.toBeInTheDocument()
  })

  it('puts the server reason codes into words', () => {
    expect(collapseReason({ collapseReason: 'too-many-changed-lines' })).toBe('more than 1,500 changed lines')
    expect(collapseReason({ collapseReason: 'too-large' })).toBe('larger than 512 KB')
    expect(collapseReason({ collapseReason: 'generated-or-vendored' })).toBe('generated or vendored file')
    expect(collapseReason({ collapseReason: 'omitted' })).toBe('omitted from the diff')
    expect(collapseReason({ collapseReason: null })).toBe('large file')
    expect(omitReason({ omitReason: 'too-large' })).toMatch(/^larger than 5.0 MB/)
  })

  it('shows before/after images for binary image files via the contents route, cache-busted by the fingerprint', () => {
    const file = makeTreeFile({ path: 'assets/logo.png', binary: true, additions: 0, deletions: 0, sizeBefore: 1024, sizeAfter: 2048, fingerprint: fp('logo') })
    render(<LargeFileGate file={file} sessionId="sid" diffStyle="unified" />)
    expect(screen.getByText('Binary file')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'assets/logo.png (before)' })).toHaveAttribute(
      'src',
      `/api/sessions/sid/files/assets/logo.png/contents?side=before&v=${file.fingerprint}`,
    )
    expect(screen.getByRole('img', { name: 'assets/logo.png (after)' })).toHaveAttribute(
      'src',
      `/api/sessions/sid/files/assets/logo.png/contents?side=after&v=${file.fingerprint}`,
    )
  })

  it('shows only the "after" image for an added binary file', () => {
    const file = makeTreeFile({ path: 'assets/new.png', status: 'added', binary: true, additions: 0, deletions: 0, sizeBefore: null, sizeAfter: 2048 })
    render(<LargeFileGate file={file} sessionId="sid" diffStyle="unified" />)
    expect(screen.queryByRole('img', { name: 'assets/new.png (before)' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'assets/new.png (after)' })).toBeInTheDocument()
  })
})
