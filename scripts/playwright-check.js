import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';

// Respect feature flag USE_PLAYWRIGHT (default: enabled)
const useFlag = process.env.USE_PLAYWRIGHT ?? '1';
if (useFlag === '0' || useFlag.toLowerCase() === 'false') {
  console.log('USE_PLAYWRIGHT disabled. Exiting without launching browser.');
  process.exit(0);
}

async function run() {
  // Import playwright dynamically so the script still loads even if package isn't installed
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    console.error('Failed to import playwright. Did you run `npm install` and `npx playwright install`?');
    console.error(err);
    process.exit(2);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'playwright-'));
  console.log('Created temporary user data dir:', tmpDir);

  let context;
  try {
    // launchPersistentContext stores profile data in tmpDir
    context = await playwright.chromium.launchPersistentContext(tmpDir, {
      headless: true,
      // Use small timeout for quick-check; adjust if needed
      timeout: 30000
    });

    const page = await context.newPage();
    await page.goto('about:blank');
    console.log('Successfully opened about:blank with a persistent context.');
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
