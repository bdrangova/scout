// Sessions on the variety-app repo: `types-variety` (the file grid, type filter and sidebar tree) and
// `rich-spec` (every spec, extras and evidence kind at once). Both read the same repo; neither edits it.
import path from 'node:path'
import type { EvidenceIndex, ExtrasIndex, SpecIndex } from '@scout/shared'
import { inputDir, makeManifest, writeSessionFolder } from './common.ts'
import { RICH_SPEC_SESSION_ID, TYPES_VARIETY_SESSION_ID } from './ids.ts'
import type { Media } from './media.ts'
import { VARIETY_BRANCH } from './variety-app.ts'

const TITLE = 'VAR-201: Comments on posts'
const TICKET_URL = 'https://example.atlassian.net/browse/VAR-201'
const CREATED_AT = '2026-10-01T09:00:00.000Z'
const RICH_CREATED_AT = '2026-10-01T10:00:00.000Z'

const JIRA_MD = `# VAR-201: Comments on posts

- **Status:** In Review
- **Assignee:** Sam Okafor
- **Type:** Story
- **Priority:** High
- **Link:** ${TICKET_URL}

## Description

Readers cannot respond to posts. Add comments under each post, loaded lazily per post and cached for
a minute, with relative timestamps ("3 min ago"). Avatars should load lazily now that a feed can hold
hundreds of them, and the user record gains a country so the dial code can be shown later.

## Acceptance criteria

1. Comments render under their post, oldest first, with a relative timestamp.
2. Adding a comment posts to \`/api/posts/:id/comments\` and appends it without a reload.
3. The legacy table view and its stylesheet are gone.
4. CI lints staged files on pull requests.
`

const PLAN_MD = `# Implementation plan: comments (VAR-201)

## Approach

Fetch comments per post after the feed loads so the first paint is not blocked. The cache TTL lives
in \`config/cache.yaml\`; the feature is behind \`features.comments\`.

\`\`\`mermaid
sequenceDiagram
  participant UI as UserCard.tsx
  participant API as comments.ts
  participant S as /api/posts/:id/comments
  UI->>API: listComments(postId)
  API->>S: GET
  S-->>API: Comment[]
  API-->>UI: Comment[]
  UI->>UI: renderComments()
\`\`\`

## Steps

1. \`src/api/comments.ts\`: list and add.
2. \`CommentList.tsx\` and \`comments.css\`.
3. Wire into \`UserCard.tsx\`; pass comments from \`index.ts\`.
4. Delete \`Legacy.tsx\`, \`old.css\`, \`CONTRIBUTING.md\` (moved to the handbook).
5. Rename \`dates.ts\` to \`time.ts\`; add \`formatDialCode\`.
6. Regenerate \`countries.ts\` from the ISO export.
`

