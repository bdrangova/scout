# review-dash

A local dashboard for reviewing AI-written changes. It reads the repository's working tree live against
the base branch, shows every changed file as a review card next to the agent's evidence, spec, extras and
PR description, and sends your comments back to the Claude Code session that did the work. Nothing is
published or copied: what you see is what is on disk, and the view updates as files change.

The code diff is computed on demand from `git merge-base <base> HEAD`, so later commits on the base branch
never show up as reversed changes. The base defaults to `origin/master` (then `master`, `origin/main`,
`main`, `origin/HEAD`) and can be overridden per session with `ai-review init --base <ref>`.

## Store layout

Sessions live under `AI_REVIEW_HOME` (default `~/.ai-review`) in `sessions/<id>/`:

```
manifest.json           repo path, base ref, title, tickets; written by `ai-review init` only
evidence/               screenshots and recordings the agent drops here (optional index.json for captions, order)
extras/                 .md | .html | .mmd | .mermaid exports (optional index.json for titles)
spec/                   jira.md, plan.md, design.html ... (optional index.json)
pr-description.md       the PR text, optional
review/review.json      dashboard-owned live review state (verdicts pinned to file fingerprints, comments)
review/resolutions.json agent-owned answers, written by `ai-review resolve`
review/sent/<stem>.*    one immutable .json, .md and .patch per Submit
review/runs/            AgentRun records and raw stream-json logs
```

The full contract (schemas, derived status rules, routes) is `shared/README.md`.

## Creating a session

```
ai-review init --repo <path> [--base <ref>] [--title <title>] [--ticket KEY[=url]]
```

`init` writes `manifest.json` and prints the session id, folder and dashboard URL. The session appears in
the dashboard immediately with the live tree. From then on the agent works in the repo as usual and writes
its artifacts straight into the session folder (`evidence/`, `extras/`, `spec/`, `pr-description.md`); the
server watches the folder and the repo, so there is nothing to publish.

## Claude Code integration

`ai-review install` adds two skills and a hook to a repository:

- `/publish-review` creates (or refreshes) the session for the current branch with `ai-review init` and
  writes the artifacts into its folder.
- **Submit** in the dashboard snapshots the open comments and the working-tree diff into `review/sent/`
  and renders the feedback markdown the agent reads.
- `/apply-review` reads that feedback, fixes things in the working tree and answers each comment with
  `ai-review resolve`. A pending-feedback hook reminds the session when a send is waiting.
- The dashboard updates live: changed files get an `updated` chip (their verdict is pinned to the content
  it was given on), resolutions appear as they land, and the session status follows along.

Session status, in order: `agent-working` while a run is active; `updated` when a judged file changed since
its verdict or the agent answered after the send; `approved` when the last send approved and every file is
still effectively approved; `sent` (a decision was sent, shown as "Changes sent"); `ready` (every file reviewed, nothing sent); `in-progress`; `unreviewed`. Approved is only ever the result of sending Approve; the list summary carries the optional `lastSend` (`{ at, decision }`).

## Worktrees and the checkout runtime

Several checkouts of one repository (the main worktree plus linked `git worktree`s) can run their own app,
database and services at the same time, each on its own ports. Scout never guesses those ports. A repository
can tell it through one shell command that prints the checkout's runtime as JSON:

```
ai-review env --set-runtime '<command>'    # once, from a terminal; covers the main worktree and every linked one
ai-review env                               # what the skills read: worktree facts, a scratch folder, the runtime
```

The command runs inside the checkout being asked about and prints
`{ label?, apps?: [{ name, url, port? }], databases?: [{ engine, host?, port?, database?, compose?: { project, file?, service? }, container? }], services?: [...], start?, notes? }`.
`/run-app`, `/snapshot-db` and `/reproduce` use it before anything else; without one they fall back to the
project's own files and say that the ports were guessed. Snapshots and evidence that have no session go to the
checkout's scratch folder under `AI_REVIEW_HOME/checkouts/`, never inside the checkout, so removing a worktree
loses nothing. A session whose worktree was removed shows "Repository missing" with an Archive action.

## Development

- `npm install` installs every workspace (`shared`, `server`, `web`, `cli`) with one lockfile.
- `npm run fixture` builds the demo session and its git repo into `fixtures/store`.
- `npm run dev:fixtures` runs the server and the web app against the fixture store with the fake agent
  adapter. API on `http://127.0.0.1:4545` (`/api`), web on `http://127.0.0.1:4546` (proxies `/api`). Links the CLI and skills print use `http://scout.localhost:4546`.
  The `dashboard` entry in `.claude/launch.json` starts the same command for the Claude Code browser pane.
- `npm test` runs the vitest suites of every workspace; `npm run typecheck`, `npm run lint` and
  `npm run build` cover the rest.
- `npm run e2e` runs the Playwright smoke test against its own throwaway copy of the fixture store (built
  under the OS temp dir) and its own servers on 4745/4746, so it leaves `fixtures/store` and a running
  `dev:fixtures` alone.

## Further reading

- `shared/README.md`: Contract v2, the store and the derived status rules.
- `research/07-live-working-tree.md`: the decision to read the working tree live and its performance plan.
- `e2e/README.md`: what the smoke test covers and how it builds its isolated store.
