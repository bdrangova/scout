/** The base chip's tooltip: what the diff is taken against. */
export function baseTooltip(baseSha: string | undefined, baseVirtual = false): string {
  if (!baseSha) return 'Base branch'
  if (baseVirtual) {
    return 'Base branch. The ref and HEAD have several merge bases, so the diff is against the virtual merge base git would use for a merge'
  }
  return `Base branch. The diff is against the merge-base ${baseSha.slice(0, 7)} of this ref and HEAD`
}
