Playwright adapter PoC (bun)

This directory contains a small Playwright adapter (TypeScript) and PoC scripts demonstrating eval, fill, upload, snapshot and download operations.

Files
- adapter/playwright-adapter.ts — TypeScript adapter exposing: launchPersistent, newPage, close, eval, fill, upload, registerElement, snapshotText, downloadByRef
- scripts/adapter-poc-eval.ts — PoC script that launches a persistent context, opens pages, performs eval, fill and upload, then closes the context.
- scripts/adapter-poc-snapshot.ts — PoC script that demonstrates snapshotText and downloadByRef (saves file to /tmp and prints sha256).

Requirements
- Bun (https://bun.sh) or a Node.js environment
- Playwright
- typescript (for compilation) and/or ts-node if running the PoC directly from TypeScript

Install (using bun)
1. Install dev dependencies (recommended):
   bun add -d typescript ts-node playwright
2. Install browser binaries required by Playwright:
   bunx playwright install

Running the PoC (using bun)
- Quick (ts-node via bunx):
  USE_PLAYWRIGHT=1 bunx ts-node scripts/adapter-poc-snapshot.ts

- Or compile + run with bun (tsc then node):
  bunx tsc scripts/adapter-poc-snapshot.ts --outDir dist && USE_PLAYWRIGHT=1 bun dist/scripts/adapter-poc-snapshot.js

Notes
- This adapter is gated behind the environment flag USE_PLAYWRIGHT=1. If the flag is not set the adapter will throw an error immediately when used. This avoids loading Playwright when not desired.
- The adapter uses Playwright's chromium.launchPersistentContext to create a persistent profile (defaults to a temp dir). Set PW_HEADLESS=0 to run with a visible browser window.
- snapshotText(pageToken) will traverse the DOM and register interactive elements, returning a textual snapshot with short refs (e1,e2...). Use downloadByRef(ref, destPath, pageToken?) to trigger downloads for those refs.

Example usage
- See scripts/adapter-poc-snapshot.ts for a minimal example that:
  1) launches persistent context
  2) opens a small data: HTML page and collects a snapshot
  3) selects a ref from the snapshot and triggers a download to /tmp
  4) prints the SHA256 of the downloaded file

API (short)
- launchPersistent(userDataDir?)
- newPage(url?) -> returns page token (p1, p2...)
- close()
- eval(pageToken, script) -> any
- fill(refOrToken, text, pageTokenHint?)
- upload(refOrToken, filePath, pageTokenHint?)
- registerElement(pageToken, selector) -> element token (e1...)
- snapshotText(pageToken) -> textual snapshot string
- downloadByRef(refOrToken, destPath, pageToken?) -> triggers download and saves file

Caveats
- Keep functions short and focused in this PoC. This implementation is intentionally minimal and intended for proof-of-concept usage. For production usage consider better error handling, timeouts, and resource cleanup.

Note: PoC JS artifacts were removed; only the TypeScript adapter is maintained now.