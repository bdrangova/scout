import type { Comment } from '../schemas/review.ts'
import type { TestRunSentSnapshot } from '../schemas/sent.ts'
import type { TestRunIndex } from '../schemas/test-run.ts'
import { formatLineAnchor } from './line-anchor.ts'
import { decisionLabel, formatTimestamp, groupByRef, orderedRefs, requiredResponseText, trimTrailingSlash } from './markdown-helpers.ts'

/** What the renderer needs besides the snapshot: the run title, the dashboard origin and the index (bug and log names). */
export interface TestRunMarkdownContext {
  title: string
  /** e.g. `http://scout.localhost:4546` */
  dashboardUrl: string
  index: Pick<TestRunIndex, 'bugs' | 'logs'> & {
    /** Names the scenario a screenshot or data file belongs to; without it those comments are listed under `## Files`. */
    scenarios?: readonly { id: string; evidence: Pick<TestRunIndex['scenarios'][number]['evidence'], 'videos' | 'screenshots' | 'data'> }[]
  }
}

/** The scenario id by the run ref of each of its files. */
function scenarioByFile(scenarios: NonNullable<TestRunMarkdownContext['index']['scenarios']>): Map<string, string> {
  const map = new Map<string, string>()
  for (const scenario of scenarios) {
    for (const item of [...scenario.evidence.videos, ...scenario.evidence.screenshots, ...scenario.evidence.data]) {
      if (!map.has(item.path)) map.set(item.path, scenario.id)
    }
  }
  return map
}

/**
 * `- [c3] at 0:42 **[incorrect]** body`; a log comment reads `- [c3] logs/run.log:12 **[kind]** body`, a comment on a
 * screenshot or data file names it: ``- [c3] `run:scenarios/s1/01.png` **[kind]** body``.
 * Continuation lines of a multi-line body are quoted under the bullet.
 */
function commentLines(comment: Comment): string[] {
  const at = comment.timestampSec === null ? '' : ` at ${formatTimestamp(comment.timestampSec)}`
  const anchor = comment.target.anchor
  const where =
    anchor !== undefined ? ` ${comment.target.ref}:${formatLineAnchor(anchor)}` : comment.target.kind === 'run-file' ? ` \`${comment.target.ref}\`` : ''
  const kind = comment.kind === undefined ? '' : ` **[${comment.kind}]**`
  const [first = '', ...rest] = comment.body.replaceAll('\r\n', '\n').trim().split('\n')
  return [`- [${comment.id}]${at}${where}${kind} ${first}`, ...rest.map((line) => (line === '' ? '  >' : `  > ${line}`))]
}

/**
 * Renders a test-run snapshot to the markdown the agent reads (`review/sent/<stem>.md`, `scout feedback`).
 * Scenarios appear only with a verdict or a comment. Deterministic: `\n` line endings, one trailing newline,
 * empty sections omitted.
 */
export function renderTestRunSentMarkdown(sent: TestRunSentSnapshot, ctx: TestRunMarkdownContext): string {
  const sections: string[] = []

  sections.push(
    [
      `# Test review feedback — ${ctx.title} (${sent.sessionId})`,
      `Sent: ${sent.sentAt} · Decision: **${decisionLabel(sent.decision)}** · Dashboard: ${trimTrailingSlash(ctx.dashboardUrl)}/t/${sent.sessionId}/review`,
      `Run: \`${sent.run.path}\``,
    ].join('\n'),
  )

  const overall = sent.comments.filter((comment) => comment.target.kind === 'overall')
  if (overall.length > 0) {
    sections.push(['## Overall', ...overall.flatMap(commentLines)].join('\n'))
  }

  const scenarioComments = groupByRef(sent.comments, 'scenario')
  const owner = scenarioByFile(ctx.index.scenarios ?? [])
  const fileComments = new Map<string, Comment[]>()
  const strayFileComments: Comment[] = []
  for (const comment of sent.comments) {
    if (comment.target.kind !== 'run-file' || comment.target.ref === null) continue
    const id = owner.get(comment.target.ref)
    if (id === undefined) strayFileComments.push(comment)
    else fileComments.set(id, [...(fileComments.get(id) ?? []), comment])
  }
  const known = new Map(sent.scenarios.map((scenario) => [scenario.id, scenario]))
  const listed = orderedRefs(scenarioComments, sent.scenarios.map((scenario) => scenario.id)).concat(
    sent.scenarios
      .filter((scenario) => (scenario.verdict !== 'none' || fileComments.has(scenario.id)) && !scenarioComments.has(scenario.id))
      .map((scenario) => scenario.id),
  )
  const ordered = [...sent.scenarios.map((scenario) => scenario.id).filter((id) => listed.includes(id)), ...listed.filter((id) => !known.has(id))]
  if (ordered.length > 0) {
    const { counts } = sent
    const lines = [
      `## Scenarios (${counts.rejected} rejected, ${counts.approved} approved, ${counts.commented} commented, ${counts.unreviewed} not reviewed)`,
    ]
    for (const id of ordered) {
      const scenario = known.get(id)
      lines.push(`### ${id} · ${scenario?.title ?? 'unknown scenario'}`)
      if (scenario) lines.push(`Verdict: **${scenario.verdict.toUpperCase()}** · Status: ${scenario.status}`)
      for (const comment of scenarioComments.get(id) ?? []) lines.push(...commentLines(comment))
      for (const comment of fileComments.get(id) ?? []) lines.push(...commentLines(comment))
    }
    sections.push(lines.join('\n'))
  }

  if (strayFileComments.length > 0) {
    sections.push(['## Files', ...strayFileComments.flatMap(commentLines)].join('\n'))
  }

  const bugComments = groupByRef(sent.comments, 'bug')
  if (bugComments.size > 0) {
    const bugs = ctx.index.bugs ?? []
    const lines = ['## Bugs']
    for (const slug of orderedRefs(bugComments, bugs.map((bug) => bug.slug))) {
      const title = bugs.find((bug) => bug.slug === slug)?.title
      lines.push(title === undefined ? `### ${slug}` : `### ${slug} — ${title}`)
      for (const comment of bugComments.get(slug) ?? []) lines.push(...commentLines(comment))
    }
    sections.push(lines.join('\n'))
  }

  const logComments = groupByRef(sent.comments, 'log')
  if (logComments.size > 0) {
    const logs = ctx.index.logs ?? []
    const lines = ['## Logs']
    for (const path of orderedRefs(logComments, logs.map((log) => log.path))) {
      const label = logs.find((log) => log.path === path)?.label
      lines.push(label === undefined ? `### ${path}` : `### ${path} — ${label}`)
      for (const comment of logComments.get(path) ?? []) lines.push(...commentLines(comment))
    }
    sections.push(lines.join('\n'))
  }

  sections.push(['## Required response', requiredResponseText(sent.sessionId, null)].join('\n'))

  return `${sections.join('\n\n')}\n`
}
