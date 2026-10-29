import type { Mode } from '@scout/shared'

export const MODE_PARAM = 'mode'

/** The modes in the order the toggle shows them. */
export const MODES: readonly Mode[] = ['scroll', 'swipe', 'grid']

/** The modes that show review cards (everything but the grid overview). */
export type CardMode = Exclude<Mode, 'grid'>

/** `?mode=` value → review mode, defaulting to swipe. */
export function parseMode(value: string | null | undefined): Mode {
  switch (value) {
    case 'scroll':
    case 'grid':
      return value
    default:
      return 'swipe'
  }
}

/** A test run has no scroll mode: `?mode=scroll` reads as swipe. */
export function parseRunMode(value: string | null | undefined): Exclude<Mode, 'scroll'> {
  return parseMode(value) === 'grid' ? 'grid' : 'swipe'
}

/** The search string that switches to `mode` and keeps every other param (the commit scope). */
export function modeSearch(params: URLSearchParams, mode: Mode): string {
  const next = new URLSearchParams(params)
  next.set(MODE_PARAM, mode)
  return `?${next.toString()}`
}

/** The Spec and Extras pages: their full cards stacked (scroll) or a tile per item (grid). */
export type PageMode = Extract<Mode, 'scroll' | 'grid'>

export const PAGE_MODES: readonly PageMode[] = ['scroll', 'grid']

/** `?mode=` on the Spec and Extras pages: grid, else scroll. */
export function parsePageMode(value: string | null | undefined): PageMode {
  return value === 'grid' ? 'grid' : 'scroll'
}

export function isCardMode(mode: Mode): mode is CardMode {
  return mode !== 'grid'
}

export const MODE_LABELS: Record<Mode, string> = { scroll: 'Scroll', swipe: 'Swipe', grid: 'Grid' }

const LAST_CARD_MODE_KEY = 'scout:last-card-mode'

/** The card mode the grid was opened from (what a tile opens and what `G` returns to). */
export function readLastCardMode(): CardMode {
  try {
    const stored = window.localStorage.getItem(LAST_CARD_MODE_KEY)
    return stored === 'scroll' ? 'scroll' : 'swipe'
  } catch {
    return 'swipe'
  }
}

export function rememberCardMode(mode: CardMode): void {
  try {
    window.localStorage.setItem(LAST_CARD_MODE_KEY, mode)
  } catch {
    // Private mode or storage disabled: the grid then opens files in swipe mode.
  }
}

/** The mode `S` switches to: the other card mode (from the grid, relative to the remembered one). */
export function toggledCardMode(mode: Mode): CardMode {
  const current = isCardMode(mode) ? mode : readLastCardMode()
  return current === 'swipe' ? 'scroll' : 'swipe'
}

/** The mode `G` switches to: the grid, or back to the card mode it was opened from. */
export function toggledGridMode(mode: Mode): Mode {
  return mode === 'grid' ? readLastCardMode() : 'grid'
}
