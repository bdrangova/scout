import { describe, expect, it } from 'vitest'
import { isGithubImageRedirect, isGithubImageUrl } from './github-images.ts'

describe('GitHub image hosts', () => {
  it('allows only attachment paths on github.com and the user-image hosts', () => {
    expect(isGithubImageUrl('https://github.com/user-attachments/assets/abc')).toBe(true)
    expect(isGithubImageUrl('https://github.com/acme/app/assets/12/abc')).toBe(true)
    expect(isGithubImageUrl('https://user-images.githubusercontent.com/1/a.png')).toBe(true)
    expect(isGithubImageUrl('https://private-user-images.githubusercontent.com/1/a.png?jwt=x')).toBe(true)
    expect(isGithubImageUrl('https://github.com/settings/profile')).toBe(false)
    expect(isGithubImageUrl('https://camo.githubusercontent.com/abc')).toBe(false)
    expect(isGithubImageUrl('https://raw.githubusercontent.com/a/b/main/x.png')).toBe(false)
    expect(isGithubImageUrl('http://user-images.githubusercontent.com/1/a.png')).toBe(false)
    expect(isGithubImageUrl('https://user-images.githubusercontent.com:8443/1/a.png')).toBe(false)
    expect(isGithubImageUrl('https://x:y@user-images.githubusercontent.com/1/a.png')).toBe(false)
  })

  it('follows redirects only to GitHub image and storage hosts', () => {
    expect(isGithubImageRedirect('https://github-production-user-asset-6210df.s3.amazonaws.com/1/a.png?X-Amz-Signature=x')).not.toBeNull()
    expect(isGithubImageRedirect('https://objects.githubusercontent.com/a')).not.toBeNull()
    expect(isGithubImageRedirect('https://evil.s3.amazonaws.com/a.png')).toBeNull()
    expect(isGithubImageRedirect('https://127.0.0.1/a.png')).toBeNull()
    expect(isGithubImageRedirect('https://tracker.example/a.png')).toBeNull()
  })
})
