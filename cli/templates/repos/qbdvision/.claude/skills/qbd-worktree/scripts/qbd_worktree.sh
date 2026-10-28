#!/usr/bin/env bash
# My personal layer over the repo's run-qbd skill: Node from .nvmrc, the one-dev-stack
# workaround, Scout sessions, and a remove that archives the Scout session first.
#
# Usage:
#   qbd_worktree.sh new <ticket | words>     create (or reuse) a worktree for new work
#   qbd_worktree.sh checkout <branch>        worktree for an existing local or origin branch
#   qbd_worktree.sh onestack <worktree>      point the worktree at my one dev stack, finish bootstrap
#   qbd_worktree.sh link <worktree>          link plans/ and devtools/, copy local seed scripts, from the main checkout
#   qbd_worktree.sh playwright-env <checkout> write src/test/playwright/.env for running Playwright directly
#   qbd_worktree.sh up <worktree>            start the app (run_qbd.sh up)
#   qbd_worktree.sh seed <worktree> <args>   seed data (run_qbd.sh seed)
#   qbd_worktree.sh scout <worktree>         open the Scout session for the branch now
#   qbd_worktree.sh list                     worktrees with their ports and Scout session
#   qbd_worktree.sh remove <branch>          archive the Scout session, then wt remove
#
# Exit codes: 0 done, 1 failed, 2 a choice for the user, 3 an action only the user can take.
set -euo pipefail

say()  { printf '[qbd-wt] %s\n' "$*"; }
fail() { printf '[qbd-wt] ✗ %s\n' "$1" >&2; exit "${2:-1}"; }

# The main checkout is the parent of the shared .git dir, wherever this runs from.
main_checkout() {
  local common
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || fail "run this inside a qbdvision checkout"
  dirname "$common"
}
MAIN="$(main_checkout)"
RUN_QBD="$MAIN/.agents/skills/run-qbd/scripts/run_qbd.sh"

# Background wt hooks and my shell can be on another Node, so every step pins .nvmrc.
use_project_node() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  local want; want="$(cat "$MAIN/.nvmrc")"
  nvm use "$want" >/dev/null || fail "Node $want is not installed. Run: nvm install $want" 3
  if [ "$(nvm version default)" != "$(nvm version "$want")" ]; then
    say "warning: the nvm default is $(nvm version default), .nvmrc wants $want. The wt background bootstrap uses the default; onestack reruns it on the right Node."
  fi
}

worktree_for_branch() {
  git -C "$MAIN" worktree list --porcelain | awk -v b="branch refs/heads/$1" '/^worktree /{p=substr($0,10)} $0==b{print p}'
}

resolve_worktree() {
  local target="$1" path
  if [ -d "$target" ]; then path="$(cd "$target" && git rev-parse --show-toplevel)"; else path="$(worktree_for_branch "$target")"; fi
  [ -n "$path" ] || fail "no worktree for '$target'"
  [ "$path" != "$MAIN" ] || fail "that is the main checkout, not a worktree"
  printf '%s\n' "$path"
}

