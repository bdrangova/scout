import type { PackHelpEntry, PacksResponse } from '@scout/shared'
import { useEffect, useState } from 'react'
import { Eyebrow } from '@/components/common/Eyebrow'
import { apiGet } from '@/lib/api'
import { SKILL_GROUPS, withPackHelp } from '@/lib/skills-help'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SkillsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Help entries of the registered packs, fetched when the dialog opens; none on error. */
function usePackHelp(open: boolean): PackHelpEntry[] {
  const [entries, setEntries] = useState<PackHelpEntry[]>([])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    apiGet<PacksResponse>('/packs').then(
      (body) => {
        if (!cancelled) setEntries(body.packs.flatMap((p) => p.help))
      },
      () => {
        if (!cancelled) setEntries([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [open])
  return entries
}

/** How to use the skills, styled like `ShortcutHelp`; opened from the sessions bar. */
export function SkillsHelp({ open, onOpenChange }: SkillsHelpProps) {
  const groups = withPackHelp(SKILL_GROUPS, usePackHelp(open))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Skills</DialogTitle>
          <DialogDescription>
            Install: <code className="font-mono text-xs text-ink">ai-review install --repo &lt;path&gt;</code>. Loop: publish → review → apply.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
              <Eyebrow as="h3">{group.title}</Eyebrow>
              <dl className="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-[13px] max-sm:grid-cols-1 max-sm:gap-y-0.5">
                {group.skills.map((skill) => (
                  <div key={skill.command} className="contents">
                    <dt className="m-0 font-mono text-xs font-bold text-ink max-sm:mt-1.5">{skill.command}</dt>
                    <dd className="m-0 font-medium text-ink-muted">{skill.when}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
