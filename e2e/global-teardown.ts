import fs from 'node:fs/promises'
import { E2E_ROOT } from './store.ts'

/** Removes the throwaway store once the servers are down. */
export default async function globalTeardown(): Promise<void> {
  await fs.rm(E2E_ROOT, { recursive: true, force: true })
}
