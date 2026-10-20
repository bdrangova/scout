import { describe, expect, it } from 'vitest'
import { safePrUrl } from './pr-url'

describe('safePrUrl', () => {
  it('accepts a github.com pull URL', () => {
    expect(safePrUrl('https://github.com/acme/app/pull/482')).toBe('https://github.com/acme/app/pull/482')
    expect(safePrUrl('https://github.com/acme/app/pull/482/files')).toBe('https://github.com/acme/app/pull/482/files')
  })

  it.each([
    'http://github.com/acme/app/pull/1',
    'https://evil.com/acme/app/pull/1',
    'https://github.com.evil.com/acme/app/pull/1',
    'https://user:pw@github.com/acme/app/pull/1',
    'https://github.com:8443/acme/app/pull/1',
    'https://github.com/acme/app/issues/1',
    'https://github.com/acme/app/pull/x',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('rejects %s', (value) => {
    expect(safePrUrl(value)).toBeNull()
  })
})
