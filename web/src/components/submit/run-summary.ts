import type { TestRunDetail } from '@scout/shared'

/** The summary text of a run: the overview's markdown panel titled like a summary, else its first markdown panel. */
export function runSummaryMarkdown(index: TestRunDetail['index']): { title: string; markdown: string } | null {
  const panels = index.overview.flatMap((panel) => (panel.type === 'markdown' ? [panel] : []))
  const panel = panels.find((candidate) => /summary/i.test(candidate.title ?? '')) ?? panels[0]
  return panel ? { title: panel.title ?? 'Summary', markdown: panel.markdown } : null
}
