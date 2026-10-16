/** Display formatting helpers: numbers, diff stats, byte sizes, mm:ss durations and relative times. */

const numberFormat = new Intl.NumberFormat('en-US')

/** U+2212 minus sign, as in the mock (`−245`). */
export const MINUS = '−'

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

export function formatAdditions(additions: number): string {
  return `+${formatNumber(additions)}`
}

export function formatDeletions(deletions: number): string {
  return `${MINUS}${formatNumber(deletions)}`
}

/** `+3,658 −245` */
export function formatStats(additions: number, deletions: number): string {
  return `${formatAdditions(additions)} ${formatDeletions(deletions)}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}

export function formatFileCount(files: number): string {
  return pluralize(files, 'file')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** `mm:ss` (minutes are not capped at 59, so 1h05m30s is `65:30`). */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The mock's wording: `just now`, `5 min ago`, `18:53 today`, `Yesterday`, `2 days ago`,
 * `Last week`, `3 weeks ago`, then a short date.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const time = new Date(iso)
  if (Number.isNaN(time.getTime())) return ''
  const elapsedMs = now.getTime() - time.getTime()
  if (elapsedMs < 60_000) return 'just now'
  if (elapsedMs < 60 * 60_000) return `${Math.floor(elapsedMs / 60_000)} min ago`
  const dayDiff = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS)
  if (dayDiff <= 0) return `${pad(time.getHours())}:${pad(time.getMinutes())} today`
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return `${dayDiff} days ago`
  if (dayDiff < 14) return 'Last week'
  if (dayDiff < 35) return `${Math.floor(dayDiff / 7)} weeks ago`
  const month = MONTHS[time.getMonth()] ?? ''
  const sameYear = time.getFullYear() === now.getFullYear()
  return `${time.getDate()} ${month}${sameYear ? '' : ` ${time.getFullYear()}`}`
}
