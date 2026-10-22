import type { ReactNode } from 'react'
import type { SessionKind } from '@/lib/paths'
import { SHELL_CONFIGS, ShellConfigContext, type ShellConfig } from './shell-config'

/** Gives the shell of one session kind (`kind`) or a custom config (`config`) to everything below it. */
export function ShellConfigProvider({ kind, config, children }: { kind?: SessionKind; config?: ShellConfig; children: ReactNode }) {
  return <ShellConfigContext.Provider value={config ?? SHELL_CONFIGS[kind ?? 'code-review']}>{children}</ShellConfigContext.Provider>
}
