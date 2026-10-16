/** The subject is cut to about this many characters under a node (the tooltip has it in full). */
export const SUBJECT_CHARS = 24

export function truncateSubject(subject: string, max = SUBJECT_CHARS): string {
  return subject.length <= max ? subject : `${subject.slice(0, max - 1).trimEnd()}…`
}

const absoluteDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

/** `18 Oct 2026, 10:23` (an invalid date comes back as the raw string). */
export function formatAbsoluteDate(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? iso : absoluteDate.format(time)
}
