import { Eyebrow } from '@/components/common/Eyebrow'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SkillsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The installed skills (cli/templates/skills, plus the repo's own worktree skill) per tab, in run order. */
const SKILL_GROUPS: readonly { title: string; skills: readonly { command: string; when: string }[] }[] = [
  {
    title: 'Worktrees',
    skills: [
      { command: '/qbd-worktree', when: 'Start, list or remove a worktree (qbdvision). New sessions there show on it.' },
      { command: 'Settings', when: 'Pick the folders Scout scans for worktrees.' },
    ],
  },
  {
    title: 'Development',
    skills: [
      { command: '/publish-review', when: 'Work done. Opens or refreshes the session.' },
      { command: '/apply-review <id>', when: 'After Submit. Fixes code, answers comments.' },
      { command: '/address-pr-comments', when: 'GitHub PR comments to handle.' },
      { command: '/run-app', when: 'Needs the app up. The skills call it too.' },
      { command: '/jira-snapshot <KEY>', when: 'Ticket into the session spec. The publish skills call it too.' },
    ],
  },
  {
    title: 'Test runs',
    skills: [
      { command: '/publish-test-plan <run>', when: 'Plan written. Scenarios + steps.' },
      { command: '/publish-data-setup <run>', when: 'Test data ready.' },
      { command: '/publish-test-run <run>', when: 'After /feature-test (it asks: new worktree or here). Results + evidence.' },
      { command: '/apply-test-review <id>', when: 'After Submit. Answers, re-runs.' },
    ],
  },
  {
    title: 'PR reviews',
    skills: [{ command: '/publish-pr-review <PR url>', when: 'Asks: new worktree or here. Summary, tags, Jira, findings + repro. Nothing posted to GitHub.' }],
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
            Install: <code className="font-mono text-xs text-ink">ai-review install --repo &lt;path&gt;</code>. Loop: publish → review → apply.
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
