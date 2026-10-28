#!/bin/bash
# Prints this checkout's runtime (app URLs, database, services) as JSON for `ai-review env`
# and local skills. Run from inside a checkout: the main qbdvision clone or any wt worktree.
# The only place that reads build_scripts/gradle.properties for ports. Defaults mirror
# build_scripts/build.gradle (frontend 8080, backend 3000, db 3306, cognito 9230).
set -euo pipefail

top="$(git rev-parse --show-toplevel)"
props="$top/build_scripts/gradle.properties"
[ -f "$props" ] || { echo "no $props: run the worktree bootstrap first" >&2; exit 1; }

prop() { sed -n "s/^$1=//p" "$props" | tail -1; }
frontend_port="$(prop frontend_port)"; frontend_port="${frontend_port:-8080}"
backend_port="$(prop backend_port)"; backend_port="${backend_port:-3000}"
db_port="$(prop local_db_port)"; db_port="${db_port:-3306}"
db_name="$(prop local_db_database)"; db_name="${db_name:-common-local}"
cognito_endpoint="$(prop cognito_endpoint)"
cognito_port="${cognito_endpoint##*:}"
cognito_port="${cognito_port%%/*}"

folder="$(basename "$top")"
compose_project="$(printf '%s' "$folder" | tr '[:upper:]' '[:lower:]')_database"
if [ -z "$cognito_port" ] || [ "$cognito_port" = "9230" ]; then cognito_container="cognito-local"; else cognito_container="cognito-local-$cognito_port"; fi

# Every worktree points at the same dev stack (one-stack workaround), so the subdomain can't
# tell checkouts apart. The label is the branch prefix when it is a slot, else the folder.
branch="$(git -C "$top" branch --show-current 2>/dev/null || true)"
base="$(git -C "$top" config --local qbdvision.envprefix 2>/dev/null || true)"
label="$folder"
prefix="${branch%%-*}"
if [ -n "$base" ] && [[ "$prefix" =~ ^${base}[0-9]*$ ]]; then label="$prefix"; fi

linked=false
[ "$(git -C "$top" rev-parse --path-format=absolute --git-dir)" != "$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)" ] && linked=true
if [ "$linked" = true ] && [ -f "$top/.agents/skills/run-qbd/scripts/run_qbd.sh" ]; then
  start="bash .agents/skills/run-qbd/scripts/run_qbd.sh up \"$top\""
else
  start="npm run dev"
fi

jq -n \
  --arg label "$label" --arg top "$top" --arg start "$start" \
  --argjson fport "$frontend_port" --argjson bport "$backend_port" --argjson dport "$db_port" \
  --arg dbname "$db_name" --arg project "$compose_project" \
  --arg composefile "$top/build_scripts/docker/database/docker-compose.yml" \
  --arg cport "${cognito_port:-9230}" --arg ccontainer "$cognito_container" \
  '{
    label: $label,
    apps: [
      { name: "web", url: "http://localhost:\($fport)", port: $fport },
      { name: "api", url: "http://localhost:\($bport)", port: $bport }
    ],
    databases: [
      { name: "main", engine: "mysql", host: "127.0.0.1", port: $dport, database: $dbname,
        compose: { project: $project, file: $composefile, service: "mysql" } }
    ],
    services: [
      { name: "cognito-local", url: "http://127.0.0.1:\($cport)", port: ($cport | tonumber), container: $ccontainer },
      { name: "launchdarkly-dev", url: "http://localhost:8765", port: 8765, shared: true }
    ],
    start: $start,
    notes: [
      "LaunchDarkly dev server is shared by every checkout: flag overrides apply to all.",
      "DB credentials: root/root (local container only)."
    ]
  }'
