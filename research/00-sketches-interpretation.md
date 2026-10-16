# Sketch review: what the pen sketches say

Source: `ai-review-sketches/` (8 photos, reviewed 2026-09-25). This is my reading of each page plus the requirements I derived from them. Corrections welcome.

## Page 1: "Development Code Review" (index / feature map)

Four boxed sections:

- **Views for review**
  - Diff view
  - New files view
  - Code graph or any other visual representation
- **Actions**
  - Approve
  - Reject
  - Comment
  - Request changes
- **Views for requirements / spec**
  - Jira
  - MD files
  - Artifacts (html / md)
- **Agent interactivity**
  - Send back action / feedback
  - Visual representation of specific implementation → graph

## Page 2: "Development Code Review – Explorations & Interfaces"

- Header stats bar: `+3,658 | -245 | Changes across | 33 files`
- A two-state toggle: **Scroll | Swipe** (two ways to move through the file cards)
- A stacked card deck: front card titled `file.tsx` showing diff lines (`+` / `-`), cards peeking behind it, `<` and `>` arrows on either side
- Below: **Screenshots / recording** section, same card-deck treatment, with a play button in the middle (video), `<` `>` arrows

## Page 3: "Review files and changes"

- One card: header row `File.tsx` on the left, `+33 -4` on the right
- `<` and `>` arrows outside the card for previous / next file
- Bottom-right of the card: an **X** (reject) and a **✓** (approve) circle button
- Under the card: a comment textarea with a **Comment** button
- Legend: "Approved" shows the ✓ highlighted, "Rejected" shows the X highlighted
- A crossed-out line ("white is slightly greyed out"), replaced by:
  - if approved → **green overlay**
  - if rejected → **red overlay**
  - if commented only → **grey overlay**

## Page 4: "Approve – continues on next" (interaction flow)

- Card with X / ✓ and `<` `>` navigation, comment box with **Comment** button
- Pressing X points an arrow into the comment box, whose button becomes **Comment & Reject**
- Rules written out:
  - **Approve** – continues on next file
  - **Reject** – asks for comment, then moves on
  - **Comment** – moves on

## Page 5: "Review implementation evidence"

- Card titled `filename.jpeg`, stacked-deck carousel with `<` `>` arrows
- Label: "Comment about screenshot"
- Comment textarea with a **Comment** button

## Page 6: IMG_3926 (two card variants side by side)

- Top: `File.tsx` card with `<` `>`, X / ✓ buttons, comment box + **Cmnt** button
- Bottom: `File.jpeg` card with `<` `>`, a **Description** label under the image (agent-written caption), then a comment box + button
- Note: image cards have a description but no approve/reject; only comments

## Page 7: "Review Requirement / Spec"

- Card 1: `QI-1234 ↗` (Jira ticket with an external-link icon), body shows the ticket content
- Card 2: `Plan.md` with rendered markdown content
- Margin note on the Plan.md card: "→ not the best, should only be local" (MD spec files are read from the local disk, not uploaded anywhere)

## Page 8: "PR description" (session summary / submit)

- Small `QI-1234` reference card at the top
- **Overall feedback** textarea with a **Comment** button
- Horizontal rule
- **PR description** text block (agent-written summary of the change)
- **Submit** button at the bottom

## Derived requirements

### Entities
- A **review session** = one agent implementation run. It carries: spec references (Jira key, local md paths, artifact links), a set of changed files with diffs, a set of evidence items (screenshots, recordings) each with an agent-written description, extra agent content (markdown, html, diagrams), and a PR-style description.
- Per **file**: verdict (approved / rejected / none), one or more comments (file-level; line-level is a natural extension).
- Per **evidence item**: comments (optionally timestamped for video).
- Per **session**: overall feedback, final decision (approve / request changes / reject), submitted-at.

### UX rules
- Card-deck navigation with keyboard/arrow support; alternative full-scroll mode.
- Verdict colour overlays: green approved, red rejected, grey commented-only.
- Reject requires a comment; approve and comment advance automatically.
- Header shows aggregate stats (+/- lines, file count) and, implicitly, review progress.
- Spec panel with three source types: Jira, local markdown, Claude artifact (html/md).
- Evidence panel supports both images and video, with a description under each and a comment box.
- Submit page collects overall feedback, shows the PR description, and sends everything to the agent.

### Agent loop
- The agent produces the session; the reviewer's feedback goes back to the agent, which responds/acts.
- The agent can also attach a visual representation of the implementation (code graph or similar).
