<p align="center">
  <img src="web/public/brand/scout-idle.gif" alt="Scout" width="360">
</p>

# Scout

A local dashboard for reviewing an AI agent's work. You see its changes, evidence and notes side by side,
approve or comment, and the feedback goes back to the Claude Code (or Codex) session that did the work. It reads
the repository's working tree live, so nothing needs republishing.

| Page | Shows |
|---|---|
| `/` Worktrees | Git worktrees in the folders picked in Settings, with branch, changes, PR and linked sessions |
| `/d` Development | Reviews of an agent's work on a branch |
| `/pr` PR review | An agent's findings on a pull request, which you edit before they become PR comments |
| `/t` Test runs | Feature-test runs: plan, data setup, videos, bugs and logs |

Press `?` for the skills, `Ctrl+?` for keyboard shortcuts.

## Setup

```
npm install
npm run build -w cli
node cli/dist/index.js install --repo <path to your repository>
npm run dev
```

`install` adds the skills and the feedback hook to the repository, registers the Playwright MCP and puts the
`ai-review` command in `~/.local/bin`. Rerun it after updating Scout. The dashboard runs on
**http://scout.localhost:4546** (API on 4545). Data lives in `~/.ai-review` (`AI_REVIEW_HOME`).

Skills only one repository needs go in `cli/templates/repos/<repo name>/`; `install` copies them only into a
repository whose `origin` has that name.

## Skills

| Skill | Does |
|---|---|
| `/publish-review` | Opens the review for the current branch with evidence, Jira ticket, plan and PR description |
| `/apply-review` | Applies the feedback you sent and answers every comment |
| `/address-pr-comments` | Brings the GitHub PR comments in, fixes the code and records how each was handled |
| `/publish-pr-review` | Publishes a PR review with reproduction evidence |
| `/publish-test-plan`, `/publish-data-setup`, `/publish-test-run` | Publish the parts of a feature-test run |
| `/apply-test-review` | Applies your verdicts and comments on a test run |
| `/journal` | Records why the code is the way it is |
| `/reproduce` | Reproduces one reported problem against the running app |
| `/run-app` | Makes sure this checkout's app is running |
| `/snapshot-db` | Saves and restores this checkout's local database around a data setup |

## How a review works

1. The agent runs `/publish-review`; the session appears in the dashboard.
2. You approve or reject files and comment, then **Submit**.
3. A hook tells the agent's session feedback is waiting; `/apply-review` fixes and answers each comment.
4. Changed files and answers show up live.

The diff is against the branch's merge base with `origin/master` (or `main`) unless set otherwise.

## Worktrees

Each checkout can run its own app and database on its own ports. A repository tells Scout those ports through
one command, set once from a terminal (agents can't set it):

```
ai-review env --set-runtime '<command that prints the checkout runtime as JSON>'
ai-review env    # what the skills read
```

`/run-app`, `/snapshot-db` and `/reproduce` use it; without it they guess and say so. Snapshots go to
`~/.ai-review/checkouts/`, never inside the checkout.

## Development

- `npm run dev:fixtures`: demo data on ports 4555/4556, next to the real Scout.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run e2e`.
- `/__kit` (dev only): UI parts and the mascot states.

More: `shared/README.md` (data format and status rules), `docs/pr-review.md`, `docs/journal.md`, `e2e/README.md`.
