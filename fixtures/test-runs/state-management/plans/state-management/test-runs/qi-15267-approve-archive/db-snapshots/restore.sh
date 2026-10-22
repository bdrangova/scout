#!/usr/bin/env bash
# Restores the Archivers R US client DB from a snapshot (default: pristine). Usage: ./restore.sh [snapshot-prefix]
set -euo pipefail
cd "$(dirname "$0")"
PREFIX="${1:-pristine}"
C=qbdvision_database-mysql-1
export MYSQL_PWD
MYSQL_PWD="$(docker exec "$C" printenv MYSQL_ROOT_PASSWORD)"
docker exec -i -e MYSQL_PWD="$MYSQL_PWD" "$C" mysql -uroot -e "DROP DATABASE IF EXISTS client_local_ArchiversRUS; CREATE DATABASE client_local_ArchiversRUS;"
docker exec -i -e MYSQL_PWD="$MYSQL_PWD" "$C" mysql -uroot client_local_ArchiversRUS < "${PREFIX}-client_local_ArchiversRUS.sql"
