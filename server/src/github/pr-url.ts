export interface PrRef {
  /** `owner/name` as written in the URL. */
  repo: string
  number: number
}

const PR_URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i

/** `https://github.com/<owner>/<name>/pull/<n>` (extra path, query or fragment allowed); null for anything else. */
export function parsePrUrl(url: string): PrRef | null {
  const match = PR_URL_RE.exec(url.trim())
  if (!match) return null
  return { repo: match[1] as string, number: Number(match[2]) }
}

/** Comparison key for two spellings of the same PR URL: `github.com/owner/name/pull/n`, lowercase. */
export function prKey(url: string): string | null {
  const ref = parsePrUrl(url)
  return ref === null ? null : `${ref.repo.toLowerCase()}#${ref.number}`
}

/** The canonical URL of a PR. */
export function prUrl(ref: PrRef): string {
  return `https://github.com/${ref.repo}/pull/${ref.number}`
}

/** `owner/name` of a git remote URL (https, ssh or scp-like), lowercase; null when it does not look like one. */
export function repoOfRemote(remote: string): string | null {
  const match = /^(?:https?:\/\/(?:[^@/]+@)?[^/]+\/|ssh:\/\/(?:[^@/]+@)?[^/]+\/|[^@/\s]+@[^:/\s]+:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim())
  return match ? (match[1] as string).toLowerCase() : null
}
