import { describe, expect, it } from 'vitest'
import { SKILL_GROUPS, withPackHelp } from './skills-help'

describe('withPackHelp', () => {
  it('lists no repository-specific skill without packs', () => {
    expect(withPackHelp(SKILL_GROUPS, [])).toEqual(SKILL_GROUPS)
    expect(JSON.stringify(SKILL_GROUPS)).not.toMatch(/qbd/i)
  })

  it('puts a pack command before the non-command rows of its group, once, and adds unknown groups at the end', () => {
    const entry = { group: 'worktrees', command: '/acme-worktree', when: 'Start one.' }
    const groups = withPackHelp(SKILL_GROUPS, [entry, entry, { group: 'Acme', command: '/acme-data', when: 'Seed.' }])
    expect(groups[0]?.skills.map((s) => s.command)).toEqual(['/acme-worktree', 'Settings'])
    expect(groups.at(-1)).toEqual({ title: 'Acme', skills: [{ command: '/acme-data', when: 'Seed.' }] })
    expect(SKILL_GROUPS[0]?.skills.map((s) => s.command)).toEqual(['Settings'])
  })
})
