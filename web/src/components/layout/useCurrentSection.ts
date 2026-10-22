import { SECTIONS } from '@review-dash/shared'
import { useLocation } from 'react-router'
import { useShellConfig } from './shell-config'

/** The session section a `/<s|t>/:id/<section>/…` path is on among `sections` (the code review's by default); null anywhere else. */
export function sectionOfPath(pathname: string, sections: readonly string[] = SECTIONS): string | null {
  const segment = pathname.split('/')[3]
  return sections.find((section) => section === segment) ?? null
}

export function useCurrentSection(): string | null {
  const { sections } = useShellConfig()
  return sectionOfPath(useLocation().pathname, sections)
}
