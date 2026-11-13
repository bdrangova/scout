import { BLUEPRINT_MAX_MEMBERS, parsePatchLines } from '@scout/shared'
import type { BlueprintMember } from '@scout/shared'
import type { Declaration } from './parse.ts'

/** Changed lines of a file's patch: added lines by their new number, deleted lines by their old number. */
export interface ChangedLines {
  added: number[]
  deleted: number[]
}

export function changedLinesOf(patch: string | undefined): ChangedLines {
  const out: ChangedLines = { added: [], deleted: [] }
  if (patch === undefined) return out
  for (const row of parsePatchLines(patch)) {
    if (row.kind === 'add' && row.new !== null) out.added.push(row.new)
    else if (row.kind === 'del' && row.old !== null) out.deleted.push(row.old)
  }
  return out
}

const within = (lines: readonly number[], start: number, end: number): boolean => lines.some((line) => line >= start && line <= end)

/** True when a line of `lines` is inside the class but in none of its members. */
function outsideMembers(lines: readonly number[], cls: Declaration, all: readonly Declaration[]): boolean {
  const members = all.filter((d) => d.parent === cls.key)
  return lines.some((line) => line >= cls.start && line <= cls.end && !members.some((m) => line >= m.start && line <= m.end))
}

function isChanged(next: Declaration, base: Declaration, nextAll: readonly Declaration[], baseAll: readonly Declaration[], changed: ChangedLines): boolean {
  if (next.isClass) return outsideMembers(changed.added, next, nextAll) || outsideMembers(changed.deleted, base, baseAll)
  return within(changed.added, next.start, next.end) || within(changed.deleted, base.start, base.end)
}

/**
 * What the diff did to a file's declarations. A declaration only on the new side is added, only on
 * the base side removed, on both and touched by an added or deleted line changed (a class only when
 * a changed line falls outside its members). In declaration order, removed ones at their old line; at most `BLUEPRINT_MAX_MEMBERS`.
 */
export function diffMembers(next: readonly Declaration[], base: readonly Declaration[], changed: ChangedLines): BlueprintMember[] {
  const baseByKey = new Map(base.map((d) => [d.key, d]))
  const nextKeys = new Set(next.map((d) => d.key))
  const rows: { line: number; member: BlueprintMember }[] = []
  for (const decl of next) {
    const before = baseByKey.get(decl.key)
    if (before === undefined) rows.push({ line: decl.start, member: { name: decl.name, change: 'added', side: 'new', line: decl.start } })
    else if (isChanged(decl, before, next, base, changed)) rows.push({ line: decl.start, member: { name: decl.name, change: 'changed', side: 'new', line: decl.start } })
  }
  for (const decl of base) {
    if (!nextKeys.has(decl.key)) rows.push({ line: decl.start, member: { name: decl.name, change: 'removed', side: 'old', line: decl.start } })
  }
  // Array.prototype.sort is stable: equal lines keep new-side entries first.
  rows.sort((a, b) => a.line - b.line)
  return rows.slice(0, BLUEPRINT_MAX_MEMBERS).map((row) => row.member)
}
