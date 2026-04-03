// scripts/debug-headful.ts
// Debug helper runnable with Bun directly: `bun scripts/debug-headful.ts`
// This script will launch a Playwright persistent context in headful mode
// and open a small interactive page. It will wait for you to press ENTER
// in the terminal before closing the browser.

// Ensure we run the adapter path resolving with TS support in Bun.
process.env.USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT || '1';

async function main() {
  try {
    // Dynamic import so Bun can handle TS sources and adapter's lazy behavior
    const mod = await import('../adapter/playwright-adapter');
    const adapter = mod.default || mod;

    console.log('Launching Playwright persistent context (headful)...');
    await adapter.launchPersistent('.debug-user-data', { headless: false, slowMo: 50, devtools: true });

    const pageToken = await adapter.newPage('about:blank');

    const html = `<!doctype html>
<html>
  <body>
    <h1>Debug headful test</h1>
    <label>Text: <input id="t" /></label>
    <label>File: <input id="f" type="file" /></label>
    <p><a id="dl" download="hello.txt" href="data:text/plain,hello">Download static</a></p>
    <button id="dyn">Dynamic download</button>
    <script>
      document.getElementById('dyn').addEventListener('click', () => {
        const blob = new Blob(['dynamic contents'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dynamic.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      });
    </script>
  </body>
</html>`;

    await adapter.eval(pageToken, `document.write(${JSON.stringify(html)});`);

    console.log('Page opened in headful mode. Interact with the browser window.');
    console.log('Press ENTER in this terminal to close the browser and exit.');

    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    console.log('Closing...');
    await adapter.close();
    process.exit(0);
  } catch (err) {
    console.error('Error in debug-headful.ts:', err instanceof Error ? err.message : String(err));
    console.error(err);
    process.exit(1);
  }
}

main();