cmd_new() {
  [ $# -gt 0 ] || fail "name a ticket or words, for example: QI-12345 sidebar badge" 2
  use_project_node
  bash "$RUN_QBD" target "$@"
}

cmd_checkout() {
  local branch="${1:-}" path
  [ -n "$branch" ] || fail "name the branch to check out" 2
  path="$(worktree_for_branch "$branch")"
  if [ -n "$path" ]; then say "reusing $path"; printf 'WORKTREE=%s\n' "$path"; return 0; fi
  if ! git -C "$MAIN" show-ref --verify -q "refs/heads/$branch"; then
    git -C "$MAIN" fetch -q origin "$branch" 2>/dev/null || fail "no local branch '$branch' and none on origin"
    git -C "$MAIN" branch -q --track "$branch" "origin/$branch"
    say "created local $branch tracking origin/$branch"
  fi
  use_project_node
  (cd "$MAIN" && wt switch --yes "$branch" </dev/null) >/dev/null 2>&1 || fail "wt switch $branch failed. Run it from $MAIN to see why"
  path="$(worktree_for_branch "$branch")"
  [ -n "$path" ] || fail "wt switch made no worktree for $branch"
  say "worktree $branch at $path. Its bootstrap runs in the background now"
  printf 'WORKTREE=%s\n' "$path"
}

# Untracked folders that live only in the main checkout, linked so relative paths in
# skills (plans/...) work in every worktree. The repo's ignore rules don't match a
# symlink, so the shared info/exclude covers them.
LOCAL_LINKS="plans src/main/client/devtools"
link_local_state() {
  local wt_path="$1" rel exclude
  exclude="$(git -C "$MAIN" rev-parse --path-format=absolute --git-common-dir)/info/exclude"
  for rel in $LOCAL_LINKS; do
    [ -d "$MAIN/$rel" ] || continue
    grep -qxF "/$rel" "$exclude" 2>/dev/null || printf '/%s\n' "$rel" >>"$exclude"
    if [ -L "$wt_path/$rel" ] || [ ! -e "$wt_path/$rel" ]; then
      ln -sfn "$MAIN/$rel" "$wt_path/$rel"
    else
      say "warning: $rel exists in the worktree and is not a link; left as is"
    fi
  done
}

# Gitignored scripts that import repo code by relative path. A link would make Node load the
# main checkout's code (and database) from a worktree, so these are copied, and refreshed only
# when the main checkout's copy is newer. Edit them in the main checkout.
LOCAL_COPIES="src/test/utilities/seedTestCompanies/seed_companies.js src/test/utilities/seedTestCompanies/company_registry.js"
copy_local_scripts() {
  local wt_path="$1" rel
  for rel in $LOCAL_COPIES; do
    [ -f "$MAIN/$rel" ] || continue
    if [ ! -e "$wt_path/$rel" ] || [ "$MAIN/$rel" -nt "$wt_path/$rel" ]; then
      mkdir -p "$(dirname "$wt_path/$rel")"
      cp -p "$MAIN/$rel" "$wt_path/$rel"
    fi
  done
}

cmd_link() {
  local p; p="$(resolve_worktree "${1:-$PWD}")"
  link_local_state "$p"; copy_local_scripts "$p"
  say "✓ linked: $LOCAL_LINKS; copied: $(echo "$LOCAL_COPIES" | wc -w | tr -d ' ') local scripts"
}

# The repo hook points each worktree at dev<slot>, but only dev<envprefix> exists for me.
cmd_onestack() {
  local wt_path base stack log_dir current pid cwd
  wt_path="$(resolve_worktree "${1:-$PWD}")"
  link_local_state "$wt_path"
  copy_local_scripts "$wt_path"
  base="$(git -C "$MAIN" config --local qbdvision.envprefix || true)"
  [ -n "$base" ] || fail "qbdvision.envprefix is not set. Run: npm run worktrunk:setup" 3
  stack="dev$base"
  use_project_node
  cd "$wt_path"
  say "worktree $wt_path, node $(node --version)"
  # run_qbd.sh up reads these logs, so each step below rewrites its own.
  log_dir="$MAIN/.git/wt/logs/$(git branch --show-current)/project/post-start"
  mkdir -p "$log_dir"

  bootstrap_running() {
    for pid in $(pgrep -f 'wt hook (run-pipeline|post-start)' || true); do
      cwd="$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null | sed -n 's/^n//p')"
      [ "$cwd" = "$wt_path" ] && return 0
    done
    return 1
  }
  if bootstrap_running; then
    say "waiting for the background bootstrap to finish..."
    while bootstrap_running; do sleep 3; done
  fi

  current="$(sed -n 's/^subdomain=//p' build_scripts/gradle.properties 2>/dev/null | tail -1)"
  if [ "$current" != "$stack" ]; then
    say "pointing the worktree at $stack (was: ${current:-none})"
    bash scripts/generate_gradle_props.sh local "$stack" </dev/null >"$log_dir/props.log" 2>&1 || { tail -20 "$log_dir/props.log" >&2; fail "props step failed"; }
  else
    say "already on $stack"
  fi
  for step in install db cognito build; do
    say "step: $step"
    wt hook post-start "project:$step" --foreground --yes </dev/null >"$log_dir/$step.log" 2>&1 \
      || { tail -20 "$log_dir/$step.log" >&2; fail "step $step failed (log: $log_dir/$step.log). Fix it, then run onestack again"; }
  done
  cmd_playwright_env "$wt_path"
  say "✓ bootstrap done on $stack"
}

# Gradle's testPlaywright passes these itself; a direct `npx playwright test` reads them from .env.
# The client .env is generated from the checkout's gradle.properties, so it already has its ports.
cmd_playwright_env() {
  local top client out key
  top="$(cd "${1:-$PWD}" && git rev-parse --show-toplevel)"
  client="$top/src/main/client/.env"
  out="$top/src/test/playwright/.env"
  [ -f "$client" ] || fail "no $client yet: run the bootstrap (onestack) first"
  val() { sed -n "s/^$1=//p" "$client" | tail -1 | sed 's/^"\(.*\)"$/\1/'; }
  [ -n "$(val FRONT_END_URL)" ] || fail "FRONT_END_URL missing from $client"
  {
    echo "# Written by qbd-worktree playwright-env from src/main/client/.env; rerun after the ports change."
    echo "BASE_URL=$(val FRONT_END_URL)/"
    echo "QBD_API_URL=$(val API_URL)"
    for key in AWS_REGION COGNITO_CLIENT_ID COGNITO_POOL_ID COGNITO_ENDPOINT; do echo "$key=$(val $key)"; done
  } >"$out"
  say "✓ wrote $out (BASE_URL $(val FRONT_END_URL)/)"
}

cmd_up()   { local p; p="$(resolve_worktree "${1:-$PWD}")"; use_project_node; bash "$RUN_QBD" up "$p"; }
cmd_seed() { local p; p="$(resolve_worktree "${1:-$PWD}")"; shift || true; use_project_node; bash "$RUN_QBD" seed "$p" "$@"; }

cmd_scout() {
  local p title ticket
  p="$(resolve_worktree "${1:-$PWD}")"
  command -v ai-review >/dev/null || fail "ai-review is not installed" 3
  ticket="$(git -C "$p" branch --show-current | grep -oE 'QI-[0-9]+' | head -1 || true)"
  title="$(git -C "$p" branch --show-current)"
  if [ -n "$ticket" ]; then ai-review init --repo "$p" --title "$title" --ticket "$ticket"; else ai-review init --repo "$p" --title "$title"; fi
}

cmd_list() {
  local path branch session
  git -C "$MAIN" worktree list --porcelain | awk '/^worktree /{p=substr($0,10)} /^branch /{sub("refs/heads/","",$2); print p"\t"$2}' |
  while IFS=$'\t' read -r path branch; do
    [ "$path" = "$MAIN" ] && continue
    session="$(ai-review status --repo "$path" --format json 2>/dev/null | jq -r '.session.url // "no Scout session"' || echo "no Scout session")"
    printf '%s\n  %s\n  %s\n  %s\n' "$branch" "$path" \
      "$(cd "$path" && bash "$MAIN/.claude/skills/_shared/checkout_runtime.sh" 2>/dev/null | jq -r '"web \(.apps[0].url), api \(.apps[1].url), mysql \(.databases[0].port)"' || echo "not bootstrapped")" \
      "$session"
  done
}

# Plain `wt remove` refuses a dirty worktree and keeps an unmerged branch. Scout
# checkpoints under ~/.ai-review/checkouts stay on disk.
cmd_remove() {
  local branch="${1:-}" path id
  [ -n "$branch" ] || fail "name the branch whose worktree to remove" 2
  path="$(worktree_for_branch "$branch")"
  [ -n "$path" ] || fail "no worktree for $branch"
  [ "$path" != "$MAIN" ] || fail "that is the main checkout"
  if command -v ai-review >/dev/null; then
    id="$(ai-review status --repo "$path" --format json 2>/dev/null | jq -r '.session.id // empty' || true)"
    if [ -n "$id" ]; then ai-review archive "$id" >/dev/null && say "archived Scout session $id (undo: ai-review archive --undo $id)"; else say "no Scout session for $branch"; fi
  fi
  (cd "$MAIN" && wt remove "$branch")
  say "✓ removed the worktree of $branch"
}

case "${1:-}" in
  new|checkout|link|playwright-env|onestack|up|seed|scout|list|remove) c="${1//-/_}"; shift; "cmd_$c" "$@" ;;
  *) sed -n '/^# Usage:/,/^# Exit codes/p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
