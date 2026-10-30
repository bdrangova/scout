import type { ChangeTag } from '@scout/shared'
import { BookOpen, Bug, Cloud, Database, FlaskConical, Hammer, Monitor, Package, Server, ShieldAlert, Shuffle, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
import type { TagProps } from '@/components/ui/tag'

export interface ChangeTagLook {
  label: string
  icon: LucideIcon
  tone: NonNullable<TagProps['tone']>
  /** The tooltip: when a review gives the tag. */
  hint: string
}

/** One look per tag for every module: kinds in solid colours, areas tinted, security in red. */
export const CHANGE_TAG_LOOK: Record<ChangeTag, ChangeTagLook> = {
  feature: { label: 'Feature', icon: Sparkles, tone: 'mint', hint: 'Adds something people can use' },
  fix: { label: 'Fix', icon: Bug, tone: 'coral', hint: 'Corrects behaviour that was wrong' },
  refactor: { label: 'Refactor', icon: Shuffle, tone: 'blue', hint: 'Restructures code without changing what it does' },
  chore: { label: 'Chore', icon: Wrench, tone: 'sunken', hint: 'Upkeep: renames, cleanup, config' },
  docs: { label: 'Docs', icon: BookOpen, tone: 'yellow', hint: 'Documentation only' },
  tests: { label: 'Tests', icon: FlaskConical, tone: 'pink', hint: 'Adds or changes tests' },
  security: { label: 'Security', icon: ShieldAlert, tone: 'err', hint: 'Touches sign-in, permissions, secrets or user data exposure' },
  frontend: { label: 'Frontend', icon: Monitor, tone: 'info', hint: 'Changes what runs in the browser' },
  backend: { label: 'Backend', icon: Server, tone: 'info', hint: 'Changes what runs on the server' },
  database: { label: 'Database', icon: Database, tone: 'info', hint: 'Changes the schema, migrations or stored data' },
  infra: { label: 'Infra', icon: Cloud, tone: 'warn', hint: 'Changes deployment, CI or environments' },
  build: { label: 'Build', icon: Hammer, tone: 'warn', hint: 'Changes the build system or tooling' },
  dependencies: { label: 'Dependencies', icon: Package, tone: 'neutral', hint: 'Adds, removes or upgrades packages' },
}
