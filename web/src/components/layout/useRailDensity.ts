import { useCallback, useState } from 'react'

export type RailDensity = 'roomy' | 'compact'

/** Files keeps the tree tall (compact by default); the other pages show the full identity and review. */
export type RailDensityGroup = 'files' | 'other'

const DEFAULTS: Record<RailDensityGroup, RailDensity> = { files: 'compact', other: 'roomy' }

function storageKey(group: RailDensityGroup): string {
  return `review-dash:rail-density:${group}`
}

function readDensity(group: RailDensityGroup): RailDensity {
  try {
    const stored = window.localStorage.getItem(storageKey(group))
    return stored === 'roomy' || stored === 'compact' ? stored : DEFAULTS[group]
  } catch {
    return DEFAULTS[group]
  }
}

function storeDensity(group: RailDensityGroup, density: RailDensity): void {
  try {
    window.localStorage.setItem(storageKey(group), density)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}

/**
 * The rail's density, remembered separately for the Files page and for the other pages.
 * `[density, toggle]`; switching group (navigating between Files and another page) reads that group's own choice.
 */
export function useRailDensity(group: RailDensityGroup): [density: RailDensity, toggle: () => void] {
  const [chosen, setChosen] = useState<Record<RailDensityGroup, RailDensity>>(() => ({ files: readDensity('files'), other: readDensity('other') }))

  const toggle = useCallback(() => {
    setChosen((current) => {
      const next: RailDensity = current[group] === 'roomy' ? 'compact' : 'roomy'
      storeDensity(group, next)
      return { ...current, [group]: next }
    })
  }, [group])

  return [chosen[group], toggle]
}
