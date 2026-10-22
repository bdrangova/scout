import { effectiveVerdict, type CommentWithStatus, type CodeReviewDetail, type Review, type TestRunDetail } from '@review-dash/shared'
import { encodePath, splitPath } from '@/lib/paths'
import type { PrThread } from '@/lib/pr-threads'
import { fileChip, formatVerdictSummary, verdictSummary, type FileChip } from './verdict-summary'

export type SectionKey = 'overall' | 'files' | 'evidence' | 'spec' | 'extras' | 'scenarios' | 'bugs' | 'logs'

/** The live tree and the artifact lists, for labels, verdict chips and links. */
export type CodeReviewSectionDetail = Pick<CodeReviewDetail, 'tree' | 'evidence' | 'extras' | 'spec'> & { kind?: 'code-review' }

/** The live scenarios and the index's bugs and logs of a test run, for labels, verdict chips and links. */
export type TestRunSectionDetail = Pick<TestRunDetail, 'kind' | 'scenarios'> & { index: Pick<TestRunDetail['index'], 'bugs' | 'logs'> }

export type SectionDetail = CodeReviewSectionDetail | TestRunSectionDetail

/** The run refs of a scenario's videos, screenshots and data files: the files a `run-file` comment can name. */
export function evidenceRefsOf(scenario: TestRunSectionDetail['scenarios'][number]): string[] {
  const { videos, screenshots, data } = scenario.evidence
  return [...videos, ...screenshots, ...data].map((item) => item.path)
}

export function isTestRunSection(detail: SectionDetail): detail is TestRunSectionDetail {
  return detail.kind === 'test-run'
}

export interface TargetGroup {
  key: string
  label: string
  /** Where the comment was made (the file, the evidence item, the extra, the spec item), relative to the page. */
  to: string
  chip: FileChip | null
  comments: CommentWithStatus[]
  /** GitHub PR threads shown here, informational (never part of the send). */
  prThreads: PrThread[]
}

export interface Section {
  key: SectionKey
  heading: string
  summary: string | null
  groups: TargetGroup[]
}

function byTarget(comments: CommentWithStatus[], kind: CommentWithStatus['target']['kind']): Map<string, CommentWithStatus[]> {
  const map = new Map<string, CommentWithStatus[]>()
  for (const comment of comments) {
    if (comment.target.kind !== kind) continue
    const ref = comment.target.ref ?? ''
    const list = map.get(ref) ?? []
    list.push(comment)
    map.set(ref, list)
  }
  return map
}

function prThreadsByPath(threads: readonly PrThread[]): Map<string, PrThread[]> {
  const map = new Map<string, PrThread[]>()
  for (const thread of threads) {
    const path = thread.root.path
    if (path === null) continue
    map.set(path, [...(map.get(path) ?? []), thread])
  }
  return map
}

function fileGroups(comments: CommentWithStatus[], prThreads: readonly PrThread[], review: Review, detail: CodeReviewSectionDetail): TargetGroup[] {
  const files = byTarget(comments, 'file')
  const prFiles = prThreadsByPath(prThreads)
  const groups: TargetGroup[] = []
  const known = new Set<string>()
  for (const file of detail.tree.files) {
    const list = files.get(file.path) ?? []
    const pr = prFiles.get(file.path) ?? []
    if (list.length === 0 && pr.length === 0) continue
    known.add(file.path)
    groups.push({
      key: file.path,
      label: splitPath(file.path).name,
      to: `../files/${encodePath(file.path)}`,
      chip: fileChip(effectiveVerdict(review.files[file.path], file), list),
      comments: list,
      prThreads: pr,
    })
  }
  // Comments on files that have since left the working tree keep their place, without a link to a card.
  for (const path of new Set([...files.keys(), ...prFiles.keys()])) {
    if (known.has(path)) continue
    const list = files.get(path) ?? []
    groups.push({ key: path, label: path, to: '../files', chip: fileChip('none', list), comments: list, prThreads: prFiles.get(path) ?? [] })
  }
  return groups
}

function overallGroups(comments: CommentWithStatus[], prThreads: readonly PrThread[]): TargetGroup[] {
  const overall = comments.filter((comment) => comment.target.kind === 'overall' && comment.status === 'resolved')
  const general = prThreads.filter((thread) => thread.root.path === null)
  const groups: TargetGroup[] = []
  if (overall.length > 0) groups.push({ key: 'overall', label: 'Overall feedback', to: '.', chip: null, comments: overall, prThreads: [] })
  if (general.length > 0) groups.push({ key: 'pr-general', label: 'On the pull request', to: '.', chip: null, comments: [], prThreads: general })
  return groups
}

/**
 * A test run's comments: Overall (as for a code review), Scenarios (in index order, with the verdict chip and
 * the verdict summary; comments on a scenario's screenshots and data files are in its group), Bugs and Logs (by the name the index gives them). Targets that left the index keep their place under their ref.
 */
