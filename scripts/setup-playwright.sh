#!/usr/bin/env bash
# Helper script to install Playwright deps for the adapter (skeleton)
# This script is intentionally minimal; real install may require extra flags.

set -euo pipefail

echo "Installing Playwright..."
if command -v npm >/dev/null 2>&1; then
  npm install -D playwright
  # optionally download browsers
  npx playwright install --with-deps || true
  echo "Playwright installed (browsers may require extra steps on macOS)."
else
  echo "npm not found; please install Node.js >=20 and rerun"
  exit 1
fi
