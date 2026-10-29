/**
 * Where a GitHub comment's pasted screenshots and attachments live: github.com's attachment paths and GitHub's two
 * user-image hosts. Nothing broader (no camo proxy, no raw content), so a comment cannot make Scout fetch anything else.
 */
const IMAGE_HOSTS: readonly RegExp[] = [/^user-images\.githubusercontent\.com$/, /^private-user-images\.githubusercontent\.com$/]
/** github.com paths that hold attachments: `/user-attachments/…` and a repo's `/<owner>/<repo>/assets/…`. */
const GITHUB_ATTACHMENT_PATH = /^\/(user-attachments\/|[^/]+\/[^/]+\/assets\/)/

/** Where an attachment link may redirect to: the image hosts plus GitHub's signed storage. */
const REDIRECT_HOSTS: readonly RegExp[] = [...IMAGE_HOSTS, /^objects\.githubusercontent\.com$/, /^github-production-[a-z0-9-]+\.s3\.amazonaws\.com$/]

function parsePlainHttps(value: string): URL | null {
  const url = URL.parse(value)
  return url && url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === '' ? url : null
}

/** A github.com attachment link: the only place the server sends the signed-in user's token. */
export function isGithubAttachmentUrl(url: URL): boolean {
  return url.hostname === 'github.com' && GITHUB_ATTACHMENT_PATH.test(url.pathname)
}

/** True for an https image on an allowed GitHub host; everything else is never requested. */
export function isGithubImageUrl(value: string | undefined): value is string {
  const url = value ? parsePlainHttps(value) : null
  return url !== null && (isGithubAttachmentUrl(url) || IMAGE_HOSTS.some((host) => host.test(url.hostname)))
}

/** A redirect from a GitHub image link the server may follow: plain https to GitHub's image or storage hosts. */
export function isGithubImageRedirect(value: string): URL | null {
  const url = parsePlainHttps(value)
  return url && (isGithubAttachmentUrl(url) || REDIRECT_HOSTS.some((host) => host.test(url.hostname))) ? url : null
}

/** The dashboard's relay for a GitHub image: the server fetches it signed in, so private-repo attachments load. */
export function githubImageRelayPath(url: string): string {
  return `/api/github-image?url=${encodeURIComponent(url)}`
}
