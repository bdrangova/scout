import type { ReactNode } from 'react'

/** A rail group's title with an optional count badge and a trailing slot. */
export function RailHead({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="m-0 text-[13px] font-extrabold">{title}</h2>
      {count !== undefined && <span className="rounded-full border-fine border-line px-1.5 text-[11.5px] font-bold tabular-nums">{count}</span>}
      <span className="ml-auto flex items-center">{children}</span>
    </div>
  )
}
