---
name: snapshot-db
description: Checkpoint the local database(s) this checkout's app uses right after a reproduction's data setup, so later runs restore that state instead of repeating the setup. Looks up an existing checkpoint for the same setup first and restores it; otherwise, after the caller has seeded the data, dumps only local databases, writes a manifest with row counts, and prints the restore command. Called by the review skills (scout-pr-review, scout-development-review, scout-apply-review, scout-apply-test-review, scout-pr-comments) around any data setup; also use it when the user runs /snapshot-db.
argument-hint: "lookup|save|restore <setup-key> [--session <id>] [--setup <file>] [--auto]"
allowed-tools: Bash(docker *) Bash(lsof *) Bash(ps *) Bash(git rev-parse *) Bash(scout path *) Bash(scout env*) Bash(scout checkpoint *) Bash(scout app-status*) Bash(du *) Read Glob Grep AskUserQuestion
---
# Checkpoint the database after data setup

Arguments: $ARGUMENTS

A reproduction's data setup (seeding a company, creating users, proposing and approving records) is slow and the same every time. Do it once, checkpoint the database right after it, and from then on restore the checkpoint and go straight to the reproduction steps.

## Rules
- Local databases only: `localhost`, `127.0.0.1`, `::1`, a docker compose service of this checkout, or a file in it. A connection string that points anywhere else (a shared dev, staging or production host) is never dumped or restored; stop and report it.
- This checkout's databases only. Other worktrees of the same repository run their own containers on the same machine, often from the same compose file: a dump or restore that reaches one of them corrupts someone else's data. Before any `save` or `restore`, prove the target is this checkout's (step 2); when you cannot, stop and report it.
- Never assume a port, a container or a compose project name: they come from the checkout runtime (`scout env`) or, without one, from this checkout's own files.
- `save` and `lookup` are read-only and need no question. `restore` replaces data: ask once per run unless the user already said yes in it; with `--auto`/`SCOUT_HEADLESS=1` restore only a checkpoint this session saved (it is local by the rule above), never one from elsewhere.
- Checkpoints hold real data: keep them in the session folder, never in the report evidence, never committed, never uploaded.
- Prefer the project's own tooling (a `db:dump`/`backup`/`snapshot` script, a Makefile target, a documented command) over a hand-built command.