function testRunSections(comments: CommentWithStatus[], review: Review, detail: TestRunSectionDetail): Section[] {
  // A comment on a screenshot or data file is listed under the scenario that holds the file (in the order it was written).
  const owner = new Map<string, string>()
  for (const scenario of detail.scenarios) for (const ref of evidenceRefsOf(scenario)) if (!owner.has(ref)) owner.set(ref, scenario.id)
  const byScenario = new Map<string, CommentWithStatus[]>()
  const strays = new Map<string, CommentWithStatus[]>()
  const add = (map: Map<string, CommentWithStatus[]>, key: string, comment: CommentWithStatus) => map.set(key, [...(map.get(key) ?? []), comment])
  for (const comment of comments) {
    const { kind, ref } = comment.target
    if (ref === null) continue
    if (kind === 'scenario') add(byScenario, ref, comment)
    else if (kind === 'run-file') {
      const id = owner.get(ref)
      if (id === undefined) add(strays, ref, comment)
      else add(byScenario, id, comment)
    }
  }
  const scenarios: TargetGroup[] = []
  for (const scenario of detail.scenarios) {
    const list = byScenario.get(scenario.id)
    if (!list) continue
    byScenario.delete(scenario.id)
    scenarios.push({
      key: scenario.id,
      label: scenario.title,
      to: `../review/${encodePath(scenario.id)}`,
      chip: fileChip(effectiveVerdict(review.files[scenario.id], { path: scenario.id, fingerprint: scenario.fingerprint }), list),
      comments: list,
      prThreads: [],
    })
  }
  for (const [id, list] of byScenario) scenarios.push({ key: id, label: id, to: '../review', chip: fileChip('none', list), comments: list, prThreads: [] })
  for (const [ref, list] of strays) scenarios.push({ key: ref, label: splitPath(ref).name, to: '../review', chip: null, comments: list, prThreads: [] })

  const bugs = [...byTarget(comments, 'bug')].map(([slug, list]): TargetGroup => ({
    key: slug,
    label: detail.index.bugs?.find((bug) => bug.slug === slug)?.title ?? slug,
    to: '../gaps',
    chip: null,
    comments: list,
    prThreads: [],
  }))
  const logs = [...byTarget(comments, 'log')].map(([ref, list]): TargetGroup => ({
    key: ref,
    label: detail.index.logs?.find((log) => log.path === ref)?.label ?? ref,
    to: '../logs',
    chip: null,
    comments: list,
    prThreads: [],
  }))

  const sections: Section[] = [
    { key: 'overall', heading: 'Overall', summary: null, groups: overallGroups(comments, []) },
    { key: 'scenarios', heading: 'Scenarios', summary: formatVerdictSummary(verdictSummary(review, { files: detail.scenarios.map((scenario) => ({ path: scenario.id, fingerprint: scenario.fingerprint })) })), groups: scenarios },
    { key: 'bugs', heading: 'Bugs', summary: null, groups: bugs },
    { key: 'logs', heading: 'Logs', summary: null, groups: logs },
  ]
  return sections.filter((section) => section.groups.length > 0)
}

/**
 * The comments grouped by section and target: Overall (resolved ones only, the open one is edited
 * in the feedback box, plus the PR comments that name no file), Files (with the verdict chip and the one-line
 * summary; PR threads join their file's group), Evidence, Spec, Extras. `prThreads` are what is visible.
 */
export function commentSections(comments: CommentWithStatus[], review: Review, detail: SectionDetail, prThreads: readonly PrThread[] = []): Section[] {
  if (isTestRunSection(detail)) return testRunSections(comments, review, detail)
  const evidence = [...byTarget(comments, 'evidence')].map(([path, list]): TargetGroup => ({
    key: path,
    label: detail.evidence.find((item) => item.path === path)?.caption ?? path,
    to: `../evidence/${encodePath(path)}`,
    chip: null,
    comments: list,
    prThreads: [],
  }))
  const spec = [...byTarget(comments, 'spec')].map(([path, list]): TargetGroup => ({
    key: path,
    label: detail.spec.find((item) => item.path === path)?.title ?? path,
    to: '../spec',
    chip: null,
    comments: list,
    prThreads: [],
  }))
  const extras = [...byTarget(comments, 'extra')].map(([path, list]): TargetGroup => ({
    key: path,
    label: detail.extras.find((item) => item.path === path)?.title ?? path,
    to: '../extras',
    chip: null,
    comments: list,
    prThreads: [],
  }))

  const sections: Section[] = [
    { key: 'overall', heading: 'Overall', summary: null, groups: overallGroups(comments, prThreads) },
    { key: 'files', heading: 'Files', summary: formatVerdictSummary(verdictSummary(review, detail.tree)), groups: fileGroups(comments, prThreads, review, detail) },
    { key: 'evidence', heading: 'Evidence', summary: null, groups: evidence },
    { key: 'spec', heading: 'Spec', summary: null, groups: spec },
    { key: 'extras', heading: 'Extras', summary: null, groups: extras },
  ]
  return sections.filter((section) => section.groups.length > 0)
}
