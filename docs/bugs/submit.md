# Submit bugs

## Open: per-file comment drafts are not sent
`draftFor`/`setDraft` drafts (typed in a file's comment box, not yet committed) live only in the
provider's state and are not part of the review, so Submit neither saves nor sends them. They are
not listed under "Will be sent", so the page is consistent, but a reviewer who types and goes
straight to Submit loses the text silently. Fix idea: warn on Submit when any draft is non-empty,
or commit drafts in `flushSave`. Needs a product call.

## Fixed: overall feedback missing from the send
The server snapshots the on-disk review; the debounced autosave had not written the blur-committed
comment yet. `send()` now awaits `flushSave()` and aborts when the save fails or conflicts.