const DESIGN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Comments design</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f4f5f7; color: #1f2933; }
  .frame { max-width: 720px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); padding: 16px; }
  .post { display: flex; gap: 12px; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; background: #c7d2fe; }
  .comments { margin: 8px 0 0 44px; padding: 0; list-style: none; font-size: 13px; color: #6b7280; }
  .comments li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; }
</style>
</head>
<body>
  <div class="frame">
    <div class="post"><div class="avatar"></div><p>Shipped the new onboarding flow. Feedback welcome.</p></div>
    <ol class="comments">
      <li><span>Nice, the progress bar is much clearer.</span><time>3 min ago</time></li>
      <li><span>Can we also show the step names?</span><time>just now</time></li>
    </ol>
  </div>
</body>
</html>
`

const ROLLOUT_MD = `# Rollout notes

Not in the index on purpose: the dashboard should still list this file, after the indexed ones, with
its heading as the title.

- Enable \`features.comments\` for staff first.
- Watch the comments endpoint p95 for a day.
`

const ARCHITECTURE_MD = `# Comments architecture

\`\`\`mermaid
flowchart LR
  Index[index.ts] --> Users[api/users.ts]
  Index --> Posts[api/posts.ts]
  Index --> Comments[api/comments.ts]
  Index --> Feed[UserCard.tsx]
  Feed --> Avatar[Avatar.tsx]
  Feed --> List[CommentList.tsx]
  List --> Time[utils/time.ts]
  Comments -. ttl .-> Cache[(config/cache.yaml)]
\`\`\`

The feed stays a pure renderer; \`index.ts\` owns the fetches. \`countries.ts\` is generated and should
be skimmed, not reviewed line by line.
`

const SEQUENCE_MMD = `sequenceDiagram
  autonumber
  participant R as Reader
  participant UI as CommentList
  participant API as comments.ts
  R->>UI: types a comment, presses Enter
  UI->>API: addComment(postId, body)
  API-->>UI: Comment
  UI->>UI: append + "just now"
  Note over UI: optimistic row replaced by the server one
`

const STATE_MERMAID = `stateDiagram-v2
  [*] --> Idle
  Idle --> Loading: post visible
  Loading --> Loaded: 200
  Loading --> Failed: error
  Failed --> Loading: retry
  Loaded --> Idle: ttl expired
`

const NOTES_MD = `# Review notes from the agent

- The lockfile only adds \`tiny-cache\`.
- \`Toolbar.legacy.jsx\` is a rename with a deprecation comment; the admin page still imports it.
- \`docs/comments.md\` is untracked on purpose so the tree shows that state.
`

const PR_DESCRIPTION = `# VAR-201: Comments on posts

Adds per-post comments with lazy loading and a one-minute cache, lazy avatars, and a country on the
user record. Removes the legacy table view.

## Changes

- \`api/comments.ts\`, \`CommentList.tsx\`, \`comments.css\`: the feature.
- \`UserCard.tsx\`, \`index.ts\`: wiring.
- \`dates.ts\` → \`time.ts\` (+ \`formatDialCode\`), \`Toolbar.jsx\` → \`Toolbar.legacy.jsx\`.
- \`countries.ts\` regenerated (2,100 lines); \`package-lock.json\` adds \`tiny-cache\`.
- Deleted \`Legacy.tsx\`, \`old.css\`, \`CONTRIBUTING.md\`.

## Testing

- Unit tests for \`formatRelative\` and the comments client.
- Manual: screenshots and a recording of the plan picker (reused evidence from the console).
`

export async function writeTypesVarietySession(repo: string, origin: string): Promise<void> {
  const manifest = makeManifest({
    id: TYPES_VARIETY_SESSION_ID,
    title: TITLE,
    repo,
    origin,
    branch: VARIETY_BRANCH,
    createdAt: CREATED_AT,
    tickets: [{ key: 'VAR-201', url: TICKET_URL }],
  })
  const spec: SpecIndex = { items: [{ file: 'jira.md', type: 'jira', title: TITLE, url: TICKET_URL, capturedAt: CREATED_AT }] }
  await writeSessionFolder(manifest, { spec: { files: [{ file: 'jira.md', text: JIRA_MD }], index: spec }, prDescription: PR_DESCRIPTION })
}

const LONG_CAPTION =
  'Plan picker open over the dashboard after clicking Upgrade in the trial bar, showing both the Pro and Team cards with their monthly per-user prices and the inline confirmation area still empty'
const LONG_DESCRIPTION =
  'Captured at 1280×400 on the staging build with the free plan and seven trial days left. The backdrop is the 45% navy overlay from the design system; the modal keeps its 12px radius and the 40px shadow. Nothing has been selected yet, so the confirmation slot under the plan cards is empty and the trial bar remains visible behind the overlay. Compare with the next capture, where Pro has been chosen and the bar disappears.'

export async function writeRichSpecSession(repo: string, origin: string, media: Media): Promise<void> {
  const manifest = makeManifest({
    id: RICH_SPEC_SESSION_ID,
    title: TITLE,
    repo,
    origin,
    branch: VARIETY_BRANCH,
    createdAt: RICH_CREATED_AT,
    agentSessionId: 'claude-session-c3d4',
    tickets: [
      { key: 'VAR-201', url: TICKET_URL },
      { key: 'VAR-188', url: 'https://example.atlassian.net/browse/VAR-188' },
    ],
  })
  const evidence: EvidenceIndex = {
    items: [
      { file: 'feed-neutral.png', caption: 'Feed with the trial bar, neutral variant', description: 'Baseline before any interaction.', order: 0 },
      { file: 'feed-warning.png', caption: 'Amber variant at two days left', description: 'Same layout, warning palette; the Upgrade button turns brown-orange.', order: 1 },
      { file: 'plan-picker.png', caption: LONG_CAPTION, description: LONG_DESCRIPTION, order: 2 },
      { file: 'plan-confirmed.png', caption: 'Pro selected: inline confirmation, trial bar hidden', order: 3 },
      { file: 'mobile/warning-390.png', caption: 'Narrow viewport (390px): the bar wraps under the text', description: 'Nested evidence folder on purpose.', order: 4 },
      { file: 'upgrade-flow.webm', caption: 'Recording of the whole upgrade flow, from the bar to the confirmation', description: 'Three seconds; the comment at 0:02.5 in the reviewed trial-bar session points at the same moment.', order: 5 },
    ],
  }
  const extras: ExtrasIndex = {
    items: [
      { file: 'architecture.md', title: 'Architecture (markdown with a mermaid block)', order: 0 },
      { file: 'report.html', title: 'Test report (HTML)', order: 1 },
      { file: 'sequence.mmd', title: 'Add-comment sequence (.mmd)', order: 2 },
      { file: 'state.mermaid', title: 'Comment loading states (.mermaid)', order: 3 },
    ],
  }
  const spec: SpecIndex = {
    items: [
      { file: 'jira.md', type: 'jira', title: TITLE, url: TICKET_URL, capturedAt: RICH_CREATED_AT, order: 0 },
      { file: 'plan.md', type: 'markdown', title: 'Implementation plan', sourcePath: '/Users/sam/.claude/plans/comments-on-posts.md', order: 1 },
      { file: 'design.html', type: 'artifact', title: 'Comments design', url: 'https://claude.ai/artifact/comments-design', order: 2 },
    ],
  }
  await writeSessionFolder(manifest, {
    evidence: {
      files: [
        { file: 'feed-neutral.png', from: media.png },
        { file: 'feed-warning.png', from: media.warningPng },
        { file: 'plan-picker.png', from: media.pickerPng },
        { file: 'plan-confirmed.png', from: media.confirmedPng },
        { file: 'mobile/warning-390.png', from: media.mobilePng },
        { file: 'upgrade-flow.webm', from: media.webm },
        // Not in the index: listed after the indexed items, filename as caption.
        { file: 'unindexed-overflow-check.png', from: media.mobilePng },
      ],
      index: evidence,
    },
    extras: {
      files: [
        { file: 'architecture.md', text: ARCHITECTURE_MD },
        { file: 'report.html', from: path.join(inputDir, 'extras', 'report.html') },
        { file: 'sequence.mmd', text: SEQUENCE_MMD },
        { file: 'state.mermaid', text: STATE_MERMAID },
        // Not in the index: title derived from the first heading.
        { file: 'notes.md', text: NOTES_MD },
      ],
      index: extras,
    },
    spec: {
      files: [
        { file: 'jira.md', text: JIRA_MD },
        { file: 'plan.md', text: PLAN_MD },
        { file: 'design.html', text: DESIGN_HTML },
        { file: 'rollout.md', text: ROLLOUT_MD },
      ],
      index: spec,
    },
    prDescription: PR_DESCRIPTION,
  })
}
