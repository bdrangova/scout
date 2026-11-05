import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIN_VIDEO_BYTES, checkVideos, convertToMp4 } from './video.ts'

let dir: string
let fakeFfmpeg: string

async function put(file: string, bytes: number): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, Buffer.alloc(bytes, 1))
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  )
}

/** A stand-in for ffmpeg: records its argv and writes `bytes` bytes to the last argument (the output file). */
async function writeFake(bytes: number): Promise<string> {
  const file = path.join(dir, 'bin', `fake-ffmpeg-${bytes}`)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `#!/bin/sh\nif [ "$1" = "-version" ]; then echo fake; exit 0; fi\necho "$@" >> "${dir}/argv.log"\nfor a in "$@"; do last="$a"; done\nhead -c ${bytes} /dev/zero > "$last"\n`)
  await chmod(file, 0o755)
  return file
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ai-review-video-'))
  fakeFfmpeg = await writeFake(MIN_VIDEO_BYTES + 5000)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('video mp4', () => {
  it('converts every webm in a folder (recursive) and a given file, deletes the webm, keeps other files', async () => {
    await put(path.join(dir, 'v', 'a.webm'), 100)
    await put(path.join(dir, 'v', 'deep', 'b.webm'), 100)
    await put(path.join(dir, 'v', 'keep.mp4'), 50)
    await put(path.join(dir, 'single.webm'), 100)
    const { results, missing } = await convertToMp4({ paths: [path.join(dir, 'v'), path.join(dir, 'single.webm')], ffmpeg: fakeFfmpeg })
    expect(missing).toEqual([])
    expect(results.map((r) => [path.relative(dir, r.input), r.status])).toEqual([['single.webm', 'converted'], ['v/a.webm', 'converted'], ['v/deep/b.webm', 'converted']].sort())
    for (const name of ['v/a.mp4', 'v/deep/b.mp4', 'single.mp4', 'v/keep.mp4']) expect(await exists(path.join(dir, name))).toBe(true)
    for (const name of ['v/a.webm', 'v/deep/b.webm', 'single.webm']) expect(await exists(path.join(dir, name))).toBe(false)
    expect((await stat(path.join(dir, 'v', 'a.mp4'))).size).toBe(MIN_VIDEO_BYTES + 5000)
    const argv = (await readFile(path.join(dir, 'argv.log'), 'utf8')).split('\n')[0] ?? ''
    expect(argv).toContain('-c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart')
  })

  it('keeps the webm and reports a failure when the mp4 is too small', async () => {
    await put(path.join(dir, 'a.webm'), 100)
    const { results } = await convertToMp4({ paths: [dir], ffmpeg: await writeFake(1000) })
    expect(results).toMatchObject([{ status: 'failed', error: expect.stringMatching(/only 1000 bytes/) }])
    expect(await exists(path.join(dir, 'a.webm'))).toBe(true)
    expect(await exists(path.join(dir, 'a.mp4'))).toBe(false)
    expect(await exists(path.join(dir, 'a.mp4.converting.mp4'))).toBe(false)
  })

  it('throws a clear error when ffmpeg is not installed, and reports a missing path', async () => {
    await put(path.join(dir, 'a.webm'), 100)
    await expect(convertToMp4({ paths: [dir], ffmpeg: path.join(dir, 'no-such-ffmpeg') })).rejects.toThrow(/brew install ffmpeg/)
    expect(await exists(path.join(dir, 'a.webm'))).toBe(true)
    expect((await convertToMp4({ paths: [path.join(dir, 'nope')], ffmpeg: fakeFfmpeg })).missing).toEqual([path.join(dir, 'nope')])
  })
})

describe('video check', () => {
  it('lists webm and mp4 files with sizes and flags those under 10 KB', async () => {
    await put(path.join(dir, 'ok.mp4'), MIN_VIDEO_BYTES)
    await put(path.join(dir, 'sub', 'tiny.webm'), MIN_VIDEO_BYTES - 1)
    await put(path.join(dir, 'sub', 'notes.txt'), 3)
    const report = await checkVideos([dir])
    expect(report.videos.map((v) => [path.relative(dir, v.path), v.bytes, v.tooSmall])).toEqual([['ok.mp4', MIN_VIDEO_BYTES, false], ['sub/tiny.webm', MIN_VIDEO_BYTES - 1, true]])
    expect(report.ok).toBe(false)
    expect((await checkVideos([path.join(dir, 'ok.mp4')])).ok).toBe(true)
    expect(await checkVideos([path.join(dir, 'gone.mp4')])).toMatchObject({ ok: false, missing: [path.join(dir, 'gone.mp4')] })
  })
})
