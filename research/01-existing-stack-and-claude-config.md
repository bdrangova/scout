# Existing projects: stack conventions and Claude Code configuration

Surveyed 2026-09-25 (read-only) across `~/Projects/*` and `~/.claude`. No secret values are recorded here; only whether they exist.

## Tooling on this machine

| Tool | Version |
|---|---|
| Node | v22.18.0 (qbdvision pins 22.23.1) |
| npm | 11.10.0 |
| git | 2.54.0 |
| Claude Code | 2.1.241 |

Package manager everywhere: **npm** (only `package-lock.json` files found).

## Sibling projects

### qbdash (closest match for the dashboard)
- Layout: root runs frontend + backend with `concurrently`, deploys with AWS CDK. `frontend/` and `backend/` each have their own lockfile; no npm workspaces.
- Frontend: Vite 8, React 19.2, TypeScript ~5.9 strict, Tailwind v4 via `@tailwindcss/vite`, lucide-react, recharts, @tanstack/react-table, react-grid-layout, react-markdown + remark-gfm + rehype-highlight, react-router-dom 7.
- State: plain React Context providers in `frontend/src/state/`. No react-query / zustand / redux.
- Backend: Express 5 on port 3001 (ts-node + nodemon, `backend/src/local.ts`), serverless-http, pg, ws, Octokit, AWS Bedrock.
- Tests: Vitest 4 + happy-dom + Testing Library; supertest on the backend; Playwright e2e in `playwright.config.ts` (ports 5173 and 3001).
- Lint: ESLint 9 flat config. No Prettier.
- Vite proxies `/api` to port 3001.
- Jira driver already exists: `qbdash/backend/src/drivers/jira.ts` (REST v3 + Agile API, fetch, Basic auth with email + API token). Also `jiraConfig.json` and `frontend/src/features/jira/`.
- AI: `qbdash/backend/src/agent/bedrock.ts` calls Claude via Bedrock.

### git-stats
- Earlier copy of the same scaffold (package name `eng-stats`, identical vite config). React 19, Router 7, Tailwind 4, lucide; Express 5 + Octokit backend. No tests.
- `frontend/src/features/reviews/reviewCalculations.ts` computes review metrics.

### feature-flags
- Terraform + LaunchDarkly `ldcli` + plain-JS Octokit scripts. Prettier 3. `mise.toml` pins node 22 / npm 11.

### chrome-sidebar-hotkey
- Vanilla-JS Chrome extension + Swift helper + Python icon script. No package.json.

### qbdvision (main work codebase)
- Root: npm workspaces (`packages/*`, cognito-local), TypeScript 7.0.2, Vite 8.1, Vitest 4.1 (unit / integration / client-ui / client-unit projects + evals).
- E2E: Cucumber + WebdriverIO (not Playwright).
- Lint/format: oxlint, Prettier 3.5 (import sorting, width 100, double quotes), stylelint, via husky + lint-staged.
- Node: `.nvmrc` v22.23.1; engines node 22.23.1, npm >= 11.10.0.
- Client (`src/main/client`): React 18.3.1, mixed JS/JSX/TS. SCSS modules + in-house `uiLibrary/` (atoms → templates) on radix-ui + class-variance-authority + clsx. Legacy Bootstrap 4, Kendo, jQuery DataTables still present. react-query 4, react-hook-form + zod, react-router 6, Storybook 10.
- Ports: Vite 8080, backend 3000, Storybook 6006.
- Playwright is used only for PDF export rendering and Vitest browser tests. Puppeteer not used anywhere.
- Diff: only `src/main/client/helpers/diff_helper.jsx` (record-version comparison, not code). No project has a code-diff viewer library.

## qbdvision Claude Code configuration (under `qbdvision/.claude/`, not tracked in git)

- Exists: `.claude/CLAUDE.md` (near-copies in `plans/CLAUDE.md`, `plans/transfer/CLAUDE.md`), `.claude/settings.local.json` (holds a CircleCI token value), `.claude/launch.json` (storybook 6006; dev / playground / cicdbojana on 8080), `.claude/hooks/`, `.claude/skills/`, `.agents/skills/buddy-collate/`, `.github/agents/skills/`, `.github/agents/plugins/`.
- Missing: `.claude/settings.json`, root `CLAUDE.md`, `.mcp.json`.
- Hooks:
  - `pre_commit_self_review.sh` (before Bash): blocks the first `git commit` per staged diff until Claude reviewed it.
  - `sync_claude_folders.sh` (after edits): copies `.claude/` to qbdvision2/3/4. `sync_devtools_folders.sh` copies `src/main/client/devtools`.
  - `jira_ticket_git_detector.sh` (after git commands) and `jira_start_ticket_detector.sh` (first prompt): nudge Claude to move the Jira ticket forward.
- MCP servers: none in the repo. The design-system-components plugin brings a Figma server; the permission list references Atlassian Jira tools.
- Skills: `.claude/skills` → test-research, test-planning, manual-test-execution, seed-test-company, testing-navigation-memory, jira-setup. `.agents/skills` → buddy-collate. `.github/agents/skills` → adversarial-pr-review, codacy-review, pr-review-response, build-triage, test-failure-debugging, infrastructure reviewers.
- Broken references spotted (not fixed): `CLAUDE.md` points to `.agents/subagent_economics.md` (real file: `.github/agents/subagent-economics.md`); the pre-commit hook points to `.agents/skills/codacy-review/SKILL.md` (real file: `.github/agents/skills/codacy-review/SKILL.md`); `launch.json` uses npm scripts `dev:playground` and `dev:cicdbojana` that don't exist.

## Existing review material worth reusing as sample data

- `qbdvision/.github/pr-review-panel.yml` + `.md`: reviewer "lenses" and posting rules.
- `qbdvision/plans/05-development/02-pr-reviews/`: 23 saved review reports (`pr-<num>-<slug>.md`) plus `pr-review-rules.md` (format: severity, file, line, what, why, how to reproduce).
- `qbdvision/plans/05-development/pre-push-checklist.md`.

## Global `~/.claude`

- `settings.json`: model sonnet, effort high, auto-compact window 400000; enabled plugins design-system-components, circle-ci, frontend-architecture-rulebook; `enabledMcpjsonServers: ["circleci-mcp-server"]`; no hooks, no permissions.
- `settings.local.json`: allows `Skill(update-config)` and the MCP registry search tool.
- `.mcp.json` (CircleCI server, token value present) and `mcp.json` (Google Chat server, client secret present). Note: user-level MCP servers are normally read from `~/.claude.json`, so these two files may not be loaded; check with `/mcp` in an interactive session.
- `skills/`: `dailybot` (symlink to `~/.agents/skills/dailybot`), `gh-stack`. No `commands/`, `agents/`, or global `CLAUDE.md`.

## Implications for code-review-dash

- Matching stack: Vite + React 19 + TypeScript strict + Tailwind v4 frontend, Express 5 (or similar) TypeScript backend, npm, Node 22, Vitest, ESLint 9 flat config. Mirrors qbdash.
- Pick ports that don't collide with qbdvision (8080, 3000, 6006) or qbdash (5173, 3001).
- Jira access pattern already proven in `qbdash/backend/src/drivers/jira.ts` (email + API token, REST v3).
- Later "integrate into codebases" work will land as a `.claude/` hook/skill/MCP entry in qbdvision, alongside the existing hooks. The `sync_claude_folders.sh` hook means anything added to qbdvision's `.claude/` propagates to the other three checkouts automatically.
