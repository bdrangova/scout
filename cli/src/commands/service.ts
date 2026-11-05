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

/** Read-only commands an agent may run; the rest change what runs on the machine. */
const READ_ONLY = new Set(['status', 'open', 'logs', 'help', '-h', '--help'])

/**
 * Skills are allowed `Bash(scout *)`, so without this an agent could install, rebuild or stop the service unprompted.
 * Changing commands therefore need a terminal; the menu bar app runs the script directly and is not affected.
 */
export function checkServiceCommand(command: string | undefined, interactive: boolean): void {
  if (command === undefined || READ_ONLY.has(command) || interactive) return
  throw new Error(`scout service ${command} must be run by you in a terminal, not by an agent: it changes what runs on this machine`)
}

export function registerService(program: Command): void {
  program
    .command('service')
    .description('Run Scout in the background: install|start|stop|restart|status|open|logs|rebuild|uninstall')
    .argument('[command]', 'service command (none: show the commands)')
    .allowExcessArguments(true)
    .action(async (command: string | undefined) => {
      checkServiceCommand(command, process.stdin.isTTY === true && process.stdout.isTTY === true)
      const child = spawn('/bin/bash', [await serviceScript(), ...(command === undefined ? [] : [command])], { stdio: 'inherit' })
      process.exitCode = await new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)))
    })
}
