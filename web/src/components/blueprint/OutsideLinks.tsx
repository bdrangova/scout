import type { BlueprintBox } from '@scout/shared'

/** Muted lines for the links to changed files that are not in this diagram. */
export function OutsideLinks({ box }: { box: BlueprintBox }) {
  const lines: string[] = []
  if (box.extendedByOutside > 0) lines.push(`▲ ${box.extendedByOutside} extend this from elsewhere`)
  if (box.usedByOutside > 0) lines.push(`← ${box.usedByOutside} use this from elsewhere`)
  if (box.usesOutside > 0) lines.push(`→ leans on ${box.usesOutside} elsewhere`)
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5 px-3 pt-1 pb-2 text-[11px] text-ink-muted" data-slot="blueprint-outside">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  )
}
