import { PatchDiff, type PatchDiffProps } from '@pierre/diffs/react'
import { useMemo } from 'react'

export type DiffStyle = 'unified' | 'split'

type DiffOptions = NonNullable<PatchDiffProps<undefined, undefined>['options']>

// Read-only diff: no line selection, no annotations. The card header shows the path, so the
// library's own file header is off; lines never wrap (horizontal scroll instead); the theme
// is pinned to light because the app is light-only (the diff must not follow the OS scheme).
const BASE_OPTIONS: DiffOptions = {
  overflow: 'scroll',
  themeType: 'light',
  disableFileHeader: true,
  hunkSeparators: 'line-info',
  lineDiffType: 'word',
}

interface FileDiffViewProps {
  /** The per-file slice of `diff.patch` (one `diff --git` section). */
  patch: string
  diffStyle: DiffStyle
}

/** The only place that renders `@pierre/diffs`. */
export function FileDiffView({ patch, diffStyle }: FileDiffViewProps) {
  const options = useMemo<DiffOptions>(() => ({ ...BASE_OPTIONS, diffStyle }), [diffStyle])
  return (
    <div className="text-[12.5px]" style={{ overflowAnchor: 'none' }} data-diff-style={diffStyle}>
      <PatchDiff patch={patch} options={options} />
    </div>
  )
}
