import { Eyebrow } from '@/components/common/Eyebrow'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SkillsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The installed skills (cli/templates/skills) per session tab, in run order. */
const SKILL_GROUPS: readonly { title: string; skills: readonly { command: string; when: string }[] }[] = [
  {
    title: 'Development',
    skills: [
      { command: '/publish-review', when: 'Work done. Opens or refreshes the session.' },
      { command: '/apply-review <id>', when: 'After Submit. Fixes code, answers comments.' },
      { command: '/address-pr-comments', when: 'GitHub PR comments to handle.' },
    ],
  },
  {
    title: 'Test runs',
    skills: [
      { command: '/publish-test-plan <run>', when: 'Plan written. Scenarios + steps.' },
      { command: '/publish-data-setup <run>', when: 'Test data ready.' },
      { command: '/publish-test-run <run>', when: 'After /feature-test. Results + evidence.' },
      { command: '/apply-test-review <id>', when: 'After Submit. Answers, re-runs.' },
    ],
  },
  {
    title: 'PR review',
    skills: [{ command: '/publish-pr-review <PR url>', when: 'Findings + repro. Nothing posted to GitHub.' }],
  },
]

/** How to use the skills, styled like `ShortcutHelp`; opened from the sessions bar. */
export function SkillsHelp({ open, onOpenChange }: SkillsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Skills</DialogTitle>
          <DialogDescription>
            Install once per repo: <code className="font-mono text-xs text-ink">ai-review install --repo &lt;path&gt;</code>. Run in Claude Code. Loop: publish → review + Submit → apply → repeat.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {SKILL_GROUPS.map((group) => (
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
