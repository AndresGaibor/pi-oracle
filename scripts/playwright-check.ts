/**
 * Pure Playwright sanity check
 * Verifies that Playwright can launch and control a persistent browser context
 * Run with: bun scripts/playwright-check.ts
 */
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import playwright from 'playwright';

// Respect feature flag USE_PLAYWRIGHT (default: enabled)
const useFlag = process.env.USE_PLAYWRIGHT ?? '1';
if (useFlag === '0' || useFlag.toLowerCase() === 'false') {
  console.log('USE_PLAYWRIGHT disabled. Exiting without launching browser.');
  process.exit(0);
}

async function run() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'playwright-'));
  console.log('Created temporary user data dir:', tmpDir);

  let context: playwright.BrowserContext | null = null;

  try {
    console.log('Launching persistent Playwright context...');
    // launchPersistentContext stores profile data in tmpDir
    // This is the pure Playwright way to maintain browser state
    context = await playwright.chromium.launchPersistentContext(tmpDir, {
      headless: true,
      timeout: 30000,
    });

    const page = await context.newPage();
    await page.goto('about:blank');
    console.log('✓ Successfully opened about:blank with a persistent context.');
  } catch (err) {
    console.error('Error launching persistent context or opening page:');
    console.error(err);
    process.exitCode = 3;
  } finally {
    if (context) {
      try {
        await context.close();
        console.log('Closed Playwright context.');
      } catch (e) {
        console.warn('Failed to close context:', e);
      }
    }
    // Clean up temporary dir
    try {
      await rm(tmpDir, { recursive: true, force: true });
      console.log('Removed temporary dir.');
    } catch (e) {
      // Not critical
    }
  }
}

run().catch((err) => {
  console.error('Unexpected error in playwright-check:', err);
  process.exit(4);
});
