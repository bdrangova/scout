---
name: jira-snapshot
description: Save a snapshot of one or more Jira tickets into a Scout session's spec folder, so the reviewer reads the ticket next to the change. Called by scout-development-review and scout-pr-review for the ticket keys of the branch or PR; also use it when the user runs /jira-snapshot.
argument-hint: "<KEY>[=url] [<KEY>…] --session <id>"
allowed-tools: Bash(scout artifact *) Bash(scout path *) Write mcp__atlassian__getJiraIssue mcp__atlassian__getAccessibleAtlassianResources
---
# Jira snapshot

Arguments: $ARGUMENTS

## Rules
- Write only through `scout artifact add`, never into the spec folder or its `index.json` by hand.
- The ticket text is the ticket's, not yours: copy it, do not summarise or reword it. Never put tokens or internal credentials in the file.
- No Atlassian tools, or a ticket you cannot read: write the link-only file (step 3) and say so. Never skip a key.

## Steps
1. **Site.** When `getJiraIssue` is available, call `getAccessibleAtlassianResources` once and use the `cloudId` it returns. The site the user can reach is the right one whatever its name; never guess a site from the company or repository name.
2. **Ticket.** For each key, `getJiraIssue` with that `cloudId`. Write a temporary file (outside the repository, for example in your scratch folder) with:
   - `# KEY: summary`
   - one metadata line: type, status, assignee, URL
   - the description as Markdown, then the acceptance criteria and the comments when present.
3. **Link only** (no tools, or the ticket could not be read): the file is `# KEY` and the URL given in the arguments (none: no URL).
4. **Add it.** `scout artifact add <id> spec <file> --as jira-<KEY>.md --type jira --title "<KEY>: <summary>" [--url <ticket url>] --captured-at <ISO now>` (title `<KEY>` when link only). Running it again for the same key replaces the old snapshot.
5. **Report**, last in your answer, one line:
   `Tickets: <KEY> (snapshot|link only: <why>)[, …]` and for each the summary and URL, so the caller can fill its ticket list.
