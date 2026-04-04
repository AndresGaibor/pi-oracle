#!/usr/bin/env bash
# Wrapper script to run the TypeScript oracle worker with Bun
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_TS="$SCRIPT_DIR/run-oracle-job.ts"

if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed. Please install bun to run the oracle worker." >&2
  exit 1
fi

# Pass all arguments to the TypeScript worker
exec bun run "$WORKER_TS" "$@"
