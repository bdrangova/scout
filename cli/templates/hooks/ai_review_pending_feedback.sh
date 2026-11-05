#!/usr/bin/env bash
# UserPromptSubmit hook: surfaces Scout feedback that is still open for this repository,
# once per (Claude session, pending set). The pending set is fingerprinted by the CLI, so the
# reminder returns only when new comments arrive after everything was resolved.
# Skipped when the prompt already runs /scout-apply-review, /scout-development-review, /scout-pr-comments or one of the test-review skills
# (/scout-test-plan, /scout-data-setup, /scout-test-run, /scout-apply-test-review).

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty')"
case "$prompt" in
  /scout-apply-review*|/scout-development-review*|/scout-pr-comments*) exit 0 ;;
  /scout-test-plan*|/scout-data-setup*|/scout-test-run*|/scout-apply-test-review*) exit 0 ;;
esac

session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
[ -n "$cwd" ] || cwd="$PWD"

AI_REVIEW="${AI_REVIEW_BIN:-$HOME/.ai-review/bin/ai-review}"
[ -x "$AI_REVIEW" ] || AI_REVIEW="$(command -v ai-review 2>/dev/null || true)"
[ -n "$AI_REVIEW" ] || exit 0

pending="$("$AI_REVIEW" pending --repo "$cwd" --format json 2>/dev/null)" || exit 0
[ "$(printf '%s' "$pending" | jq -r '.count // 0')" -gt 0 ] || exit 0

fingerprint="$(printf '%s' "$pending" | jq -r '.fingerprint')"
git_dir="$(git -C "$cwd" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
marker="$git_dir/ai-review/nagged-${session_id:-no-session}"
[ -f "$marker" ] && [ "$(cat "$marker")" = "$fingerprint" ] && exit 0
mkdir -p "$git_dir/ai-review" && printf '%s' "$fingerprint" > "$marker"

printf '%s' "$pending" | jq '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: .message
  }
}'
