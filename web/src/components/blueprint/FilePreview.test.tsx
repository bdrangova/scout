import { emptyReview, type FileReview, type TreeFile } from '@scout/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewStateContext, useReview, type ReviewContextValue } from '@/state/review-context'
import { makeTreeFile } from '@/test/fixtures'
import { FilePreview } from './FilePreview'

// The card itself is tested with the Files page; here it only has to act on the review state like the real one.
vi.mock('@/components/diff/FileReviewCard', () => ({
  FileReviewCard: ({ file }: { file: TreeFile }) => {
    const { dispatch } = useReview()
    return (
      <article aria-label={file.path}>
        <button type="button" onClick={() => dispatch({ type: 'SET_VERDICT', path: file.path, verdict: 'approved', fingerprint: file.fingerprint })}>
          Approve
        </button>
      </article>
    )
  },
}))

const FILE = makeTreeFile({ path: 'a/A.ts' })

/** A review state that really keeps the verdict a card sets. */
function Review({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<FileReview | null>(null)
  const value: ReviewContextValue = {
    state: { review: emptyReview('s', '2026-11-13T10:00:00.000Z'), pendingReject: null, atEnd: false },
    items: [FILE],
    itemKind: 'file',
    dispatch: (action) => {
      if (action.type === 'SET_VERDICT') setEntry({ verdict: 'approved', fingerprint: action.fingerprint, viewed: true })
    },
    comments: [],
    commentsFor: () => [],
    fileReview: () => entry,
    draftFor: () => '',
    setDraft: () => {},
    unsavedDrafts: [],
    setVerdict: () => false,
    progress: { reviewed: 0, total: 1 },
    resolutions: null,
    saveStatus: 'idle',
    flushSave: () => Promise.resolve(true),
    reload: () => {},
  }
  return <ReviewStateContext.Provider value={value}>{children}</ReviewStateContext.Provider>
}

function Harness() {
  const [file, setFile] = useState<TreeFile | null>(FILE)
  return (
    <Review>
      <FilePreview file={file} sessionId="s" boxKey={null} onClose={() => setFile(null)} />
    </Review>
  )
}

describe('FilePreview', () => {
  it('closes once the card approves the file', async () => {
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'a/A.ts' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed for no file', () => {
    render(
      <Review>
        <FilePreview file={null} sessionId="s" boxKey={null} onClose={() => {}} />
      </Review>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
