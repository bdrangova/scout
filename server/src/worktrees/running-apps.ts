// Which local web apps are running out of which folder: listening TCP ports by their process's working directory (lsof),
// kept to the ports that answer `GET /` with an HTML page, so API servers and debuggers drop out.
import { execFile } from 'node:child_process'

/** One listening process: its working directory and the ports it listens on. */
export interface ListeningProcess {
  cwd: string
  ports: number[]
}

/** Looks up the listening processes; injectable so tests do not depend on what runs on the machine. */
export type ListeningLookup = () => Promise<ListeningProcess[]>
/** True when `http://localhost:<port>/` serves an HTML page. */
export type PageProbe = (port: number) => Promise<boolean>

function run(cmd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve) => {
    // lsof exits 1 when nothing matches; whatever it printed is still the answer.
    execFile(cmd, [...args], { timeout: 5_000, maxBuffer: 16 * 1024 * 1024 }, (_error, stdout) => resolve(stdout ?? ''))
  })
}

/** `lsof -F` output as `p<pid>` records with their `n<name>` lines. */
function parseFields(out: string): Map<number, string[]> {
  const records = new Map<number, string[]>()
  let pid: number | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1))
      if (!records.has(pid)) records.set(pid, [])
    } else if (line.startsWith('n') && pid !== null) {
      records.get(pid)?.push(line.slice(1))
    }
  }
  return records
}

export const lsofListening: ListeningLookup = async () => {
  const listening = parseFields(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']))
  if (listening.size === 0) return []
  const cwds = parseFields(await run('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', [...listening.keys()].join(',')]))
  const processes: ListeningProcess[] = []
  for (const [pid, names] of listening) {
    const cwd = cwds.get(pid)?.[0]
    const ports = [...new Set(names.map((name) => Number(name.slice(name.lastIndexOf(':') + 1))).filter((port) => Number.isInteger(port) && port > 0))]
    if (cwd !== undefined && ports.length > 0) processes.push({ cwd, ports })
  }
  return processes
}

export const htmlProbe: PageProbe = async (port) => {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1_500), redirect: 'follow' })
    await res.body?.cancel()
    return res.ok && (res.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}

const SNAPSHOT_TTL_MS = 3_000

/** Answers "which app URL runs out of this folder", from one lsof snapshot reused for a few seconds and probing each port once per snapshot. */
export class RunningApps {
  private snapshot: { at: number; processes: Promise<ListeningProcess[]>; probes: Map<number, Promise<boolean>> } | null = null

  constructor(
    private readonly lookup: ListeningLookup = lsofListening,
    private readonly probe: PageProbe = htmlProbe,
    private readonly now: () => number = Date.now,
  ) {}

  private current() {
    if (this.snapshot === null || this.now() - this.snapshot.at > SNAPSHOT_TTL_MS) {
      this.snapshot = { at: this.now(), processes: this.lookup().catch(() => []), probes: new Map() }
    }
    return this.snapshot
  }

  /** `http://localhost:<port>` of the lowest port serving a page from a process inside `folder`; null when none does. */
  async appUrl(folder: string): Promise<string | null> {
    const snapshot = this.current()
    const inside = (cwd: string) => cwd === folder || cwd.startsWith(`${folder}/`)
    const ports = [...new Set((await snapshot.processes).filter((p) => inside(p.cwd)).flatMap((p) => p.ports))].sort((a, b) => a - b)
    for (const port of ports) {
      let probe = snapshot.probes.get(port)
      if (probe === undefined) {
        probe = this.probe(port)
        snapshot.probes.set(port, probe)
      }
      if (await probe) return `http://localhost:${port}`
    }
    return null
  }
}

export const runningApps = new RunningApps()
