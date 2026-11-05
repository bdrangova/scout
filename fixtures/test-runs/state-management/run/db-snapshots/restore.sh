#!/usr/bin/env bash
# Restores the Demo Co client DB from a snapshot (default: pristine). Usage: ./restore.sh [snapshot-prefix]
set -euo pipefail
cd "$(dirname "$0")"
PREFIX="${1:-pristine}"
C=foliant_database-mysql-1
DB=client_local_DemoCo
export MYSQL_PWD
MYSQL_PWD="$(docker exec "$C" printenv MYSQL_ROOT_PASSWORD)"
docker exec -i -e MYSQL_PWD="$MYSQL_PWD" "$C" mysql -uroot -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB;"
docker exec -i -e MYSQL_PWD="$MYSQL_PWD" "$C" mysql -uroot "$DB" < "${PREFIX}-$DB.sql"
