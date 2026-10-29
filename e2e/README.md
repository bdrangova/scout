# End-to-end smoke test

`smoke.spec.ts` drives the whole review loop in Chromium against a throwaway copy of the fixture store and (Scout starts no
agent). The fixture session `20260926-1200-qi-15472-trial-bar-f1a0` reads its code live from the git working
tree in `<store>/repos/trial-app` (12 files), so the test also covers the live-update path.

Isolation (`store.ts`, `global-setup.ts`, `global-teardown.ts`, `playwright.config.ts`):

- The store lives at `<os.tmpdir()>/scout-e2e/store`. `globalSetup` wipes that folder and rebuilds it with
  `scripts/make-fixture.ts` (`FIXTURE_OUT`, `DASHBOARD_ORIGIN`); `globalTeardown` removes it.
- `webServer` always starts its own `npm run dev:fixtures` (`reuseExistingServer: false`) with `FIXTURE_HOME` pointing
  at that store, API on 4745 and web on 4746 (`AI_REVIEW_PORT`, `WEB_PORT`, `DASHBOARD_URL`), and waits for
  `/api/health` through the Vite proxy so both servers are up. A `dev:fixtures` running on 4555/4556 against
  `fixtures/store` is left alone, and `fixtures/store` itself is never read or written.

What it covers, in order (one serial `describe`, one shared page):

1. Open the session list, click the f1a0 row (two sessions share the title; the row's `data-href` carries the id).
2. Approve `README.md` (header `reviewed 1/12`), reject `package-lock.json` with a comment via "Comment & Reject" (`2/12`).
3. Reload: the verdicts survive (autosave); `review/review.json` holds one approved and one rejected entry, each pinned to a
   16-hex `fingerprint`, and one comment.
4. Live update: the spec appends a line to `src/app.ts` in the fixture repo; within 5 s the "N files changed on disk" toast
   (or the card's "changed just now" chip) shows and the header's `+N` additions figure changes.
5. Submit with "Request changes": no confirmation step; the "Feedback pending" panel shows the `/apply-review` command.
6. On disk: `review/sent/*.json|.md|.patch` and the comment in `review/review.json` is stamped `sentAt`.

What it resets so it is repeatable (the store is rebuilt per run anyway, so these only matter within one run):

- `beforeAll` removes `<store>/sessions/<f1a0>/review/`, then waits ~800 ms for the watchers (300 ms debounce).
- `afterAll` restores `<store>/repos/trial-app/src/app.ts` to its original content.

Run it from the repo root with `npx playwright test` (or `npm run e2e`). Running it twice in a row should pass both times.
