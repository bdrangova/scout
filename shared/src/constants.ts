export const SCHEMA_VERSION = 2

export const DEFAULT_SERVER_PORT = 4545
export const DEFAULT_WEB_PORT = 4546

/** `<yyyymmdd>-<hhmm>-<slug>-<4hex>` */
export const SESSION_ID_RE = /^\d{8}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{4}$/
/** `run-<yyyymmddhhmmss>-<4hex>` */
export const RUN_ID_RE = /^run-\d{14}-[0-9a-f]{4}$/
/** `c<n>`, n >= 1 */
export const COMMENT_ID_RE = /^c[1-9]\d*$/
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

export const SECTIONS = ['files', 'evidence', 'spec', 'extras', 'submit'] as const

/** Files the agent writes into the session folder; the server watches them live. */
/** Session folders live under `<home>/sessions/<id>`; archived ones are moved whole to `<home>/archive/<id>`. */
export const SESSIONS_DIR = 'sessions'
export const ARCHIVE_DIR = 'archive'
/** Written into an archived session folder: `{ archivedAt }`. */
export const ARCHIVED_FILE = 'archived.json'

export const SESSION_EVIDENCE_DIR = 'evidence'
export const SESSION_EXTRAS_DIR = 'extras'
export const SESSION_SPEC_DIR = 'spec'
export const SESSION_PR_DESCRIPTION_FILE = 'pr-description.md'
export const ARTIFACT_INDEX_FILE = 'index.json'
