#!/bin/sh
# The same script as the lab's Docker Compose standards (societal-analytics-lab-infra, install/compose.md).
# Database backup service: dumps the database once at the start, then every day at BACKUP_TIME (UTC),
# into /backups, and keeps the dumps of the last KEEP_DAYS days. Runs in the official postgres image.
# Settings: PGHOST, PGUSER, PGPASSWORD, PGDATABASE (the connection), BACKUP_TIME (default 02:00),
# KEEP_DAYS (default 7), DUMP_OPTIONS (extra pg_dump options).
set -eu
umask 077
time="${BACKUP_TIME:-02:00}"
keep="${KEEP_DAYS:-7}"
hours="${time%%:*}"; minutes="${time##*:}"
at=$(( ${hours#0} * 3600 + ${minutes#0} * 60 ))   # "08" would be read as octal, so without the leading 0

dump() {
	file="/backups/$PGDATABASE-$(date -u +%Y%m%d).dump"
	# shellcheck disable=SC2086
	if pg_dump --format=custom ${DUMP_OPTIONS:-} > "$file.partial"; then
		mv "$file.partial" "$file"
		echo "$(date -u -Iseconds) dump written: $file"
	else
		rm -f "$file.partial"
		echo "$(date -u -Iseconds) ERROR: pg_dump failed" >&2
	fi
	find /backups -name "$PGDATABASE-*.dump" -type f -mtime +"$((keep - 1))" -delete
}

until pg_isready -q; do sleep 5; done
dump
while true; do
	now=$(date -u +%s)
	next=$(( now - now % 86400 + at ))
	[ "$next" -gt "$now" ] || next=$(( next + 86400 ))
	sleep $(( next - now ))
	dump
done
