#!/usr/bin/env bash
# Smoke test for a running AnnoTinder server (docs/hosting.md, "Smoke test").
#
#   scripts/smoke-test.sh <base url> [api key]
#   scripts/smoke-test.sh https://annotinder.example.org
#   ANNOTINDER_API_KEY=<key> scripts/smoke-test.sh https://annotinder.example.org
#
# Checks the health endpoint (and prints the release and commit), the app and
# the coder pages, the login settings, that the researcher API refuses
# requests without a login, and, with an API key, `GET /api/me`. The key can
# also come from ANNOTINDER_API_KEY, which keeps it out of the shell history.
# Needs only bash and curl. Exits with 1 if any check fails.

set -u

base="${1:-}"
key="${2:-${ANNOTINDER_API_KEY:-}}"
if [ -z "$base" ] || [ "$base" = "-h" ] || [ "$base" = "--help" ]; then
	sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
	exit 2
fi
base="${base%/}"

failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
note() { printf '        %s\n' "$1"; }

body=""
status=""
headers=""
# get <path> [curl options...]: sets $status, $body and $headers
get() {
	local path="$1"
	shift
	local tmp
	tmp="$(mktemp)"
	status="$(curl -sS --max-time 20 -D "$tmp.h" -o "$tmp" -w '%{http_code}' "$@" "$base$path" 2>"$tmp.e")" || status="000"
	body="$(cat "$tmp")"
	headers="$(tr -d '\r' < "$tmp.h" 2>/dev/null)"
	[ "$status" = "000" ] && body="$(cat "$tmp.e")"
	rm -f "$tmp" "$tmp.h" "$tmp.e"
}
# field <name>: a string or boolean field from the JSON in $body (flat objects only)
field() { printf '%s' "$body" | grep -o "\"$1\":\(\"[^\"]*\"\|true\|false\|null\)" | head -n 1 | sed 's/^"[^"]*"://; s/^"//; s/"$//'; }
header() { printf '%s\n' "$headers" | grep -i "^$1:" | tail -n 1 | sed 's/^[^:]*: *//'; }

echo "AnnoTinder smoke test: $base"

# 1. Health: the server runs and answers with its version
get /api/health
if [ "$status" = "200" ] && [ "$(field ok)" = "true" ] && [ "$(field service)" = "annotinder" ]; then
	pass "GET /api/health: release $(field release), commit $(field commit)"
	[ "$(field commit)" = "unknown" ] && note "the commit is unknown: build with ANNOTINDER_COMMIT (docs/hosting.md, \"Updating\")"
else
	fail "GET /api/health: status $status: $(printf '%s' "$body" | head -c 200)"
	echo "The server is not reachable at $base: no further checks."
	exit 1
fi

# 2. The app: the built client, with the security headers
get /
if [ "$status" = "200" ] && printf '%s' "$body" | grep -q '<div id="root">'; then
	pass "GET /: the app"
else
	fail "GET /: status $status, not the app (is ANNOTINDER_CLIENT_DIR set? The image sets it)"
fi
if [ -n "$(header content-security-policy)" ]; then
	pass "security headers (Content-Security-Policy)"
else
	fail "no Content-Security-Policy header on / (does a proxy remove it?)"
fi
case "$base" in
https://*)
	if [ -n "$(header strict-transport-security)" ]; then
		pass "HTTPS, with Strict-Transport-Security"
	else
		fail "no Strict-Transport-Security header: is ANNOTINDER_PUBLIC_URL set to the https:// address?"
	fi
	;;
esac

# 3. Login: configured (or development mode on a local test server)
get /api/auth/options
if [ "$status" = "200" ]; then
	login="$(field login)"
	devmode="$(field devMode)"
	if [ "$login" = "true" ]; then
		pass "GET /api/auth/options: login configured"
	elif [ "$devmode" = "true" ]; then
		pass "GET /api/auth/options: development mode (no login; only for a local test server)"
	else
		fail "GET /api/auth/options: login is not configured, so nobody can log in (OIDC_HOST, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, ANNOTINDER_PUBLIC_URL)"
	fi
	[ "$login" = "true" ] && [ "$devmode" = "true" ] && fail "development mode is on (AUTH_DEV_MODE): never on a server other people use"
else
	fail "GET /api/auth/options: status $status"
fi

# 3b. Starting a login: the server reaches the provider and sends the browser there
if [ "${login:-}" = "true" ]; then
	get /api/auth/login
	location="$(header location)"
	if [ "$status" = "302" ] && [ -n "$location" ]; then
		query="${location#*\?}"
		param() { printf '%s' "$query" | tr '&' '\n' | grep "^$1=" | head -n 1 | sed "s/^$1=//; s/+/ /g; s/%/\\\\x/g" | xargs -0 printf '%b'; }
		redirect="$(param redirect_uri)"
		pass "GET /api/auth/login: to ${location%%\?*}"
		note "client $(param client_id), scope \"$(param scope)\", PKCE $(param code_challenge_method), redirect URI $redirect"
		case "$redirect" in
		"$base/api/auth/callback") ;;
		*/api/auth/callback) note "the redirect URI is not on $base: fine when testing from the server itself, else check ANNOTINDER_PUBLIC_URL" ;;
		*) fail "unexpected redirect URI: $redirect" ;;
		esac
	else
		fail "GET /api/auth/login: status $status, expected a redirect to the provider (can the server reach OIDC_HOST? See the server's log)"
	fi
fi

# 4. The researcher API refuses a request without a login (skipped in development mode, which logs everyone in)
if [ "${devmode:-}" != "true" ]; then
	get /api/me
	if [ "$status" = "401" ]; then
		pass "GET /api/me without a login: 401"
	else
		fail "GET /api/me without a login: status $status, expected 401"
	fi
fi

# 5. With an API key: who it belongs to
if [ -n "$key" ]; then
	get /api/me -H "authorization: Bearer $key"
	if [ "$status" = "200" ] && [ -n "$(field email)" ]; then
		pass "GET /api/me with the API key: $(field email) ($(field role))"
	else
		fail "GET /api/me with the API key: status $status: $(printf '%s' "$body" | head -c 200)"
	fi
fi

# 6. The coder home page, and unknown API paths answer JSON (not the app)
get /code
if [ "$status" = "200" ] && printf '%s' "$body" | grep -q '<div id="root">'; then
	pass "GET /code: the coder home page"
else
	fail "GET /code: status $status"
fi
get /api/no-such-endpoint
if [ "$status" = "404" ] && printf '%s' "$body" | grep -q '"error"'; then
	pass "GET /api/<unknown>: 404 as JSON"
else
	fail "GET /api/<unknown>: status $status, expected a JSON 404"
fi

if [ "$failures" -gt 0 ]; then
	echo "$failures check(s) failed."
	exit 1
fi
echo "All checks passed."
