const PULL_PATH = /^\/[\w.-]+\/[\w.-]+\/pull\/\d+(?:\/.*)?$/

/**
 * The PR link is the one external link in the bar, so it is only rendered for a plain
 * `https://github.com/<owner>/<repo>/pull/<n>` URL (no credentials, no other host or scheme).
 * Returns the normalised href, or null.
 */
export function safePrUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port !== '' || url.username !== '' || url.password !== '') return null
  return PULL_PATH.test(url.pathname) ? url.href : null
}
