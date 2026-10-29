import { describe, expect, it } from 'vitest'
import { desktopNewSessionUrl, sessionOrigin } from './runs'

describe('handoff helpers', () => {
  it('reads the session origin off the entrypoint, loosely', () => {
    expect(sessionOrigin({ entrypoint: 'desktop' })).toBe('desktop')
    expect(sessionOrigin({ entrypoint: 'Claude-Desktop/1.2' })).toBe('desktop')
    expect(sessionOrigin({ entrypoint: 'cli' })).toBe('cli')
    expect(sessionOrigin({ entrypoint: 'sdk-ts' })).toBe('other')
    expect(sessionOrigin({ entrypoint: null })).toBe('other')
  })

  it('builds the Desktop deep link with the command and folder encoded', () => {
    expect(desktopNewSessionUrl('/Users/b/My Projects/app&co', '20260926-1200-qi-15472-trial-bar-f1a0')).toBe(
      'claude://code/new?q=%2Fapply-review%2020260926-1200-qi-15472-trial-bar-f1a0&folder=%2FUsers%2Fb%2FMy%20Projects%2Fapp%26co',
    )
  })
})
