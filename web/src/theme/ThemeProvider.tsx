import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext } from './ThemeContext'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemeSetting,
} from './theme'

interface ThemeProviderProps {
  children: ReactNode
  /** Overrides the stored setting; handy in tests and the kit page. */
  defaultTheme?: ThemeSetting
}

/** Owns the light/dark/system setting, persists it and keeps `.dark` on `<html>` in sync. */
export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeSetting>(() => defaultTheme ?? readStoredTheme())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(theme))

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const next = resolveTheme(theme)
      setResolved(next)
      applyTheme(next)
    }
    sync()
    if (theme !== 'system') return
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  // Follow a change made in another tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setThemeState(readStoredTheme())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private mode or blocked storage: the setting lives for this page only.
    }
  }, [])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
  return <ThemeContext value={value}>{children}</ThemeContext>
}
