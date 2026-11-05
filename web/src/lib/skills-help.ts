import type { PackHelpEntry } from '@scout/shared'

export interface SkillGroup {
  title: string
  skills: readonly { command: string; when: string }[]
}

/** The installed skills (cli/templates/skills) per tab, in run order. Registered packs add their own (`withPackHelp`). */
export const SKILL_GROUPS: readonly SkillGroup[] = [
  {
    title: 'Worktrees',
    skills: [
      { command: 'Settings', when: 'Pick the folders Scout scans for worktrees.' },
    ],
  },
  {
    title: 'Development',
    skills: [
      { command: '/scout-development-review', when: 'Work done. Opens or refreshes the session.' },
      { command: '/scout-apply-review <id>', when: 'After Submit. Fixes code, answers comments.' },
      { command: '/scout-pr-comments', when: 'GitHub PR comments to handle.' },
      { command: '/run-app', when: 'Needs the app up. The skills call it too.' },
      { command: '/jira-snapshot <KEY>', when: 'Ticket into the session spec. The publish skills call it too.' },
      { command: '/capture-evidence', when: 'Screenshots or video into the session. The skills call it too.' },
      { command: '/pr-description', when: 'Write or update the PR description. The skills call it too.' },
      { command: '/open-pr', when: 'Commit, push, open the PR. Apply review calls it on approve.' },
    ],
  },
  {
    title: 'Test runs',
    skills: [
      { command: '/scout-feature-test <feature>', when: 'Test in the browser (asks: new worktree or here). Records every scenario and publishes the run.' },
      { command: '/scout-test-plan <id>', when: 'Republish the plan. The feature test calls it.' },
      { command: '/scout-data-setup <id>', when: 'Republish the data setup. The feature test calls it.' },
      { command: '/scout-test-run <id>', when: 'Republish the results. The feature test calls it.' },
      { command: '/scout-apply-test-review <id>', when: 'After Submit. Answers, re-runs.' },
    ],
  },
  {
    title: 'PR reviews',
    skills: [{ command: '/scout-pr-review <PR url>', when: 'Asks: new worktree or here. Summary, tags, Jira, findings + repro. Nothing posted to GitHub.' }],
  },
]

/** Pack entries go first in a group of the same title (case-insensitive); other groups are added at the end. */
export function withPackHelp(groups: readonly SkillGroup[], entries: readonly PackHelpEntry[]): SkillGroup[] {
  const result = groups.map((g) => ({ ...g, skills: [...g.skills] }))
  for (const entry of entries) {
    const skill = { command: entry.command, when: entry.when }
    const group = result.find((g) => g.title.toLowerCase() === entry.group.toLowerCase())
    if (group === undefined) result.push({ title: entry.group, skills: [skill] })
    else if (!group.skills.some((s) => s.command === entry.command)) group.skills = [...group.skills.filter((s) => s.command.startsWith('/')), skill, ...group.skills.filter((s) => !s.command.startsWith('/'))]
  }
  return result
}
