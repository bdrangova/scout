import { z } from 'zod'

/**
 * The labels that say what a change is, shared by every module (PR reviews first). `kind` says what sort of
 * change it is; `area` says which part of the system it touches. A review skill picks them; the web shows
 * them with one look everywhere, kinds first.
 */
export const CHANGE_TAGS = {
  feature: 'kind',
  fix: 'kind',
  refactor: 'kind',
  chore: 'kind',
  docs: 'kind',
  tests: 'kind',
  security: 'area',
  frontend: 'area',
  backend: 'area',
  database: 'area',
  infra: 'area',
  build: 'area',
  dependencies: 'area',
} as const

export type ChangeTag = keyof typeof CHANGE_TAGS
export type ChangeTagGroup = (typeof CHANGE_TAGS)[ChangeTag]

export const ChangeTagSchema = z.enum(Object.keys(CHANGE_TAGS) as [ChangeTag, ...ChangeTag[]])

/** Kinds before areas, each in the order above. */
export function sortChangeTags(tags: readonly ChangeTag[]): ChangeTag[] {
  const order = Object.keys(CHANGE_TAGS)
  return [...tags].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}
