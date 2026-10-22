export type ThemeSetting = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** localStorage key; the no-flash script in index.html reads the same key. */
export const THEME_STORAGE_KEY = 'review-dash:theme'

export const THEME_SETTINGS: readonly ThemeSetting[] = ['light', 'dark', 'system']

export function isThemeSetting(value: unknown): value is ThemeSetting {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readStoredTheme(): ThemeSetting {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeSetting(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  return setting === 'system' ? systemTheme() : setting
}

/** Sync the UI tokens and the small Scout favicon with the resolved app theme. */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.getElementById('scout-favicon')?.setAttribute('href', `/brand/scout-favicon${resolved === 'dark' ? '-dark' : ''}.svg`)
}
