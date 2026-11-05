// `ai-review video mp4|check`: browsers play H.264 mp4, not the webm Playwright records. `mp4` converts with the system ffmpeg and
// deletes the webm once the mp4 is checked; `check` lists videos and flags any that are too small to hold a recording.
import { execFile } from 'node:child_process'
import { readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Command } from 'commander'

const run = promisify(execFile)

/** A recording smaller than this is an empty or broken file. */
export const MIN_VIDEO_BYTES = 10 * 1024
const FFMPEG_MISSING = 'ffmpeg was not found on PATH: install it with `brew install ffmpeg` (or set AI_REVIEW_FFMPEG to its path)'

export interface ConvertResult {
  input: string
  output: string
  status: 'converted' | 'failed'
  bytes?: number
  error?: string
}

export interface VideoInfo {
  path: string
  bytes: number
  tooSmall: boolean
}

export interface CheckReport {
  videos: VideoInfo[]
  /** Paths that do not exist. */
  missing: string[]
  ok: boolean
}

function isMissingError(error: unknown): boolean {
  return (error as { code?: string }).code === 'ENOENT'
}

/** The files with one of `extensions`: files named directly, and the matches inside folders (recursive, symlinks not followed). */
async function collect(paths: readonly string[], extensions: readonly string[]): Promise<{ files: string[]; missing: string[] }> {
  const files: string[] = []
  const missing: string[] = []
  const matches = (name: string): boolean => extensions.includes(path.extname(name).toLowerCase())
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && matches(entry.name)) files.push(full)
    }
  }
  for (const given of paths) {
    const resolved = path.resolve(given)
    const info = await stat(resolved).catch(() => null)
    if (info === null) missing.push(resolved)
    else if (info.isDirectory()) await walk(resolved)
    else if (matches(resolved)) files.push(resolved)
  }
  return { files: [...new Set(files)].sort(), missing }
}

async function assertFfmpeg(ffmpeg: string): Promise<void> {
  try {
    await run(ffmpeg, ['-version'])
  } catch (error) {
    if (isMissingError(error)) throw new Error(FFMPEG_MISSING)
    throw new Error(`${ffmpeg} -version failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function convertOne(ffmpeg: string, input: string): Promise<ConvertResult> {
  const output = input.replace(/\.webm$/i, '.mp4')
  const partial = `${output}.converting.mp4`
  try {
    await run(ffmpeg, ['-y', '-i', input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', partial], { maxBuffer: 16 * 1024 * 1024 })
    const bytes = (await stat(partial)).size
    if (bytes <= MIN_VIDEO_BYTES) throw new Error(`ffmpeg wrote only ${bytes} bytes (needs more than ${MIN_VIDEO_BYTES})`)
    await rename(partial, output)
    await rm(input)
    return { input, output, status: 'converted', bytes }
  } catch (error) {
    await rm(partial, { force: true })
    const detail = (error as { stderr?: string }).stderr?.trim().split('\n').slice(-3).join(' | ')
    return { input, output, status: 'failed', error: detail === undefined || detail === '' ? (error instanceof Error ? error.message : String(error)) : detail }
  }
}

/** Converts every `.webm` under `paths` to an mp4 next to it. Throws when ffmpeg is missing; a failed file keeps its webm. */
export async function convertToMp4(options: { paths: readonly string[]; ffmpeg?: string }): Promise<{ results: ConvertResult[]; missing: string[] }> {
  const ffmpeg = options.ffmpeg ?? 'ffmpeg'
  const { files, missing } = await collect(options.paths, ['.webm'])
  if (files.length > 0) await assertFfmpeg(ffmpeg)
  const results: ConvertResult[] = []
  for (const file of files) results.push(await convertOne(ffmpeg, file))
  return { results, missing }
}

/** Lists the `.webm` and `.mp4` files under `paths` with their sizes; not ok when a path is missing or a video is under 10 KB. */
export async function checkVideos(paths: readonly string[]): Promise<CheckReport> {
  const { files, missing } = await collect(paths, ['.webm', '.mp4'])
  const videos: VideoInfo[] = []
  for (const file of files) {
    const bytes = (await stat(file)).size
    videos.push({ path: file, bytes, tooSmall: bytes < MIN_VIDEO_BYTES })
  }
  return { videos, missing, ok: missing.length === 0 && videos.every((video) => !video.tooSmall) }
}

interface JsonFlag {
  json?: boolean
}

export function registerVideo(program: Command): void {
  const command = program.command('video').description('Convert recorded webm videos to mp4 and check that videos are not empty')

  command
    .command('mp4')
    .argument('<paths...>', 'webm files, or folders searched recursively for *.webm')
    .option('--json', 'print the result as json')
    .description('Convert each webm to an H.264 mp4 next to it with ffmpeg, then delete the webm (kept when the conversion failed)')
    .action(async (paths: string[], flags: JsonFlag) => {
      let converted: Awaited<ReturnType<typeof convertToMp4>>
      try {
        converted = await convertToMp4({ paths, ffmpeg: process.env.AI_REVIEW_FFMPEG ?? 'ffmpeg' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (flags.json === true) console.log(JSON.stringify({ ok: false, error: message }, null, 2))
        else console.error(`error: ${message}`)
        process.exitCode = 1
        return
      }
      const { results, missing } = converted
      const ok = missing.length === 0 && results.every((result) => result.status === 'converted')
      if (flags.json === true) console.log(JSON.stringify({ ok, results, missing }, null, 2))
      else {
        for (const result of results) console.log(result.status === 'converted' ? `converted ${result.output} (${result.bytes} bytes), webm deleted` : `FAILED    ${result.input}: ${result.error ?? 'unknown error'} (webm kept)`)
        for (const file of missing) console.log(`MISSING   ${file}`)
        if (results.length === 0 && missing.length === 0) console.log('no webm files found')
      }
      if (!ok) process.exitCode = 1
    })

  command
    .command('check')
    .argument('<paths...>', 'video files, or folders searched recursively for *.webm and *.mp4')
    .option('--json', 'print the result as json')
    .description('List videos with their sizes; exit 1 when a path is missing or a video is under 10 KB')
    .action(async (paths: string[], flags: JsonFlag) => {
      const report = await checkVideos(paths)
      if (flags.json === true) console.log(JSON.stringify(report, null, 2))
      else {
        for (const video of report.videos) console.log(`${video.tooSmall ? 'TOO SMALL' : 'ok       '} ${String(video.bytes).padStart(10)} bytes  ${video.path}`)
        for (const file of report.missing) console.log(`MISSING   ${file}`)
        if (report.videos.length === 0 && report.missing.length === 0) console.log('no videos found')
      }
      if (!report.ok) process.exitCode = 1
    })
}
