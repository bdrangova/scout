import type { ReactNode } from 'react'

/** The one-line empty state of the Evidence, Spec and Extras pages. */
export function EmptySection({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">{children}</p>
    </main>
  )
}
