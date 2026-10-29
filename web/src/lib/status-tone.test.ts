import { describe, expect, it } from 'vitest'
import { STATUS_TONE } from './status-tone'

describe('STATUS_TONE', () => {
  it('names the session states', () => {
    expect(STATUS_TONE.session('approved')).toMatchObject({ tone: 'ok', label: 'Approved', pulse: false })
    expect(STATUS_TONE.session('ready')).toMatchObject({ tone: 'ok', label: 'Ready to submit', pulse: false })
    expect(STATUS_TONE.session('updated').label).toBe('Updated since sent')
  })

  it('gives each lifecycle state its own label, hue and icon; plain "Sent" is gone', () => {
    const statuses = ['unreviewed', 'in-progress', 'ready', 'sent', 'updated', 'approved'] as const
    const specs = statuses.map((status) => STATUS_TONE.session(status))
    expect(new Set(specs.map((spec) => spec.label)).size).toBe(6)
    expect(new Set(specs.map((spec) => spec.icon)).size).toBe(6)
    expect(new Set(specs.map((spec) => spec.hue)).size).toBe(6)
    expect(STATUS_TONE.session('sent').label).toBe('Changes sent')
    expect(specs.map((spec) => spec.label)).not.toContain('Sent')
  })

  it('keeps file and verdict tones consistent with the design palette', () => {
    expect(STATUS_TONE.file('added').tone).toBe('ok')
    expect(STATUS_TONE.file('deleted').tone).toBe('err')
    expect(STATUS_TONE.file('renamed').tone).toBe('info')
    expect(STATUS_TONE.verdict('rejected').tone).toBe('err')
    expect(STATUS_TONE.file('modified').tone).toBe('warn')
  })
})
