#!/usr/bin/env bash
# The server the end-to-end tests run against: a fresh PGlite database,
# development auth (no login), the demo job, and the built client served by
# the server itself, as in production (docs/hosting.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
pnpm --filter @annotinder/contracts build >/dev/null
pnpm --filter @annotinder/client exec vite build --logLevel error
data=$(mktemp -d)
trap 'rm -rf "$data"' EXIT
cd packages/server
PORT="${E2E_PORT:-8799}" PGLITE_DIR="$data" ANNOTINDER_DEV_AUTH=1 ANNOTINDER_DEMO=1 \
  ANNOTINDER_CLIENT_DIR="$(cd ../client/dist && pwd)" ANNOTINDER_SECRET=e2e npx tsx src/index.ts
