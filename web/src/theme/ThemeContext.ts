import { createContext } from 'react'
import type { ResolvedTheme, ThemeSetting } from './theme'

export interface ThemeContextValue {
  /** What the user picked (`system` follows `prefers-color-scheme`). */
  theme: ThemeSetting
  /** What is actually applied right now. */
  resolved: ResolvedTheme
  setTheme: (theme: ThemeSetting) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
