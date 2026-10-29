/** Image hosts a GitHub comment may load from: GitHub's own, where pasted screenshots and attachments live. */
const IMAGE_HOSTS: readonly RegExp[] = [/^github\.com$/, /^user-images\.githubusercontent\.com$/, /^[a-z0-9-]+(\.[a-z0-9-]+)*\.githubusercontent\.com$/]

/** True for an https image on an allowed GitHub host; everything else is never requested. */
export function isGithubImageUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === '' && IMAGE_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

/** The dashboard's relay for a GitHub image: the server fetches it signed in, so private-repo attachments load. */
export function githubImageRelayPath(url: string): string {
  return `/api/github-image?url=${encodeURIComponent(url)}`
}
