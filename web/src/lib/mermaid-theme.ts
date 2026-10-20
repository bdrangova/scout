import type { MermaidConfig } from '@streamdown/mermaid'
import { useContext, useMemo } from 'react'
import { ThemeContext } from '@/theme/ThemeContext'
import type { ResolvedTheme } from '@/theme/theme'

/** Reads one CSS custom property (`--ink`) as the page currently resolves it; `''` when unset. */
export type TokenReader = (name: string) => string

/** Mermaid's `base` theme variables, each fed by one design token. Unset tokens are left to mermaid's defaults. */
const TOKEN_FOR_VARIABLE: Record<string, string> = {
  background: '--paper',
  mainBkg: '--info-bg',
  primaryColor: '--info-bg',
  primaryTextColor: '--ink',
  primaryBorderColor: '--line',
  secondaryColor: '--warn-bg',
  secondaryTextColor: '--ink',
  secondaryBorderColor: '--line',
  tertiaryColor: '--ok-bg',
  tertiaryTextColor: '--ink',
  tertiaryBorderColor: '--line',
  lineColor: '--ink',
  textColor: '--ink',
  titleColor: '--ink',
  nodeBorder: '--line',
  nodeTextColor: '--ink',
  clusterBkg: '--paper-2',
  clusterBorder: '--line',
  edgeLabelBackground: '--paper',
  noteBkgColor: '--warn-bg',
  noteTextColor: '--ink',
  noteBorderColor: '--line',
  actorBkg: '--info-bg',
  actorBorder: '--line',
  actorTextColor: '--ink',
  actorLineColor: '--ink-muted',
  signalColor: '--ink',
  signalTextColor: '--ink',
  labelBoxBkgColor: '--paper-2',
  labelBoxBorderColor: '--line',
  labelTextColor: '--ink',
  loopTextColor: '--ink',
  activationBkgColor: '--paper-2',
  activationBorderColor: '--line',
  sequenceNumberColor: '--paper',
  pie1: '--blue',
  pie2: '--yellow',
  pie3: '--pink',
  pie4: '--mint',
  pie5: '--coral',
  pie6: '--cyan',
  pieStrokeColor: '--line',
  pieTitleTextColor: '--ink',
  pieSectionTextColor: '--ink',
  pieLegendTextColor: '--ink',
}

const FONT_FAMILY = "'Geist Mono Variable', 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export function cssTokenReader(): TokenReader {
  if (typeof document === 'undefined') return () => ''
  const style = getComputedStyle(document.documentElement)
  return (name) => style.getPropertyValue(name).trim()
}

/**
 * Mermaid needs literal colours (it derives shades from them), so the design tokens are read as
 * the page resolves them for `theme` and mapped onto the `base` theme. A new object per theme
 * makes Streamdown re-render the diagrams on a switch.
 */
export function buildMermaidConfig(theme: ResolvedTheme, read: TokenReader = cssTokenReader()): MermaidConfig {
  const themeVariables: Record<string, unknown> = { darkMode: theme === 'dark', fontFamily: FONT_FAMILY, fontSize: '14px' }
  for (const [variable, token] of Object.entries(TOKEN_FOR_VARIABLE)) {
    const value = read(token)
    if (value !== '') themeVariables[variable] = value
  }
  return { theme: 'base', themeVariables, fontFamily: FONT_FAMILY, flowchart: { htmlLabels: false, curve: 'basis' } }
}

/** The mermaid config for the current theme (light outside a `ThemeProvider`, as in tests). */
export function useMermaidConfig(): MermaidConfig {
  const resolved = useContext(ThemeContext)?.resolved ?? 'light'
  return useMemo(() => buildMermaidConfig(resolved), [resolved])
}
