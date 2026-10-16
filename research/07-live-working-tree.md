# D8. Live working tree (2026-10-03)

**Decision.** The dashboard reads everything live from disk. Code diffs are computed by the server from the repo working tree on demand (`git diff <merge-base>` plus `--no-index` patches for untracked files); evidence, spec, extras and the PR description are plain files the agent writes straight into the session folder, which the server also watches. There are no revisions, no snapshot refs, no inbox and no publish command. Reviews only ever happen on the machine that has the repo.

Supersedes D5 (snapshot refs) and the `revisions/<n>/` layout from the plan and research/06. Contract v2 is in `shared/README.md`.

## Base branch

The diff is always "all files changed against master". `defaultBase(repo)` picks `origin/master`, then `master`, then `origin/main`, then `main`, then the ref `origin/HEAD` points to; `ai-review init --base <ref>` overrides it and the chosen name is stored in `manifest.repo.baseRef`. The remote ref comes first because a local master that is behind (121 commits in a measured checkout) inflates the diff (1,688 files instead of 392). The tree is compared against `git merge-base <baseRef> HEAD`, not the base tip, so later commits on master never appear as reversed changes.

## Why

- The publish step was the friction point. Every change the agent made had to be republished before the reviewer could see it, and the two copies (repo vs. session snapshot) drifted. With live reads, what the reviewer sees is what is on disk, always.
- Revisions existed to answer "did this file change since I judged it?". A content fingerprint per file answers that directly: the verdict is pinned to the fingerprint it was given on, and the file is "updated" when the fingerprint moves. No history is needed.
- The snapshot refs were the only reason the CLI had to touch the repo's `.git` and the only place that could corrupt anything. Gone.
- Evidence and extras never needed packaging: the agent can write a PNG into a folder. An optional `index.json` carries captions and order when it wants them; the filename is a fine default.
- The sent `.patch` keeps an immutable record of what the reviewer actually looked at when they submitted, so the agent and the reviewer can still refer to the exact diff even though the tree moves on.

Rejected: keeping snapshot refs for history only (nobody asked for history; the `.patch` per send covers the audit need). Rejected: a `rev` query parameter pointing at older sent patches in the UI (v1 reviews the tree as it is; the patches are files on disk).

## Performance plan

1. **Per-session cache.** The server keeps `{ tree, patches, computedAt }` per session. A detail request serves the cache; a miss (first open, or invalidated) computes synchronously and logs `tree <id> computed in <durationMs> ms (<files> files)`. The timing is also on the `WorkingTree` (`durationMs`) and in the `tree.updated` event, so slow repos are visible in the UI and the logs without instrumentation.
2. **Repo watcher.** One chokidar watcher per open session on `manifest.repo.path`, ignoring `.git/**` except `.git/HEAD`, `.git/index` and `.git/refs/**` (so commits, checkouts and staging invalidate too), plus `node_modules/**`, `dist/**` and `.gitignore`d trees where cheap. Events are debounced 300 ms, then the cache is invalidated and recomputed; `tree.updated { sessionId, fingerprint, durationMs }` is emitted only when the tree fingerprint changed, so a save that does not change the diff is free for the web. The web compares the fingerprint with the tree it holds before refetching.
3. **Session-folder watcher.** `evidence/`, `extras/`, `spec/` and `pr-description.md` are watched the same way (300 ms debounce) and emit `session.updated`; no git involved.
4. **If large repos are slow** (`durationMs` well above ~1 s on qbdvision-sized trees): warm the cache in the background when a session opens (list sessions without blocking on trees: the summary falls back to the last cached stats until the first compute lands), and serve per-file patches lazily (`git diff <base> -- <path>` on request, fingerprinted individually) instead of splitting one whole-tree patch. The contract already allows this: `patches` is a map the server owns, and the per-file route is the only consumer.
5. **Linear by construction.** A 400-file, 1.2 MB patch is the normal case: one `git diff`, one numstat, one name-status, one batched `cat-file --batch-check` and one batched `hash-object --stdin-paths`; `splitPatch` and the fingerprints are single passes over the patch. No per-file git calls apart from the `--no-index` patch of each untracked file.
6. **Abort on invalidation.** `computeWorkingTree` takes an `AbortSignal`; a recompute that starts while another is running cancels the older one, so a burst of saves costs one computation.

## What the agent does now

- `ai-review init` once per piece of work: writes `manifest.json` (repo path, base ref, title, tickets). The session folder appears in the dashboard immediately with the live tree.
- Works in the repo as usual. Drops screenshots and recordings into `evidence/`, exported HTML/markdown/mermaid into `extras/`, the ticket snapshot and plan into `spec/`, the PR text into `pr-description.md`. Optionally writes `index.json` next to them for captions, titles and order.
- On Submit, reads `review/sent/<stem>.md` (or `ai-review feedback`), fixes things in the working tree, and answers each comment with `ai-review resolve`. The dashboard shows the updated files and the resolutions as they land; nothing to republish.
