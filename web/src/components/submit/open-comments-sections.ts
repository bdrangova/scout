import { effectiveVerdict, type CommentWithStatus, type Review, type SessionDetail } from '@review-dash/shared'
import { encodePath, splitPath } from '@/lib/paths'
import type { PrThread } from '@/lib/pr-threads'
import { fileChip, formatVerdictSummary, verdictSummary, type FileChip } from './verdict-summary'

export type SectionKey = 'overall' | 'files' | 'evidence' | 'spec' | 'extras'

/** The live tree and the artifact lists, for labels, verdict chips and links. */
export type SectionDetail = Pick<SessionDetail, 'tree' | 'evidence' | 'extras' | 'spec'>

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

function fileGroups(comments: CommentWithStatus[], prThreads: readonly PrThread[], review: Review, detail: SectionDetail): TargetGroup[] {
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

/**
 * The comments grouped by section and target: Overall (resolved ones only, the open one is edited
 * in the feedback box, plus the PR comments that name no file), Files (with the verdict chip and the one-line
 * summary; PR threads join their file's group), Evidence, Spec, Extras. `prThreads` are what is visible.
 */
export function commentSections(comments: CommentWithStatus[], review: Review, detail: SectionDetail, prThreads: readonly PrThread[] = []): Section[] {
  const overall = comments.filter((comment) => comment.target.kind === 'overall' && comment.status === 'resolved')
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

  const general = prThreads.filter((thread) => thread.root.path === null)
  const overallGroups: TargetGroup[] = []
  if (overall.length > 0) overallGroups.push({ key: 'overall', label: 'Overall feedback', to: '.', chip: null, comments: overall, prThreads: [] })
  if (general.length > 0) overallGroups.push({ key: 'pr-general', label: 'On the pull request', to: '.', chip: null, comments: [], prThreads: general })

  const sections: Section[] = [
    { key: 'overall', heading: 'Overall', summary: null, groups: overallGroups },
    { key: 'files', heading: 'Files', summary: formatVerdictSummary(verdictSummary(review, detail.tree)), groups: fileGroups(comments, prThreads, review, detail) },
    { key: 'evidence', heading: 'Evidence', summary: null, groups: evidence },
    { key: 'spec', heading: 'Spec', summary: null, groups: spec },
    { key: 'extras', heading: 'Extras', summary: null, groups: extras },
  ]
  return sections.filter((section) => section.groups.length > 0)
}
