---
name: scout-blueprint-groups
description: Group the files of a change logically for the Blueprint page of the Scout dashboard (by feature, by layer or by review priority) and save the grouping. Use when the user runs /scout-blueprint-groups, usually pasted from the dashboard's Blueprint page.
argument-hint: "<sessionId> <feature|layer|priority>"
allowed-tools: Bash(scout *) Bash(git diff *) Bash(git status *) Read Glob Grep Write
---
# Group the change: $1 (session $0)

Arguments: $ARGUMENTS

The reviewer asked from the Scout dashboard's Blueprint page for this change to be grouped by `$1`. The groups become the boxes of the diagram, so a reviewer can read the change in a sensible order. Do not edit any code.

## Changed files and Scout's notes
!`scout groups context $0`

## The three types
- **feature**: what the change does. One group per user-visible intent, named after it ("Saved filters", "Bulk delete"), not after folders.
- **layer**: the order things build on each other. Foundations first (data, types, shared settings), then shared building blocks, then the pages and screens that adopt them, then tests and config.
- **priority**: exactly three top-level groups, with these ids and names, in this order: `read-carefully` "Read carefully", `repeated-pattern` "Repeated pattern", `mechanical` "Mechanical or generated". Put each file where a reviewer's attention should go. Inside a group, sub-group as you see fit, for example one sub-group per repeated pattern.

## Rules
- Every changed file is in exactly one group. Use the paths exactly as listed above.
- feature and layer: 3 to 9 top-level groups. Sub-groups only when a group has more than about 15 files and splits naturally, at most 3 levels.
- Group names are 1 to 4 plain words. The purpose is one plain sentence a reviewer who knows nothing of the code can follow, with no function, variable or class names.
- Order the groups the way a reviewer should read them. Ids are short lowercase slugs (`saved-filters`), unique among siblings.
- Lean on the file list and Scout's summaries. Open code (Read, Grep, `git diff`) only for files those do not explain. Keep token use low.

## Steps
1. Decide the groups for `$1` from the context above.
2. Write this shape to a temp file (Write), with `files` holding the paths directly in that group and `groups` only when it has sub-groups:
   ```
   { "groups": [ { "id": "saved-filters", "name": "Saved filters", "purpose": "Lets people save a filter and reuse it.", "files": ["src/a.ts"], "groups": [ { "id": "…", "name": "…", "purpose": "…", "files": ["…"] } ] } ] }
   ```
3. Run `scout groups set $1 $0 --from <file>`. If it lists problems or files in no group, fix the JSON and run it again until it saves.
4. Finish with two lines: the groups in order with their file counts, and that the Blueprint page now shows the `$1` view.
