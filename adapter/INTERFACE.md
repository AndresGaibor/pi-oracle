Playwright Adapter - Public Interface

This document defines the public API for the Playwright adapter used by pi-oracle.
It describes function signatures, expected parameter formats, snapshot token format and usage examples.

File: adapter/playwright-adapter.ts

Feature flag
- USE_PLAYWRIGHT (env): If not set or falsy, the adapter remains a no-op/stub and will throw when called. This lets integration happen later without changing callers.

Exported functions (all return Promises)

1) launch(options?: LaunchOptions): Promise<void>
- Purpose: Start the underlying browser/engine and prepare the adapter.
- Options:
  - headless?: boolean (default: true)
  - viewport?: { width: number; height: number }
  - userDataDir?: string (optional path for persistent profile)
  - extraArgs?: string[] (additional CLI args for the browser)
- Returns: void (resolves when browser is ready)

2) close(): Promise<void>
- Purpose: Gracefully close browser and free resources.
- Returns: void

3) open(url: string): Promise<PageRef>
- Purpose: Open a new page/tab and navigate to url.
- Returns: a PageRef object representing the page handle (opaque token used by other operations)
- PageRef format: { id: string } (string token stable for the adapter lifetime)

4) eval(pageRef: PageRef | string, script: string): Promise<EvalResult>
- Purpose: Run arbitrary JS code in the context of the page and return a serializable result.
- script: string of JS to evaluate. For convenience you can use `return` in the script to return a value.
- Returns: { success: boolean, value?: any, error?: string }

5) snapshotText(pageToken: string): Promise<string>
- Purpose: Capture a textual snapshot of the page for oracle processing.
- Returns: a plain text snapshot where interactive elements are annotated with short ref tokens (e.g. ref=e1).
- Format: lines like: - <kind> "<label>" ref=<refToken> : <value>
- The adapter must register element selectors internally and map ref tokens (e1,e2...) to those selectors for follow-up actions.

9) downloadByRef(refOrToken: string, destPath: string, pageToken?: string): Promise<void>
- Purpose: Trigger a download for the element identified by an adapter ref token (eN) or a selector string. When a selector string is provided, pageToken must be passed as a hint.
- Behaviour: Click the element, wait for Playwright's download event, then save the download to destPath using Playwright's download.saveAs().
- Errors: Rejects if the element is not found, download does not start within a timeout, or saveAs fails.

10) cookiesSet(cookies: Cookie[]): Promise<void>
- Cookie type: { name: string, value: string, domain?: string, path?: string, expires?: number, httpOnly?: boolean, secure?: boolean }

11) cookiesClear(): Promise<void>
- Purpose: Clear all cookies for the current browser/profile.

12) streamStatus(): AsyncIterable<StatusEvent>
- Purpose: Return an async iterable (async generator) that yields status events about the adapter and streams (e.g., downloads started/completed). Consumers can for-await over the returned iterable.
- StatusEvent: { type: string, ts: string, payload?: any }

Examples (JS)

import * as adapter from './adapter/playwright-adapter'

await adapter.launch({ headless: true })
const page = await adapter.open('https://example.com')
const snap = await adapter.snapshot({ pageRef: page, full: false })
// snapshots include tokens like <<ref:btn-1>>
console.log(snap.text)

// Click a token from snapshot
await adapter.click('btn-1')

// Evaluate script
const res = await adapter.eval(page, `return document.title`) 
console.log(res.value)

// Cleanup
await adapter.close()

Notes
- Snapshot token naming: adapter should expose token IDs without the surrounding `<<ref:...>>` when used as inputs to click/fill. For clarity callers may pass the raw token string or the quoted token (both should be accepted by the stub).
- All functions are asynchronous and should reject with meaningful errors when operations fail.

Acceptance criteria
- adapter/INTERFACE.md present
- adapter/playwright-adapter.ts exported function signatures with JSDoc and types
- adapter/README.md with short usage and feature flag note
- scripts/feature-flags.md describing USE_PLAYWRIGHT


