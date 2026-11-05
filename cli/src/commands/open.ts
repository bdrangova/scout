// `scout open [id]`: opens the dashboard (or one session) in the default browser.
import { spawn } from 'node:child_process'
import type { Command } from 'commander'
import { dashboardOrigin, dashboardUrl, readConfig } from '../config.ts'
import { resolveHome } from '../store.ts'

export function openInBrowser(url: string): void {
  const [file, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]]
  const child = spawn(file, args, { detached: true, stdio: 'ignore' })
  child.on('error', (error) => console.error(`could not open a browser: ${error.message}`))
  child.unref()
}

export function registerOpen(program: Command): void {
  program
    .command('open')
    .argument('[id]', 'session id')
    .description('Open the dashboard in the browser')
    .action(async (id: string | undefined) => {
      const config = await readConfig(resolveHome())
      const url = id ? dashboardUrl(config, id) : dashboardOrigin(config)
      openInBrowser(url)
      console.log(url)
    })
}
