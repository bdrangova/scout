import type { SessionDetail } from '@scout/shared'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { RailSlotOutlet, RailSlotProvider } from '@/components/layout/RailSlot'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { SESSION_ID } from '@/test/fixtures'

/** A page beside the rail's section slot (no bar, no identity), with the live review provider; for the rail block tests. */
export function renderWithRailSlot(detail: SessionDetail, page: ReactNode) {
  return render(
    <MemoryRouter>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
        <ReviewProvider>
          <RailSlotProvider>
            <aside>
              <RailSlotOutlet />
            </aside>
            {page}
          </RailSlotProvider>
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}
