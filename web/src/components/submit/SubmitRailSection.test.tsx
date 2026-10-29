import { mergeComments } from '@scout/shared'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UnsavedDraft } from '@/lib/comment-drafts'
import { commentFixture, reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'
import { SubmitRailSection } from './SubmitRailSection'

const FILE = sessionDetailFixture.tree.files[0]?.path ?? ''
const review = reviewFixture({
  comments: [
    commentFixture('c1', { kind: 'file', ref: FILE }, 'first'),
    commentFixture('c2', { kind: 'file', ref: FILE, anchor: { side: 'new', line: 2 } }, 'second'),
    commentFixture('c3', { kind: 'spec', ref: 'plan.md' }, 'spec'),
  ],
})

function renderRail(unsavedDrafts: UnsavedDraft[] = []) {
  const page = (
    <SubmitRailSection
      comments={mergeComments(review, null)}
      review={review}
      detail={sessionDetailFixture}
    />
  )
  renderShell(`/s/${SESSION_ID}/submit`, { review, page, unsavedDrafts })
  return within(screen.getByRole('complementary', { name: 'Session panel' }))
}

describe('SubmitRailSection', () => {
  it('warns about comments typed but not added, with a link to each file, and nothing otherwise', () => {
    const rail = renderRail([{ kind: 'file', ref: FILE }, { kind: 'spec', ref: 'plan.md' }])
    const notice = rail.getByTestId('unsaved-drafts')
    expect(notice).toHaveTextContent('2 comments typed but not added')
    expect(within(notice).getAllByRole('link')[0]).toHaveAttribute('href', `/s/${SESSION_ID}/files/${FILE}`)
  })

  it('shows no warning when nothing is typed', () => {
    expect(renderRail().queryByTestId('unsaved-drafts')).not.toBeInTheDocument()
  })

  it('summarises what will be sent and links the files that carry comments', () => {
    const rail = renderRail()
    const summary = rail.getByRole('region', { name: 'Will be sent' })
    expect(within(summary).getByText('2 comments · 1 file')).toBeInTheDocument()
    expect(within(summary).getByText('1 of them')).toBeInTheDocument()
    const link = within(summary).getByRole('link', { name: new RegExp(FILE.split('/').pop() ?? '') })
    expect(link).toHaveAttribute('href', expect.stringContaining('/files/'))
  })

  it('says so when nothing is open', () => {
    const empty = reviewFixture()
    renderShell(`/s/${SESSION_ID}/submit`, {
      review: empty,
      page: <SubmitRailSection comments={[]} review={empty} detail={sessionDetailFixture} />,
    })
    expect(screen.getByText(/No open comments/)).toBeInTheDocument()
  })
})
