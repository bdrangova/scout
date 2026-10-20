import { SECTIONS } from '@review-dash/shared'
import { useLocation } from 'react-router'

type Section = (typeof SECTIONS)[number]

/** The session section a `/s/:id/<section>/…` path is on; null anywhere else. */
export function sectionOfPath(pathname: string): Section | null {
  const segment = pathname.split('/')[3]
  return SECTIONS.find((section) => section === segment) ?? null
}

export function useCurrentSection(): Section | null {
  return sectionOfPath(useLocation().pathname)
}
