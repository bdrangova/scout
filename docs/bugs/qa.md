# QA findings (cross-screen pass)

## Session header: base branch collapses to "o…" with a long title and 3+ tickets
- Repro: open `20261001-1200-qi-15472-trial-bar-long-title-10f6` at 1440px. The ticket strip takes 30% of the header, the title takes the rest and the `origin/master` tag is truncated to `o…` (the head branch keeps its width).
- Suspected cause: `SessionHeader` / `BranchPair` (`web/src/components/common/BranchRef.tsx`): both tags shrink, the longer head branch wins. The base tag needs a `min-w` or the pair should truncate the head branch first.
- Severity: low (title attribute still shows the full name).

## Status wording "Sent · Claude Code working" with a failed run in the active-run fixture
- Repro: `20261001-1115-qi-15472-trial-bar-active-run-ac71`, Submit tab: the run banner says "The Claude Code run failed (the server restarted while this run was active)" while the status bar says "Claude Code working".
- Suspected cause: fixture run was marked failed by server restart recovery but the session status derivation still reads the manifest run state (server/shared status derivation). Check `deriveStatus` against recovered runs.
- Severity: low/medium (contradictory status).

## e2e flake: "marks the README the agent edited as updated" (smoke.spec.ts:207)
- Repro: failed 5 times in a row while a second dev stack was running and screenshots were being taken, then passed 6 of 6 on a quiet machine, with identical code. The README card shows no "updated" chip for 5s although the marker is on disk.
- Suspected cause: the tree fingerprint (probably mtime/size based) read right after the fake agent's edit, or a stale tree served on the reload. Look at fingerprint computation / tree cache in server `git/`.
- Severity: low (test-only so far), but could be a real stale-fingerprint race.

## e2e flake recurs: README "updated since sent" chip (smoke.spec.ts:207), 1 of 3 runs on a quiet stack
- Repro: `npm run e2e` three times in a row after the shell/rail changes; the second run failed at `card.getByText(/^updated since sent$/i)`, runs 1 and 3 passed. Same entry as above; not related to the rail.
- Suspected cause: tree fingerprint read right after the fake agent's edit. Severity: low.

## Run-failed banner truncates the error to one line on Submit
- Repro: `20261001-1100-qi-15472-trial-bar-failed-run-f41d` at 800px: "claude exited with code 1: Error: Session ... could not be resumed (wor…" is cut with an ellipsis and there is no way to read the rest in the banner (View run shows it).
- Suspected cause: `FailedRunNotice` truncates on one line. Severity: low.

## e2e flake, history and status (README "updated since sent", smoke.spec.ts:209)
- Pattern across runs: always this one test (occasionally the live-edit toast test one step earlier), only when the machine is busy (a second dev stack, screenshots, load average 7-12), never on a quiet machine except 1 of 3 once. 4 failures in a row on 2026-10-20, on the working tree and on stashed HEAD alike; 18/18 right after.
- Found and fixed (test side): the test read README.md as soon as the UI said "finished", but the fake adapter appends its marker after the run's result line, so under load the read could beat the write. It now polls. The live-update waits went from 5s to 20s.
- Proven cause (2026-10-20; temporary traces in 16 runs with 12 `yes` processes running, the test failed 5/8 and 6/6): the watcher is not at fault. The fs event for the README append arrived 10-50 ms after the write every time and the 300 ms debounce fired on time. But the recompute then took 3.4-6 s under load (the six fixture sessions share one repo, so six identical diffs start at once), and for that whole window `TreeCache.get` kept serving the old tree. `page.goto` landed in that window (stale reads at fingerprint 2a0a3b14, fresh c83bc3c8 only ~4.5 s after the write). The server emitted `tree.updated` when the recompute finished, but the new page's `EventSource` connected ~300 ms later (the session page subscribes after its first fetch and has no catch-up), so nobody heard it and the page kept the stale tree for good; a 20 s wait cannot help. At the end of a failed run the API returned README fingerprint b0ad8369 while `review.json` held 26141e44 and the card still showed APPROVED with no chip.
- Fix: `TreeCache` marks an entry dirty on `invalidate`; a read of a dirty entry starts the pending recompute at once (or joins the running one) and waits for it, so a client is never handed a tree the server already knows is stale (`server/src/store/tree.ts`, tests in `tree.test.ts`). Not changed: a client that fetches and only then subscribes can still miss an edit made in that gap; a resync on SSE open would close it.
