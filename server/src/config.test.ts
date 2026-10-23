import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    const config = loadConfig({ PATH: '' })
    expect(config.port).toBe(4545)
    expect(config.home).toBe(path.join(os.homedir(), '.ai-review'))
    expect(config.adapter).toBe('claude-code')
    expect(config.dashboardUrl).toBe('http://scout.localhost:4546')
  })

  it('reads AI_REVIEW_PORT, AI_REVIEW_HOME (with ~), AGENT_ADAPTER and DASHBOARD_URL', () => {
    const config = loadConfig({
      AI_REVIEW_PORT: '5000',
      AI_REVIEW_HOME: '~/store',
      AGENT_ADAPTER: 'fake',
      DASHBOARD_URL: 'http://localhost:3000/',
      PATH: '',
    })
    expect(config.port).toBe(5000)
    expect(config.home).toBe(path.join(os.homedir(), 'store'))
    expect(config.adapter).toBe('fake')
    expect(config.dashboardUrl).toBe('http://localhost:3000')
  })

  it('ignores the generic PORT variable (the browser-preview harness injects the web port there)', () => {
    expect(loadConfig({ PORT: '4546', PATH: '' }).port).toBe(4545)
    expect(loadConfig({ PORT: '4546', AI_REVIEW_PORT: '4547', PATH: '' }).port).toBe(4547)
  })

  it('rejects an unknown adapter and a bad port', () => {
    expect(() => loadConfig({ AGENT_ADAPTER: 'gpt', PATH: '' })).toThrow(/AGENT_ADAPTER/)
    expect(() => loadConfig({ AI_REVIEW_PORT: 'abc', PATH: '' })).toThrow(/AI_REVIEW_PORT/)
  })
})
