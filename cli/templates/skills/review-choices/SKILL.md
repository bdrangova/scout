---
name: review-choices
description: The one question every Scout skill asks before it starts ("Use these recommendations?") and how it behaves with --auto or AI_REVIEW_HEADLESS=1. Loaded by the scout-* skills for their step 0.
user-invocable: false
---
# Asking for choices

## Auto mode
With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for user input: skip the question and take your own recommendations. When something is ambiguous, do the safe thing the calling skill names (leave a comment open with a specific question, decline with a question as the reason) instead of guessing.

## The question
Gather what the calling skill says to read first, work out a proposal for each of its choices, then ask once with AskUserQuestion:
- First question: "Use these recommendations?" with options "Accept all (Recommended)" and "Let me choose". Give both the same `preview`: every proposal on its own line, in the order the calling skill lists its choices.
- On "Accept all", use the proposals.
- On "Let me choose", ask the calling skill's questions. In each, the first option is your proposal, marked "(Recommended)", so accepting it takes one pick. At most 4 questions fit in one call; use a second call when there are more. Ask only what is unclear or what the calling skill lists; the user can always type their own answer under Other.
- Never ask about what the session or the arguments already fix (branch, base, ticket, run folder, flags given).

## After
Follow the answers in every later step. A part the user turned off is skipped without a placeholder, and the final report says what was skipped by choice.
