import type { PrComment, PrComments, PrResolutions, PrTrust } from '../schemas/pr-comments.ts'
import { hashPrBody } from './sha256.ts'

/** `author_association` values that mean the author can already push to the repo. */
export const TRUSTED_ASSOCIATIONS: readonly string[] = ['OWNER', 'MEMBER', 'COLLABORATOR']

/**
 * The GitHub bot accounts that are Copilot's reviewer, matched exactly and case-sensitively (never by substring):
 * `Copilot` is the login REST returns for Copilot code review, `copilot-pull-request-reviewer[bot]` the app login
 * it also appears under. Any other bot (including other Copilot-branded ones) is untrusted unless allow-listed
 * through `trustedPrCommentAuthors`.
 */
export const COPILOT_BOT_LOGINS: readonly string[] = ['Copilot', 'copilot-pull-request-reviewer[bot]']

/** Exact Copilot identity: one of `COPILOT_BOT_LOGINS` AND a bot account (a person named "Copilot" is `User`). */
export function isCopilotAccount(login: string, isBot: boolean): boolean {
  return isBot && COPILOT_BOT_LOGINS.includes(login)
}

/** Logins allowed by the config at sync time plus what the user trusted explicitly (`ai-review pr-trust`). */
export function prTrustFor(prComments: Pick<PrComments, 'trustedAuthors'> | null, resolutions: Pick<PrResolutions, 'trust'> | null): PrTrust {
  return {
    authors: [...(prComments?.trustedAuthors ?? []), ...(resolutions?.trust?.authors ?? [])],
    comments: resolutions?.trust?.comments ?? [],
  }
}

/** Ids of the pinned or legacy grants whose comment is the given one. */
function grantFor(trust: PrTrust, id: string): PrTrust['comments'][number] | undefined {
  return trust.comments.find((grant) => (typeof grant === 'string' ? grant : grant.id) === id)
}

/**
 * Whether a comment's body may be handed to an agent. Comment text is third-party input: only comments by repo
 * OWNER/MEMBER/COLLABORATORs, by Copilot (exact bot identity), by an allow-listed login (exact, case-insensitive
 * equality), or that the user trusted by id while its body is still the one they saw are trusted. Everything else
 * stays visible in the dashboard but is left out of the feedback, the hook and every dispatch.
 */
export function isTrustedPrComment(comment: PrComment, trust: PrTrust): boolean {
  const grant = grantFor(trust, comment.id)
  if (grant !== undefined && (typeof grant === 'string' || grant.bodyHash === hashPrBody(comment.body))) return true
  const login = comment.author.login.toLowerCase()
  if (trust.authors.some((author) => author.toLowerCase() === login)) return true
  if (isCopilotAccount(comment.author.login, comment.author.isBot)) return true
  return comment.authorAssociation != null && TRUSTED_ASSOCIATIONS.includes(comment.authorAssociation.toUpperCase())
}

/** Pinned comment grants whose comment body changed since the grant (they no longer count). Legacy bare ids are never listed here. */
export function lapsedCommentGrants(trust: PrTrust, comments: readonly PrComment[]): string[] {
  const lapsed: string[] = []
  for (const grant of trust.comments) {
    if (typeof grant === 'string') continue
    const comment = comments.find((c) => c.id === grant.id)
    if (comment !== undefined && grant.bodyHash !== hashPrBody(comment.body)) lapsed.push(grant.id)
  }
  return lapsed
}
