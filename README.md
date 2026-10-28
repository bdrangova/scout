<p align="center">
  <img src="web/public/brand/scout-idle.gif" alt="Scout, the review-dash mascot, idling" width="360">
</p>

# Scout (review-dash)

A local dashboard for reviewing AI-written work. It shows the agent's changes, evidence and notes next to each
other, lets you approve, reject and comment, and sends your feedback back to the Claude Code (or Codex) session
that did the work. Nothing is published or copied: what you see is the repository's working tree on disk, read
live, and the view updates as files change.

It covers four kinds of work:

| Page | What it shows |
|---|---|
| `/` **Worktrees** | Every git worktree in the folders you pick in Settings: branch, ticket, changes against the base, ahead/behind, uncommitted files, PR and linked sessions. A worktree page has copy-ready commands to start a session there, and Delete (refused with uncommitted changes; linked sessions are archived first). |
| `/d` **Development** | Code-review sessions for work an agent did on a branch (`/publish-review`). |
| `/pr` **PR review** | Reviews of a GitHub pull request: an agent's findings with reproduction evidence, which you accept, edit or drop before they become PR comments (`/publish-pr-review`). |
| `/t` **Test runs** | Feature-test runs: plan, data setup, per-scenario videos and screenshots, bugs and logs (`/publish-test-plan`, `/publish-data-setup`, `/publish-test-run`). |

A session (`/s/<id>`, or `/t/<id>` for a test run) has a file tree with a diff per file (swipe, scroll or
grid), commit scopes, content search, evidence with a full-screen focus mode, spec, extras, Scout's journal
and a Submit page. Lists have search, status filters, list or grid layouts and an archive. Press `?` for the
skills and `Ctrl+?` for the keyboard shortcuts.

## Getting started

```
npm install
npm run build -w cli
node cli/dist/index.js install --repo <path to your repository>
npm run dev
```

`install` adds the skills and the pending-feedback hook to the repository, registers the Playwright MCP (user
scope), and puts an `ai-review` launcher on your PATH (`~/.local/bin`). `npm run dev` starts the API on 4545
and the dashboard on **http://scout.localhost:4546**. Sessions live under `AI_REVIEW_HOME` (default
`~/.ai-review`).

Then, in a Claude Code session in that repository, run `/publish-review` when the work is ready.

## Skills

`ai-review install --repo <path>` installs these into `.claude/skills/` (several also into `.agents/skills/` for
Codex). Rerun it after updating Scout; unchanged files are left alone.

| Skill | Does |
|---|---|
| `/publish-review` | Opens or refreshes the session for the current branch and fills it: evidence, Jira snapshot, plan, extras, PR description. |
| `/apply-review` | Reads the feedback you sent, changes the code and answers every comment. |
| `/address-pr-comments` | Syncs the GitHub PR's comments (people and bots) into the session, fixes the code and records how each was handled. |
| `/publish-pr-review` | Publishes a PR review: findings plus reproduction evidence, optionally in a fresh worktree. |
| `/publish-test-plan`, `/publish-data-setup`, `/publish-test-run` | Publish the parts of a feature-test run to `/t/<id>`. |
| `/apply-test-review` | Applies your verdicts and comments on a test run, rerunning scenarios when needed. |
| `/journal` | Writes Scout's journal: why the code is the way it is, per decision. |
| `/reproduce` | Reproduces one reported problem against this checkout's running app, with real evidence. |
| `/run-app` | Makes sure this checkout's app is running; never stops another checkout's server. |
| `/snapshot-db` | Checkpoints and restores this checkout's local database around a reproduction's data setup. |

Skills that only make sense in one repository live in `cli/templates/repos/<name>/`, laid out as paths inside
that repository. `install` copies them only when the repository's `origin` is named `<name>` (for example
`repos/qbdvision/` for `…/qbdvision.git`), keeping executable bits; other repositories never get them.

## The review loop

```
ai-review init --repo <path> [--base <ref>] [--title <title>] [--ticket KEY[=url]] [--kind code-review|test-run|pr-review]
```

`init` (normally run by a publish skill) writes the session's `manifest.json` and prints its id, folder and URL.
The agent keeps working in the repository and writes its artifacts straight into the session folder; the
server watches both, so there is nothing to publish again.

- The diff is computed on demand from `git merge-base <base> HEAD`, so later commits on the base branch never
  show up as reversed changes. The base defaults to `origin/master` (then `master`, `origin/main`, `main`,
  `origin/HEAD`).
- **Submit** snapshots your open comments and the working-tree diff into `review/sent/` and renders the
  feedback markdown the agent reads. A hook reminds the agent's session when feedback is waiting.
