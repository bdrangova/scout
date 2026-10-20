import { describe, expect, it } from 'vitest'
import { buildMermaidConfig } from './mermaid-theme'

const TOKENS: Record<string, string> = { '--paper': '#FDF3EC', '--ink': '#2B2A33', '--line': 'rgba(43, 42, 51, .34)', '--info-bg': '#E2E8F8' }

describe('buildMermaidConfig', () => {
  it('maps the design tokens onto the base theme and flags dark mode', () => {
    const light = buildMermaidConfig('light', (name) => TOKENS[name] ?? '')
    expect(light.theme).toBe('base')
    expect(light.themeVariables).toMatchObject({ darkMode: false, background: '#FDF3EC', primaryColor: '#E2E8F8', lineColor: '#2B2A33', nodeBorder: 'rgba(43, 42, 51, .34)' })
    expect(buildMermaidConfig('dark', (name) => TOKENS[name] ?? '').themeVariables).toMatchObject({ darkMode: true })
  })

  it('leaves unset tokens to mermaid instead of passing empty colours', () => {
    const config = buildMermaidConfig('light', () => '')
    expect(config.themeVariables).toEqual({ darkMode: false, fontFamily: expect.stringContaining('Geist Mono') as string, fontSize: '14px' })
  })
})
