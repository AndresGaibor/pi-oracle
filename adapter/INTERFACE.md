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

3) newPage(url?: string): Promise<PageRef>
- Purpose: Open a new page/tab and navigate to url.
- Returns: a PageRef token representing the page handle (opaque token used by other operations)
- PageRef format: string token (p1, p2...) stable for the adapter lifetime

4) evaluate(pageRef: PageRef | string, script: string): Promise<any>
- Purpose: Run arbitrary JS code in the context of the page and return a serializable result.
- script: string of JS to evaluate. Can be an expression (e.g. `({ok:true})`) or statements (e.g. `document.title = 'x'; return document.title;`).
- Returns: the serializable result of the evaluation. If the page returns `{ __registerSelector: "#foo" }`, the adapter will register that selector and return an element token (e1...).

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
const page = await adapter.newPage('https://example.com')
const snap = await adapter.snapshotText(page)
// snapshots include tokens like e1
console.log(snap)

// Evaluate script
const res = await adapter.evaluate(page, `return document.title`)
console.log(res)

// Cleanup
await adapter.close()

Notes
- Snapshot token naming: adapter should expose token IDs without surrounding characters when used as inputs to click/fill. Callers may pass the raw token string or the quoted token (both should be accepted by the stub).
- All functions are asynchronous and should reject with meaningful errors when operations fail.

Acceptance criteria
- adapter/INTERFACE.md present
- adapter/playwright-adapter.ts exported function signatures with JSDoc and types
- adapter/README.md with short usage and feature flag note
- scripts/feature-flags.md describing USE_PLAYWRIGHT
