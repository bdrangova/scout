---
name: write-for-reviewers
description: How to write any text a reviewer reads in Scout (finding titles and comments, reproduction records, evidence captions, PR descriptions and summaries, resolution notes, journal entries, replies on GitHub). The review skills load it before they write; also use it when the user asks for clearer review text.
user-invocable: false
---
# Writing for reviewers

The reader is a person who did not see this conversation and often has not opened the code. They read on a card, between other cards. Write so they follow on first read.

## Always
- **Effect first.** Say what the user or the data sees, then why. "New equipment is saved with no type" beats "the form-change callback was never called".
- **Plain words.** Name code (functions, files, props) only when there is no other way to say where something is, and then once, in brackets. Filenames are fine when they help locate things.
- **Short sentences, one idea each.** No semicolons chaining facts. No internal shorthand ("PR 6/6", "base not rerun", "L3") without saying what it means.
- **What it means for them, then why.** A limitation, risk or caveat starts with what the reviewer should do with it.
- **Concrete.** Name the screen, the record, the value. "Open Library → Equipment → New" beats "navigate to /library/new".
- **No filler.** No restating the title, no "This PR…", no "Note that".

## By kind of text
- **Title** (finding, journal entry, PR): the effect people see, under 70 characters.
- **Expected / Actual:** mirror each other: same subject, same moment, so the difference jumps out.
- **Steps:** one action a person could repeat, in the app's own words.
- **Caption:** what the evidence shows, in a few words ("Type shows Physical before saving").
- **Evidence description:** two or three sentences: what is shown, which state, what to look at.
- **Summary bullets:** 2 to 6; lead with what changes for people who use the product, then what the reviewer should know (risky parts, what is left out, what the findings mean).
- **Resolution note:** what changed, where (`path:line`), how it was verified. A reply without a fix says why.
- **Reply on GitHub:** one or two sentences, written as the author: what you did, or why not.
- **Journal entry:** why, not what; the constraint behind it and what you rejected, in plain words. Detail that only makes sense in code terms goes in a last paragraph starting `**Technical detail:**`.
