import { effectiveVerdict, mergeComments, progress, sessionStatus, type CommentTarget, type CodeReviewDetail, type Resolutions, type Review } from '@scout/shared'

export type LandingSection = 'spec' | 'extras' | 'evidence' | 'files' | 'submit'

type ArtifactSection = Extract<LandingSection, 'spec' | 'extras' | 'evidence'>
const ARTIFACT_SECTIONS: readonly ArtifactSection[] = ['spec', 'extras', 'evidence']
const KIND: Record<ArtifactSection, CommentTarget['kind']> = { spec: 'spec', extras: 'extra', evidence: 'evidence' }

/**
 * The step a session opens on (the index route `/s/:id`):
 * - every file reviewed, or already sent with no open comments: `submit`;
 * - nothing done yet: the first of spec, extras, evidence, files that has content (`files` when all are empty);
 * - started: `files`, unless only spec/extras/evidence has comments, then the first of those with open comments.
 */
export function landingSection(detail: CodeReviewDetail, review: Review, resolutions: Resolutions | null = null): LandingSection {
  const { tree } = detail
  const comments = mergeComments(review, resolutions)
  const open = comments.filter((comment) => comment.status === 'open')
  const status = sessionStatus({ review, tree, resolutions })
  const { reviewed, total } = progress(review, tree, resolutions)

  if (status === 'ready' && total > 0 && reviewed === total) return 'submit'
  if ((status === 'sent' || status === 'approved') && open.length === 0) return 'submit'

  const hasVerdict = tree.files.some((file) => effectiveVerdict(review.files[file.path], file) !== 'none')
  const started = hasVerdict || comments.length > 0 || review.sent !== null || review.overall.decision !== 'undecided'
  if (!started) {
    const content: Record<ArtifactSection, number> = { spec: detail.spec.length, extras: detail.extras.length, evidence: detail.evidence.length }
    return ARTIFACT_SECTIONS.find((section) => content[section] > 0) ?? 'files'
  }

  const fileActivity = hasVerdict || open.some((comment) => comment.target.kind === 'file')
  if (fileActivity) return 'files'
  return ARTIFACT_SECTIONS.find((section) => open.some((comment) => comment.target.kind === KIND[section])) ?? 'files'
}