- The agent answers each comment with `ai-review resolve`. Changed files get an `updated` chip (a verdict is
  pinned to the content it was given on), answers appear as they land, and the status follows along.

Session status, in order: `agent-working` while a run is active; `updated` when a judged file changed since its
verdict or the agent answered after the send; `approved` when the last send approved and every file is still
effectively approved; `sent` (shown as "Changes sent"); `ready` (every file reviewed, nothing sent);
`in-progress`; `unreviewed`.

### PR reviews

A PR review session reviews someone's pull request in a dedicated checkout. Any review skill can write the
report (`ai-review pr-report schema` prints its format); `ai-review pr-report import` validates it against git,
copies and hashes its evidence (screenshots, videos up to 200 MB, logs) and keeps every version. Your decisions
on the proposed comments survive refreshes, but a changed report or diff asks you to approve again. See
`docs/pr-review.md`.

### Scout's journal

The agent records non-obvious choices while it works (`ai-review journal add`), and `/publish-review` fills the
gaps. You read them per file, inline on the diff, and as a timeline on the Journal page; replying to a note
creates a normal comment. See `docs/journal.md`.

### Test runs

A test run reads a feature-test run folder (`plans/**/test-runs/<run>/`) live through its `test-run.json` index.
You give each scenario a verdict and comment on scenarios, bugs and logs; `/apply-test-review` acts on them.

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
It can only be set from a terminal, never by an agent. `/run-app`, `/snapshot-db` and `/reproduce` use it before
anything else; without one they fall back to the project's own files and say the ports were guessed.

Snapshots and evidence that have no session go to the checkout's scratch folder under
`AI_REVIEW_HOME/checkouts/`, never inside the checkout, so removing a worktree loses nothing. A session whose
worktree was removed shows "Repository missing" with an Archive action.

## Store layout

`AI_REVIEW_HOME` (default `~/.ai-review`):

```
config.json                       dashboard port, Settings (worktree folders), per-repo runtime commands, trusted PR authors
sessions/<id>/manifest.json       repo path, base ref, title, tickets, kind; written by `ai-review init` only
sessions/<id>/evidence/           screenshots and recordings (optional index.json for captions, order)
sessions/<id>/extras/             .md | .html | .mmd | .mermaid exports (optional index.json)
sessions/<id>/spec/               jira.md, plan.md, design.html ... (optional index.json)
sessions/<id>/pr-description.md   the PR text, optional
sessions/<id>/pr-review.json      PR reviews: the active report (versions under review/pr-reports/)
sessions/<id>/review/review.json  dashboard-owned live review state (verdicts pinned to file fingerprints, comments)
sessions/<id>/review/resolutions.json, pr-resolutions.json, journal.json   agent-owned, written by the CLI
sessions/<id>/review/pr-comments.json   the PR and its GitHub comments (`ai-review pr-sync`)
sessions/<id>/review/sent/<stem>.*      one immutable .json, .md and .patch per Submit
sessions/<id>/review/runs/        agent run records and raw stream-json logs
archive/<id>/                     archived sessions (same folder, moved), deletable for good
checkouts/<name>-<hash>/          per-checkout scratch: snapshots and evidence outside any session
```

The full contract (schemas, derived status rules, routes) is `shared/README.md`.

## Development

- `npm install` installs every workspace (`shared`, `server`, `web`, `cli`) with one lockfile.
- `npm run dev` runs the real Scout (API 4545, web 4546) on `~/.ai-review`.
- `npm run fixture` builds the demo session and its git repo into `fixtures/store`; `npm run fixture:pr-review`
  adds a PR review.
- `npm run dev:fixtures` runs the server and the web app against the fixture store with the fake agent
  adapter, on 4555 (API) and 4556 (web), so it runs next to the real Scout. The `dashboard` entry in
  `.claude/launch.json` starts the same command for the Claude Code browser pane.
- `npm test` runs the vitest suites of every workspace; `npm run typecheck`, `npm run lint` and `npm run build`
  cover the rest.
- `npm run e2e` runs the Playwright smoke tests against a throwaway copy of the fixture store (under the OS temp
  dir) and their own servers on 4745/4746, so `fixtures/store` and a running `dev:fixtures` are left alone.
- `/__kit` (dev only) shows the UI primitives and the three mascot states; `web/src/components/brand/ASSETS.md`
  explains how the mascot animations were prepared.

## Further reading

- `shared/README.md`: the contract, the store and the derived status rules.
- `docs/pr-review.md`: PR review sessions and the report format.
- `docs/journal.md`: Scout's journal.
- `research/07-live-working-tree.md`: why the working tree is read live, and its performance plan.
- `e2e/README.md`: what the smoke tests cover and how they build their isolated store.
