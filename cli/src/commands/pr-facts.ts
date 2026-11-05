// `scout pr-report facts`: the PR facts part of the Summary overview, read from GitHub in one `gh pr view`.
import { z } from 'zod'
import { classifyGhError, defaultGhRunner, PrSyncError, type GhRunner } from '../pr/gh.ts'

const GhPrFactsSchema = z.object({
  title: z.string(),
  body: z.string().nullable().optional(),
  author: z.object({ login: z.string() }),
  labels: z.array(z.object({ name: z.string() })),
  headRefName: z.string(),
  baseRefName: z.string(),
  createdAt: z.string(),
  isDraft: z.boolean(),
  commits: z.array(z.unknown()),
  url: z.string(),
})

export interface PrFacts {
  title: string
  description: string
  author: string
  headRef: string
  baseRef: string
  labels: string[]
  draft: boolean
  openedAt: string
  commits: number
  tickets: { key: string; title: null; url: null }[]
}

/** Unique ticket keys (`ABC-123`) in order of first appearance across the texts, in the order given. */
export function extractTicketKeys(...texts: string[]): string[] {
  const keys: string[] = []
  for (const text of texts) {
    for (const match of text.matchAll(/(?<![A-Za-z0-9])[A-Z][A-Z0-9]+-\d+(?![A-Za-z0-9])/g)) {
      if (!keys.includes(match[0])) keys.push(match[0])
    }
  }
  return keys
}

export async function fetchPrFacts(options: { pr: string; cwd: string; gh?: GhRunner }): Promise<PrFacts> {
  const gh = options.gh ?? defaultGhRunner
  const args = ['pr', 'view', options.pr, '--json', 'title,body,author,labels,headRefName,baseRefName,createdAt,isDraft,commits,url']
  let raw: unknown
  try {
    raw = JSON.parse(await gh(args, options.cwd))
  } catch (error) {
    throw classifyGhError(error)
  }
  const parsed = GhPrFactsSchema.safeParse(raw)
  if (!parsed.success) throw new PrSyncError('gh-failed', `unexpected pull request payload from gh: ${z.prettifyError(parsed.error)}`)
  const pr = parsed.data
  const body = pr.body ?? ''
  return {
    title: pr.title,
    description: body,
    author: pr.author.login,
    headRef: pr.headRefName,
    baseRef: pr.baseRefName,
    labels: pr.labels.map((l) => l.name),
    draft: pr.isDraft,
    openedAt: pr.createdAt,
    commits: pr.commits.length,
    // Branch names are often lower-case (`qi-15531-trial-bar`); titles and bodies are not, so only the branch is upper-cased.
    tickets: extractTicketKeys(pr.title, pr.headRefName.toUpperCase(), body).map((key) => ({ key, title: null, url: null })),
  }
}
