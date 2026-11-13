import path from 'node:path'
import type { BlueprintFileKind } from '@scout/shared'

const STYLE = new Set(['.css', '.scss', '.sass', '.less', '.styl'])
const CONFIG = new Set(['.json', '.yaml', '.yml', '.sh', '.toml'])

/** Guesses what a changed file is from its path alone (the stereotype on its Blueprint box). */
export function classifyFile(filePath: string): BlueprintFileKind {
  const lower = filePath.toLowerCase()
  const ext = path.posix.extname(lower)
  const base = path.posix.basename(lower, ext).replace(/\.d$/, '')
  if (ext === '.feature') return 'scenario'
  if (/(^|\/)(__tests__|tests?|e2e|specs?)\//.test(lower) || /\.(test|spec)\./.test(lower)) return 'test'
  if (STYLE.has(ext)) return 'style'
  if (CONFIG.has(ext)) return 'config'
  if (base.endsWith('_page') || lower.includes('/pages/') || lower.startsWith('pages/')) return 'page'
  if (/^use[_A-Z]/.test(path.posix.basename(filePath, path.posix.extname(filePath))) || lower.includes('/hooks/') || lower.startsWith('hooks/')) return 'hook'
  if (/(^|[._-])types?$/.test(base) || lower.endsWith('.d.ts')) return 'types'
  if (/(helpers?|utils?|constants?|mapping)/.test(base)) return 'helper'
  if (ext === '.tsx' || ext === '.jsx') return 'component'
  return 'module'
}
