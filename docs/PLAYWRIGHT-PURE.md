# Playwright Pure Architecture

This project uses **Playwright pure** for browser automation — no `agent-browser` CLI, no adapters, no workers.js.

## Architecture

### Browser Module (`extensions/oracle/lib/browser.ts`)

Pure Playwright module that provides:
- **Browser lifecycle**: `launch()`, `close()`, `isConnected()`
- **Page management**: `newPage()`, `open()`, `getUrl()`, `reload()`
- **DOM interaction**: `clickRef()`, `fill()`, `upload()`
- **Script evaluation**: `evaluate()` — run arbitrary JS in page context
- **Snapshot**: `snapshotText()` — textual DOM representation for AI parsing
- **Downloads**: `downloadByRef()` — handle file downloads
- **Cookies**: `cookiesSet()`, `cookiesClear()`
- **Screenshots**: `screenshot()`

### Workers

- **`worker/run-job.ts`** — Main job execution. Uses Playwright directly for all browser operations.
- **`worker/auth-bootstrap.ts`** — Authentication bootstrap. Uses Playwright for browser auth flow.

### How it works

1. Workers launch browsers via `chromium.launchPersistentContext()` with Brave/Chromium
2. All browser operations use Playwright's native API — no CLI spawning
3. Element references (`e1`, `e2`...) are tracked via an internal registry
4. Snapshot format remains compatible: `- kind "label" ref=eN : value`

## Key Differences from agent-browser

| Before (agent-browser) | After (Playwright Pure) |
|------------------------|------------------------|
| `spawn("agent-browser", [...])` | `browser.clickRef(ref)` |
| CLI session management | In-process BrowserContext |
| stdout/stderr parsing | Direct JS return values |
| External process lifecycle | Tied to worker process |

## Dependencies

- `playwright` — Browser automation framework
- `@steipete/sweet-cookie` — Cookie extraction from Chrome profiles (for auth bootstrap)
