// `scout service <command>`: the background service controls (install, start, stop, restart, status, open, logs,
// rebuild, uninstall). They live in `service/scout-service` so the menu bar app runs the same logic; this only hands over.
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Command } from 'commander'

/** `service/scout-service` in the Scout checkout this CLI was built from (`cli/src/commands` or `cli/dist`). */
export async function serviceScript(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const up of [['..', '..', '..'], ['..', '..']]) {
    const candidate = path.resolve(here, ...up, 'service', 'scout-service')
    if (await access(candidate).then(() => true, () => false)) return candidate
  }
  throw new Error(`service/scout-service not found next to ${here}`)
}

export function registerService(program: Command): void {
  program
    .command('service')
    .description('Run Scout in the background: install|start|stop|restart|status|open|logs|rebuild|uninstall')
    .argument('[command]', 'service command (none: show the commands)')
    .allowExcessArguments(true)
    .action(async (command: string | undefined) => {
      const child = spawn('/bin/bash', [await serviceScript(), ...(command === undefined ? [] : [command])], { stdio: 'inherit' })
      process.exitCode = await new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)))
    })
}
