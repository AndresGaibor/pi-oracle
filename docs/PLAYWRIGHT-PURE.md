# Playwright Pure Implementation Guide

## Overview
This project uses **Playwright pure** - a native browser automation framework without mixing other libraries like Puppeteer, Selenium, or agent-browser.

Playwright provides:
- Cross-browser support (Chromium, Firefox, WebKit)
- Fast, reliable automation
- Built-in anti-detection features
- Native support for persistent browser contexts
- Comprehensive API for all browser interactions

## Key Concepts

### Persistent Browser Context (`launchPersistentContext`)
Used throughout the project to maintain browser state across sessions:

```typescript
import playwright from 'playwright';

// Launch with profile persistence
const context = await playwright.chromium.launchPersistentContext(profileDir, {
  headless: true,
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
});

const page = await context.newPage();
await page.goto('https://example.com');
```

**Benefits:**
- Profile data persists across runs
- Cookies, localStorage, IndexedDB maintained
- Authentication state preserved
- Cache reused

### Page Navigation & Interaction

#### Waiting for Elements
```typescript
// Wait for selector to be visible
await page.waitForSelector('.button', { state: 'visible', timeout: 3000 });

// Wait for element to be attached to DOM
await page.waitForSelector('.input', { state: 'attached', timeout: 3000 });
```

#### Filling Input Fields
```typescript
// Simple fill
await page.fill('#input-id', 'value');

// With validation
const handle = await page.$('#input-id');
if (handle) {
  await handle.setInputFiles('/path/to/file');
}
```

#### Evaluating JavaScript
```typescript
// Run code in page context
const result = await page.evaluate(() => {
  return document.body.innerText;
});

// Pass arguments
const value = await page.evaluate((selector: string) => {
  return document.querySelector(selector)?.textContent;
}, '.element');
```

### Storage State Management

#### Saving Authentication
```typescript
// After login, save the storage state
await context.storageState({ path: 'auth-state.json' });
```

#### Reusing Saved State
```typescript
// Create new context with saved state
const context = await browser.newContext({
  storageStatePath: 'auth-state.json'
});
```

### Cookie Handling

#### Setting Cookies
```typescript
await context.addCookies([
  {
    name: 'session',
    value: 'abc123',
    domain: 'example.com',
    path: '/',
    expires: Math.round(Date.now() / 1000) + 86400,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax'
  }
]);
```

#### Clearing Cookies
```typescript
// Clear all cookies
await context.clearCookies();

// Or clear specific domain
await context.clearCookies({ domain: 'example.com' });
```

### Screenshots & Downloads

#### Taking Screenshots
```typescript
// Full page screenshot
await page.screenshot({ path: 'screenshot.png', fullPage: true });

// Specific element
const element = await page.$('.element');
await element?.screenshot({ path: 'element.png' });
```

#### Handling Downloads
```typescript
// Listen for download event
const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
await page.click('a[href*="download"]');
const download = await downloadPromise;
await download.saveAs('./downloads/file.pdf');
```

## Architecture

### Adapter Pattern
The project uses `playwright-adapter.ts` as a wrapper around Playwright's API:
- Manages page lifecycle
- Maintains element references (e1, e2, etc.)
- Provides convenience methods
- Handles error normalization

### State Management
- **Pages**: Stored with tokens (p1, p2, etc.) for reference
- **Elements**: Registered selectors with tokens (e1, e2, etc.) for persistence
- **Context**: Persistent profile maintained across runs

## Best Practices

### 1. Always Use `waitForSelector`
Before interacting with elements:
```typescript
await page.waitForSelector(selector, { state: 'visible', timeout: 3000 })
  .catch(() => null);
await page.fill(selector, 'value');
```

### 2. Handle Timeouts Gracefully
```typescript
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (error) {
  // Handle timeout or navigation error
}
```

### 3. Close Resources Properly
```typescript
try {
  // ... use context and pages
} finally {
  await context.close();
}
```

### 4. Use Try-Catch for Stability
Wrap user-facing interactions:
```typescript
try {
  await page.fill(selector, text);
} catch (err) {
  throw new Error(`fill failed for ${selector}: ${err.message}`);
}
```

### 5. Evaluate Context Isolation
JavaScript in `page.evaluate()` runs in browser context, not Node:
```typescript
// ✅ Correct - no access to Node modules
const title = await page.evaluate(() => document.title);

// ❌ Incorrect - fs, path not available in browser
const data = await page.evaluate(() => fs.readFileSync('file.txt'));
```

### 6. Element Reference Pattern
For complex workflows, register and reuse selectors:
```typescript
// Register
const token = registerElement(pageToken, 'button[aria-label="Send"]');

// Later reuse
const { page, selector } = resolveRef(token, pageToken);
await page.click(selector);
```

## Testing Playwright Setup

Run sanity checks:
```bash
# Check Playwright installation
bun run playwright-check

# Verify adapter functionality
bun scripts/adapter-tests/run-tests.ts
```

## No External Dependencies

This project maintains **pure Playwright** without:
- ❌ Puppeteer
- ❌ Selenium
- ❌ WebDriver
- ❌ Cypress
- ❌ agent-browser or similar
- ❌ Heavy framework wrappers

Single source of truth: Playwright's native API.

## Debugging

### Enable Playwright Inspector
```bash
PWDEBUG=1 bun run <script>
```

### View Network Activity
```typescript
page.on('response', response => {
  console.log(`${response.status()} ${response.url()}`);
});
```

### Check Page State
```typescript
const state = await page.evaluate(() => ({
  url: window.location.href,
  title: document.title,
  cookies: document.cookie
}));
console.log(state);
```

## Environment Variables

- `USE_PLAYWRIGHT=1` - Enable Playwright adapter (default: enabled)
- `PW_HEADLESS=1` - Run headless (default: true)
- `BRAVE_PATH` - Custom Brave browser path
- `PWDEBUG=1` - Enable debug inspector

## References

- [Playwright Documentation](https://playwright.dev)
- [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext)
- [Page API](https://playwright.dev/docs/api/class-page)
- [Best Practices](https://playwright.dev/docs/best-practices)
