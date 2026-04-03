#!/usr/bin/env bash
# Wrapper to run the auth-bootstrap TypeScript script with Bun
# Usage: ./run-auth-bootstrap.sh '<oracle-config-json>'

if [ -z "$1" ]; then
  echo "Usage: $0 '<oracle-config-json>'"
  exit 1
fi

export USE_PLAYWRIGHT=${USE_PLAYWRIGHT:-1}
# Run with bun directly (bun can run TS files)
bun run ./extensions/oracle/worker/auth-bootstrap.ts "$1"
