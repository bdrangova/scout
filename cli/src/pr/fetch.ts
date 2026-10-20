// Reads one pull request from GitHub through `gh`: identity, review (line) comments, review summaries,
// conversation comments, and the thread flags (outdated, resolved) from GraphQL.
import { z } from 'zod'
import type { PrComment, PrIdentity } from '@review-dash/shared'
import { PrIdentitySchema } from '@review-dash/shared'
import { classifyGhError, parsePagedArray, PrSyncError, type GhRunner } from './gh.ts'
import {
  GhIssueCommentSchema,
  GhReviewCommentSchema,
  GhReviewSchema,
  issueComments,
  lineComments,
  reviewSummaries,
  type ThreadFlags,
} from './normalize.ts'

const PrViewSchema = z.object({
  number: z.number().int().positive(),
  url: z.string(),
  title: z.string(),
  state: z.string(),
  isDraft: z.boolean(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
})

const THREADS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){' +
  'reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated comments(first:100){nodes{databaseId}}}}}}}'

const ThreadsPageSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
          nodes: z.array(
            z.object({ isResolved: z.boolean(), isOutdated: z.boolean(), comments: z.object({ nodes: z.array(z.object({ databaseId: z.number().nullable() })) }) }),
          ),
        }),
      }),
    }),
  }),
})

export interface FetchedPr {
  pr: PrIdentity
  comments: PrComment[]
  warnings: string[]
}

const STATES: Record<string, PrIdentity['state']> = { OPEN: 'open', CLOSED: 'closed', MERGED: 'merged' }

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new PrSyncError('gh-failed', `gh returned something that is not JSON for ${what}`)
  }
}

function parseList<T>(schema: z.ZodType<T>, stdout: string, what: string): T[] {
  const items: T[] = []
  for (const raw of parsePagedArray(stdout)) {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new PrSyncError('gh-failed', `unexpected ${what} payload from GitHub: ${z.prettifyError(parsed.error)}`)
    items.push(parsed.data)
  }
  return items
}

async function threadFlags(gh: GhRunner, cwd: string, owner: string, name: string, number: number, host: readonly string[]): Promise<Map<number, ThreadFlags>> {
  const flags = new Map<number, ThreadFlags>()
  let cursor: string | null = null
  for (let page = 0; page < 50; page += 1) {
    const args = ['api', ...host, 'graphql', '-f', `query=${THREADS_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`]
    if (cursor !== null) args.push('-f', `cursor=${cursor}`)
    const parsed = ThreadsPageSchema.parse(parseJson(await gh(args, cwd), 'review threads'))
    const threads = parsed.data.repository.pullRequest.reviewThreads
    for (const thread of threads.nodes) {
      for (const comment of thread.comments.nodes) {
        if (comment.databaseId !== null) flags.set(comment.databaseId, { outdated: thread.isOutdated, resolved: thread.isResolved })
      }
    }
    if (!threads.pageInfo.hasNextPage) break
    cursor = threads.pageInfo.endCursor
    if (cursor === null) break
  }
  return flags
}

/** `gh pr view [<number>]` in `cwd` (the current branch's PR when no number), then the three comment lists. */
export async function fetchPr(gh: GhRunner, options: { cwd: string; pr?: number | null; now: string }): Promise<FetchedPr> {
  const { cwd, now } = options
  const warnings: string[] = []
  const viewArgs = ['pr', 'view', ...(options.pr == null ? [] : [String(options.pr)]), '--json', 'number,url,title,state,isDraft,baseRefName,headRefName,headRefOid']
  let view: z.infer<typeof PrViewSchema>
  try {
    const parsed = PrViewSchema.safeParse(parseJson(await gh(viewArgs, cwd), 'the pull request'))
    if (!parsed.success) throw new PrSyncError('gh-failed', `unexpected pull request payload from gh: ${z.prettifyError(parsed.error)}`)
    view = parsed.data
  } catch (error) {
    throw classifyGhError(error)
  }
  const location = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(view.url)
  if (location === null) throw new PrSyncError('gh-failed', `cannot read owner and repository from the PR url ${view.url}`)
  const [, host = 'github.com', owner = '', name = ''] = location
  const hostArgs = host === 'github.com' ? [] : ['--hostname', host]
  const pr = PrIdentitySchema.parse({
    repo: `${owner}/${name}`,
    number: view.number,
    url: view.url,
    title: view.title,
    state: STATES[view.state.toUpperCase()] ?? 'open',
    draft: view.isDraft,
    baseRef: view.baseRefName,
    headRef: view.headRefName,
    headSha: view.headRefOid,
  })

  const api = async (resource: string): Promise<string> => {
    try {
      return await gh(['api', ...hostArgs, '--paginate', `repos/${owner}/${name}/${resource}?per_page=100`], cwd)
    } catch (error) {
      throw classifyGhError(error)
    }
  }
  const [reviewComments, reviews, conversation] = await Promise.all([
    api(`pulls/${pr.number}/comments`),
    api(`pulls/${pr.number}/reviews`),
    api(`issues/${pr.number}/comments`),
  ])
  let flags = new Map<number, ThreadFlags>()
  try {
    flags = await threadFlags(gh, cwd, owner, name, pr.number, hostArgs)
  } catch (error) {
    warnings.push(`could not read thread state (resolved/outdated) from GitHub GraphQL; outdated is inferred from the line comments only: ${error instanceof Error ? error.message : String(error)}`)
  }

  const comments = [
    ...lineComments(pr.number, parseList(GhReviewCommentSchema, reviewComments, 'review comment'), flags),
    ...reviewSummaries(pr.number, parseList(GhReviewSchema, reviews, 'review'), now),
    ...issueComments(pr.number, parseList(GhIssueCommentSchema, conversation, 'issue comment')),
  ]
  return { pr, comments, warnings }
}
