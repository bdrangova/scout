export const SCHEMA_VERSION = 2

export const DEFAULT_SERVER_PORT = 4545
export const DEFAULT_WEB_PORT = 4546
/** Host of the dashboard links: a `.localhost` name always resolves to this machine, no hosts entry needed. */
export const DASHBOARD_HOST = 'scout.localhost'

/** `<yyyymmdd>-<hhmm>-<slug>-<4hex>` */
export const SESSION_ID_RE = /^\d{8}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{4}$/
/** `c<n>`, n >= 1 */
export const COMMENT_ID_RE = /^c[1-9]\d*$/
/** `j<n>`, n >= 1: a journal entry id, never reused. */
export const JOURNAL_ID_RE = /^j[1-9]\d*$/
/** 16 lowercase hex chars: the content-derived fingerprint of a file's change or of a whole tree. */
export const FINGERPRINT_RE = /^[0-9a-f]{16}$/

/** A file with more changed lines than this is collapsed (shown folded until the reviewer expands it). */
export const COLLAPSE_CHANGED_LINES = 1500
/** A file whose after-content is larger than this is collapsed. */
export const COLLAPSE_MAX_BYTES = 512 * 1024
/** A text file larger than this is left out of the patch entirely (`omitted`). */
export const OMIT_MAX_BYTES = 5 * 1024 * 1024

export const COLLAPSE_GLOBS: readonly string[] = [
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/*.snap',
  '**/*.min.*',
  '**/dist/**',
]

/** The session sections in tab order; the single source for the tabs, the `1–5` hotkeys and the shortcut help. */
export const SECTIONS = ['spec', 'extras', 'journal', 'evidence', 'files', 'submit'] as const

/** The test-run sections in tab order (`overview`, `review`, the optional pages, `submit`). */
export const TEST_SECTIONS = ['overview', 'review', 'gaps', 'data-setup', 'logs', 'submit'] as const

/** The index the publish skills write into a test run folder (`<run>/test-run.json`). */
export const TEST_RUN_INDEX_FILE = 'test-run.json'
export const TEST_RUN_INDEX_SCHEMA_VERSION = 1

/** Files the agent writes into the session folder; the server watches them live. */
/** Session folders live under `<home>/sessions/<id>`; archived ones are moved whole to `<home>/archive/<id>`. */
export const SESSIONS_DIR = 'sessions'
export const ARCHIVE_DIR = 'archive'
/** Not-started PR reviews, one `<id>.json` each (`PendingPrReviewSchema`). */
export const PR_PENDING_DIR = 'pr-pending'
/** PRs marked Done from the Assigned PRs tab (`GithubDoneSchema`). */
/** `<session>/review/pr-status.json`: a PR review's In progress / Commented / Approved. */
export const PR_STATUS_FILE = 'pr-status.json'
export const GITHUB_DONE_FILE = 'github-done.json'
/** Written into an archived session folder: `{ archivedAt }`. */
export const ARCHIVED_FILE = 'archived.json'
/** Scout's settings in the home root (`SettingsSchema`). */
export const CONFIG_FILE = 'config.json'

export const SESSION_EVIDENCE_DIR = 'evidence'
export const SESSION_EXTRAS_DIR = 'extras'
export const SESSION_SPEC_DIR = 'spec'
export const SESSION_PR_DESCRIPTION_FILE = 'pr-description.md'
export const ARTIFACT_INDEX_FILE = 'index.json'
/** GitHub PR comments of a session (posix, relative to the session folder): written by `ai-review pr-sync` / `pr-resolve`. */
export const PR_COMMENTS_FILE = 'review/pr-comments.json'
export const PR_RESOLUTIONS_FILE = 'review/pr-resolutions.json'
/** Scout's journal (agent-owned, written by `ai-review journal`; posix, relative to the session folder). */
export const JOURNAL_FILE = 'review/journal.json'
/** Dashboard-written drafts: the user's instruction for an open comment, or the reply to post for an answered one. */
export const PR_REPLIES_FILE = 'review/pr-replies.json'
/** GitHub's comment body limit is 65536 characters. */
export const PR_REPLY_MAX_LENGTH = 65_000
/** `rc<n>` review (line) comment, `ic<n>` issue (conversation) comment, `rv<n>` review summary; n = the GitHub database id. */
export const PR_COMMENT_ID_RE = /^(?:rc|ic|rv)[1-9]\d*$/
