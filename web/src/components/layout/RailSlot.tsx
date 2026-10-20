import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type SlotState = [slot: HTMLElement | null, setSlot: (element: HTMLElement | null) => void]

const RailSlotContext = createContext<SlotState | null>(null)

/** Holds the rail's section-block element so a page can render into it (see `RailSection`). */
export function RailSlotProvider({ children }: { children: ReactNode }) {
  const state = useState<HTMLElement | null>(null)
  return <RailSlotContext.Provider value={state}>{children}</RailSlotContext.Provider>
}

/** Where the rail's per-page block goes: the rest of the rail under the identity and the review block. */
export function RailSlotOutlet() {
  const state = useContext(RailSlotContext)
  if (!state) throw new Error('RailSlotOutlet needs a RailSlotProvider')
  const [, setSlot] = state
  return <div ref={setSlot} data-slot="rail-section-slot" className="flex min-h-0 flex-1 flex-col" />
}

/**
 * The block under the rail's identity and review state, rendered by the page that owns it (so it
 * shares the page's state): `<RailSection><FileTree … /></RailSection>`. It renders nothing while
 * the rail is closed (or when the page is not inside a session shell), and unmounts with the page.
 */
export function RailSection({ children }: { children: ReactNode }) {
  const slot = useContext(RailSlotContext)?.[0] ?? null
  return slot ? createPortal(children, slot) : null
}
