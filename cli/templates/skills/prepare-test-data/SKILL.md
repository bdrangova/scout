---
name: prepare-test-data
description: Get a feature test's data ready and keep it repeatable - write the test-data table first, build the data through the app or the repository's own seeding, record the setup apart from the scenarios, check every record's real state, and checkpoint the clean data with /snapshot-db so each scenario starts from it. Called by scout-feature-test; also use it when the user runs /prepare-test-data.
argument-hint: "--session <id> [--setup-key <key>] [--record video|screenshots|none] [--auto]"
---
# Prepare test data

Arguments: $ARGUMENTS

The run folder is `$(ai-review path <id> run)`. Setup recordings go to `<run>/data-setup/videos/`, screenshots to `<run>/data-setup/screenshots/`, notes to `<run>/steps.md` under "Data setup".

## Rules
- Use the repository's own test-data skill when it has one: `ai-review env` names it under `skills.testData` (from a registered pack). Load it (Skill tool) before step 1; it says how data, users and passwords are made there. Without one, build the data through the app's UI or the seeding the repository documents (README, seed scripts, fixtures). Never invent a password or log one.
- Setup is run, never assumed. When seeding fails, say so and stop or mark the affected scenarios blocked.
- Local data only. Never write to shared, staging or production data.
- Never record the setup inside a scenario video.

## Steps
1. **Table first.** Before building anything, write a test-data table into `steps.md`: id (`D1`, `D2`, …) · role · record · required state · how it is built. Check the ticket's assumptions against real behaviour (for example an action that cascades to children makes "independent" records dependent) and note deviations.
2. **Checkpoint?** Pick a setup key that names the data (`approver-and-pending-library-model`). `/snapshot-db lookup <key> --session <id> --setup <setup.md>`; when one exists, `/snapshot-db restore` it, read the ids from its `setup.md` and go to step 5.
3. **Build** through the app's UI or the repository's seeding, recorded with `/browser-recording` into `data-setup/videos/` (screenshots into `data-setup/screenshots/`). When a state cannot be produced through the UI, use the repository's documented fixture route (for example a direct database change) and write exactly what was changed into `steps.md`.
4. **Verify** every record's real state (the UI badge and, where it matters, a database read) against the table. Every user the scenarios need must actually be able to sign in.
5. **Checkpoint the clean data** before any scenario runs: `/snapshot-db save <key> --session <id> …`. Never overwrite it; a later state gets its own key (`<key>-after-<phase>`).
6. **Report** last: the table with each item's result, `Checkpoint: <key> (saved|restored)`, feature flags you set, and the restore command. Also write the flags and the restore command into `steps.md`.

Before each scenario that changes data, the caller restores this checkpoint (`/snapshot-db restore <key> --session <id>`), so every scenario starts from the same state.
