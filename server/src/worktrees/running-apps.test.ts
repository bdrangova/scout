import { describe, expect, it, vi } from 'vitest'
import { RunningApps } from './running-apps.ts'

const processes = [
  { cwd: '/wt/a/build/server', ports: [3017, 9202] },
  { cwd: '/wt/a/src/client', ports: [8096] },
  { cwd: '/wt/ab', ports: [8000] },
  { cwd: '/wt/b', ports: [3022] },
]

describe('RunningApps', () => {
  it('picks the lowest port that serves a page from a process inside the folder', async () => {
    const probe = vi.fn(async (port: number) => port === 8096 || port === 8000)
    const apps = new RunningApps(async () => processes, probe)
    expect(await apps.appUrl('/wt/a')).toBe('http://localhost:8096')
    // `/wt/ab` is a sibling, not inside `/wt/a`.
    expect(probe).not.toHaveBeenCalledWith(8000)
  })

  it('is null when nothing inside the folder serves a page', async () => {
    const apps = new RunningApps(async () => processes, async () => false)
    expect(await apps.appUrl('/wt/b')).toBeNull()
    expect(await apps.appUrl('/wt/none')).toBeNull()
  })

  it('reuses one snapshot and one probe per port for a few seconds', async () => {
    let now = 0
    const lookup = vi.fn(async () => processes)
    const probe = vi.fn(async () => true)
    const apps = new RunningApps(lookup, probe, () => now)
    await apps.appUrl('/wt/a')
    await apps.appUrl('/wt/a')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledTimes(1)
    now = 10_000
    await apps.appUrl('/wt/a')
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('treats a failed lookup as nothing running', async () => {
    const apps = new RunningApps(async () => { throw new Error('no lsof') }, async () => true)
    expect(await apps.appUrl('/wt/a')).toBeNull()
  })
})