## The setup key
`<setup-key>` names one data setup (`approver-and-pending-library-model`). The checkpoint is reusable only while that setup would produce the same data, so its manifest also records the `sha256` of the setup description (`--setup <file>`: the caller's prerequisites and setup steps as text), the checkout's `git rev-parse HEAD`, and a hash of the migration/seed files (`git ls-files -s` over the folders that define the schema and seeds). A checkpoint whose setup hash or schema hash differs is stale: never restore it, set up again and save a new one. A different head with the same schema hash is fine. `scout checkpoint` computes all of this; pass `--schema <path>` for the folders that define the schema and seeds when you know them (otherwise it guesses common migration and seed folders and says which).

## Modes
- **`lookup <key>`**: `scout checkpoint lookup <key> --setup <file> [--session <id>] [--schema <path>…]` finds the newest checkpoint whose hashes match and prints `Checkpoint: <folder>` or `Checkpoint: none (<missing|stale: why>)`, plus `saveTo`, the folder a `save` writes. Report its lines. Does not touch the database.
- **`save <key>`**: run after the setup succeeded and before the first reproduction step. Dumps every local database the setup wrote to and writes the manifest.
- **`restore <key|folder>`**: puts a matching checkpoint back (asking as the rules say), then reads the row counts and compares them with the manifest. A mismatch means the restore did not take: report it, and the caller sets up from scratch.

## Steps
1. **Find the databases.** First `scout env`: when it has `runtime.databases` (and `runtime.services` for auth stores), use exactly those (engine, host, port, database, `compose.project`/`compose.file`/`compose.service`, `container`) and skip the search below. `runtimeError`: report it and search. No runtime: search in this order: `.claude/launch.json`, `docker-compose*.yml` (services from images such as `mysql`, `mariadb`, `postgres`, `mongo`, `amazon/dynamodb-local`, `redis`), `.env*` and config files (`DATABASE_URL`, `DB_HOST`, `MONGO_URI`, `DYNAMODB_ENDPOINT`…), `serverless*.yml` (offline DynamoDB), SQLite files, the README. Note each one's engine, host, port, name and how the app reaches it. Several: checkpoint every one the setup touches; when unsure, all local ones. Auth stores count too (a local Cognito, Keycloak or users table) when the setup created users.
2. **Check it is local, up and this checkout's.** Host rules above; `lsof -nP -iTCP:<port> -sTCP:LISTEN`, or for compose `docker compose -p <project> -f <file> ps` (always pass the project: without it compose derives a name from the folder, which can be another worktree's). For a container, check `docker port <container>` matches the port the app of this checkout uses. Not running: report `Checkpoint: none: <db> not running` (the caller starts the app with `/run-app` first). A mismatch, or a database you could only guess in a linked worktree (`linkedWorktree: true` and no runtime): `save` may continue after saying so, `restore` stops with `Checkpoint: none: cannot prove <db> is this checkout's`.
3. **Folder.** The `saveTo` of `scout checkpoint lookup` (under the session folder with `--session`, else under the scratch folder from `scout env`; never inside the checkout).
4. **Dump** (`save`; inside the container with `docker compose -p <project> -f <file> exec -T <service> …` for a compose service (or `docker exec -i <container> …`); credentials from the same env the app uses, never typed into the transcript):
   - PostgreSQL: `pg_dump -Fc --no-owner -d <db> > db.dump`
   - MySQL/MariaDB: `mysqldump --single-transaction --routines --triggers --databases <db> > db.sql`
   - MongoDB: `mongodump --archive --gzip --db <db> > db.archive.gz`
   - SQLite: `sqlite3 <file> ".backup 'db.sqlite'"`
   - DynamoDB Local: copy its data directory (`-dbPath`/the volume) with writes stopped; in memory only: `aws dynamodb scan` each table with `--endpoint-url` into `<table>.json`
   - Redis: `redis-cli BGSAVE`, wait for `LASTSAVE` to move, copy `dump.rdb`
5. **Manifest** (`save`): count rows/documents per table/collection (a cheap read-only count) into a JSON file, then `scout checkpoint manifest <folder> --key <key> --setup <file> [--schema <path>…] --engine <engine> --database <db> --host <host> --dump-command "<what you ran>" --restore-command "<what puts it back>" --counts <file>`. It writes `manifest.json` (hashes, head, time, each file's size and sha256, the counts) and copies the setup description to `setup.md`. Add the IDs the setup produced (users, records) that the reproduction steps refer to at the end of `setup.md`.
6. **Restore** (`restore`): `pg_restore --clean --if-exists -d`, `mysql < db.sql`, `mongorestore --drop --archive --gzip`, or copy the SQLite/DynamoDB/Redis files back with the service stopped and start it again. Then compare the counts (step 5) and report.
7. **Report** to the caller in two lines, last in your answer:
   `Checkpoint: <folder> (saved|restored|found, <engine> <db>, <size>[; …])` or `Checkpoint: none: <reason>`
   `Restore: <the exact command(s) that put it back>`

## For the caller
1. After `/run-app` reports the app running: `/snapshot-db lookup <key> --session <id> --setup <file>`.
2. Found: `/snapshot-db restore <key> …` and skip the setup; use the IDs in its `setup.md`. Restore failed or none: run the setup, then `/snapshot-db save <key> …` before the first reproduction step.
3. Attach `manifest.json` to the report as `log` evidence on the setup step (caption: "DB checkpoint after setup: <db>, <time>, saved|restored") and put the checkpoint folder and `Restore:` command in the prerequisites, so a reviewer can rerun from the same state. Never attach the dump itself.
4. Findings that share a setup share a key: set up once, then restore before each one so one reproduction's writes never leak into the next.
