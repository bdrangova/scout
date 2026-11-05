---
name: record-resolutions
description: Turn a Scout session's review feedback into a checklist of comment ids and record a resolution (resolved, or open with a reply) for every one of them, then report them as a table. Loaded by scout-apply-review and scout-apply-test-review; the reviewer sees each resolution as soon as it is recorded.
user-invocable: false
---
# Recording resolutions

## Rules
- Every comment id (`c<n>`) in the feedback needs a response. Never silently skip one.
- Notes follow `/write-for-reviewers`: what changed, where (`path:line`), how it was verified. A reply without a fix says why.
- Never claim something is verified that `/reproduce` did not report as `reproduced` or as a verified fix; cite its status, evidence and limitation in the note.
- The dashboard shows resolutions as you record them. There is nothing to publish or resend.

## Checklist
Read the feedback (`scout feedback <id> --format markdown`) top to bottom and list every comment id with what it is about and the action you plan. The calling skill says what the targets are (files, lines, evidence, scenarios, bugs, the whole change) and which actions it allows.

## Record
One line each:
`scout resolve <id> --comment c<n> --status resolved --note "<what changed, where, how verified>" --files <path,path>`
To reply without resolving (a question for the reviewer, a won't-fix with reasons, something only the user can do, a change that needs approval) use `--status open --note "…"`.
Many at once: write a JSON array `[{ "comment": "c1", "status": "resolved", "note": "…", "files": ["…"] }, …]` and run `scout resolve <id> --from <file>`.

## Report
Finish with a table of comment id, status and note. Say which comments stay open and what the user has to do for them.
