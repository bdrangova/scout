import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatRelativeTime, formatStats, pluralize } from './format'

describe('format', () => {
  it('renders diff stats with a thousands separator and a real minus sign', () => {
    expect(formatStats(3658, 245)).toBe('+3,658 −245')
    expect(formatStats(0, 0)).toBe('+0 −0')
  })

  it('pluralizes', () => {
    expect(pluralize(1, 'file')).toBe('1 file')
    expect(pluralize(12, 'file')).toBe('12 files')
    expect(pluralize(2, 'open comment')).toBe('2 open comments')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(900_000)).toBe('879 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formats mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(42.7)).toBe('0:42')
    expect(formatDuration(3930)).toBe('65:30')
  })

  it('uses the mock wording for relative times', () => {
    const now = new Date(2026, 8, 26, 20, 0, 0)
    expect(formatRelativeTime(new Date(2026, 8, 26, 19, 59, 30).toISOString(), now)).toBe('just now')
    expect(formatRelativeTime(new Date(2026, 8, 26, 19, 40, 0).toISOString(), now)).toBe('20 min ago')
    expect(formatRelativeTime(new Date(2026, 8, 26, 18, 53, 0).toISOString(), now)).toBe('18:53 today')
    expect(formatRelativeTime(new Date(2026, 8, 25, 23, 0, 0).toISOString(), now)).toBe('Yesterday')
    expect(formatRelativeTime(new Date(2026, 8, 24, 9, 0, 0).toISOString(), now)).toBe('2 days ago')
    expect(formatRelativeTime(new Date(2026, 8, 17, 9, 0, 0).toISOString(), now)).toBe('Last week')
    expect(formatRelativeTime(new Date(2026, 8, 5, 9, 0, 0).toISOString(), now)).toBe('3 weeks ago')
    expect(formatRelativeTime(new Date(2026, 5, 5, 9, 0, 0).toISOString(), now)).toBe('5 Jun')
    expect(formatRelativeTime(new Date(2025, 5, 5, 9, 0, 0).toISOString(), now)).toBe('5 Jun 2025')
    expect(formatRelativeTime('not a date', now)).toBe('')
  })
})
