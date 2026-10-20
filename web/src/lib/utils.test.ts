import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps border-fine next to a border colour', () => {
    expect(cn('border-fine border-line')).toBe('border-fine border-line')
    expect(cn('border-b-fine border-line', 'border-ink')).toBe('border-b-fine border-ink')
  })

  it('lets a later width win and drops falsy inputs', () => {
    expect(cn('border-fine', 'border-2')).toBe('border-2')
    expect(cn('h-10', false, undefined, 'h-6')).toBe('h-6')
  })

  it('knows the hard shadows, so a later one (or none) replaces an earlier one', () => {
    expect(cn('shadow-raised', 'shadow-none')).toBe('shadow-none')
    expect(cn('shadow-raised', 'shadow-card')).toBe('shadow-card')
    expect(cn('shadow-raised', 'text-ink')).toBe('shadow-raised text-ink')
  })
})
