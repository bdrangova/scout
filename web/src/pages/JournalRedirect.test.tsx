import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SESSION_ID } from '@/test/fixtures'
import { JournalRedirect } from './JournalRedirect'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

describe('JournalRedirect', () => {
  it('sends the old journal route to the journal view of Extras', () => {
    render(
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}/journal`]}>
        <Routes>
          <Route path="/s/:id/journal" element={<JournalRedirect />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('where')).toHaveTextContent(`/s/${SESSION_ID}/extras?tab=journal`)
  })
})
