import type { ExtraItem, SpecItem } from '@scout/shared'
import { ClipboardList, Code, FileText, Globe, Workflow, type LucideIcon } from 'lucide-react'

export interface ItemKind {
  icon: LucideIcon
  label: string
}

/** How the rail and the grid name a spec source. */
export const SPEC_KIND: Record<SpecItem['type'], ItemKind> = {
  jira: { icon: ClipboardList, label: 'Jira ticket' },
  markdown: { icon: FileText, label: 'Markdown' },
  artifact: { icon: Globe, label: 'Exported artifact' },
}

/** How the cards, the rail and the grid name an extra. */
export const EXTRA_KIND: Record<ExtraItem['type'], ItemKind> = {
  markdown: { icon: FileText, label: 'Markdown' },
  mermaid: { icon: Workflow, label: 'Mermaid' },
  html: { icon: Code, label: 'HTML' },
}
