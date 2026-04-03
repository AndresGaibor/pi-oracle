/**
 * Pure Playwright adapter tests
 * Run with: bun scripts/adapter-tests/run-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import playwright from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mkdirp = (p: string) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
};

async function run() {
  process.env.USE_PLAYWRIGHT = '1';
  console.log('TEST: USE_PLAYWRIGHT=', process.env.USE_PLAYWRIGHT);

  // Prepare profile dir for persistent context
  const profileDir = path.resolve(__dirname, 'tmp-profile');
  mkdirp(profileDir);

  let context: playwright.BrowserContext | null = null;
  let browser: playwright.Browser | null = null;

  try {
    console.log('Launching persistent browser context...');
    // Use launchPersistentContext to maintain profile across runs
    context = await playwright.chromium.launchPersistentContext(profileDir, {
      headless: true,
      timeout: 30000,
    });

    // Create page for testing
    const page = await context.newPage();
    
    // Navigate to test page
    const pagePath = path.resolve(__dirname, 'test-page.html');
    const pageUrl = `file://${pagePath}`;
    console.log('Opening test page:', pageUrl);
    await page.goto(pageUrl);

    // Test 1: evaluate JavaScript
    console.log('Running eval test...');
    const evalResult = await page.evaluate(() => ({
      hello: 'world',
      sum: 1 + 2,
    }));
    if (evalResult.hello !== 'world' || evalResult.sum !== 3) {
      throw new Error(
        `eval returned unexpected value: ${JSON.stringify(evalResult)}`
      );
    }
    console.log('✓ eval test passed');

    // Test 2: fill input field
    console.log('Running fill test...');
    await page.fill('#name', 'Alice');
    const nameValue = await page.$eval<string>(
      '#name',
      (el) => (el as HTMLInputElement).value
    );
    if (nameValue !== 'Alice') {
      throw new Error(`fill did not set value, got: ${nameValue}`);
    }
    console.log('✓ fill test passed');

    // Test 3: upload file
    console.log('Running upload test...');
    const fixture = path.resolve(__dirname, 'fixtures', 'testfile.txt');
    if (!fs.existsSync(fixture)) {
      // Create fixture for testing
      mkdirp(path.dirname(fixture));
      fs.writeFileSync(fixture, 'test file content');
    }
    
    await page.fill('#file', fixture);
    const fileNameResult = await page.$eval<string | null>(
      '#file',
      (el) => {
        const input = el as HTMLInputElement;
        return input.files?.[0]?.name || null;
      }
    );
    const expectedName = path.basename(fixture);
    if (fileNameResult !== expectedName) {
      throw new Error(`upload did not attach file, got: ${fileNameResult}`);
    }
    console.log('✓ upload test passed');

    console.log('\n✅ All tests passed');
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  } finally {
    // Cleanup: close context and browser
    if (context) {
      try {
        await context.close();
        console.log('Closed Playwright context.');
      } catch (e) {
        console.warn('Failed to close context:', e);
      }
    }
  }
}

run().catch((err) => {
  console.error('Unexpected error in test run:', err);
  process.exit(1);
});
