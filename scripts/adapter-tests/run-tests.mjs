// Run adapter Playwright tests
process.env.USE_PLAYWRIGHT = '1';
console.log('TEST: USE_PLAYWRIGHT=', process.env.USE_PLAYWRIGHT);
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
// IMPORTANT: dynamic import so we can set process.env before loading the adapter module
const { default: PlaywrightAdapter } = await import('../../adapter/playwright-adapter.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mkdirp = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };

async function run() {
  const adapter = new PlaywrightAdapter();
  // prepare profile dir
  const profileDir = path.resolve(__dirname, 'tmp-profile');
  mkdirp(profileDir);
  console.log('Launching persistent context...');
  await adapter.launchPersistentContext(profileDir, { headless: true });

  const pagePath = path.resolve(__dirname, 'test-page.html');
  const pageUrl = pathToFileURL(pagePath).href;
  console.log('Opening test page:', pageUrl);
  await adapter.open(pageUrl);

  // eval test
  console.log('Running eval test...');
  const evalRes = await adapter.evaluate('({hello: "world", sum: 1+2})');
  if (!evalRes.success) throw new Error('eval failed: ' + evalRes.error);
  if (evalRes.value.hello !== 'world' || evalRes.value.sum !== 3) throw new Error('eval returned unexpected value: ' + JSON.stringify(evalRes.value));
  console.log('eval test passed');

  // fill test
  console.log('Running fill test...');
  const fillRes = await adapter.fill('#name', 'Alice');
  if (!fillRes.success) throw new Error('fill failed: ' + fillRes.error);
  const nameRes = await adapter.evaluate('document.querySelector("#name").value');
  if (!nameRes.success) throw new Error('eval after fill failed: ' + nameRes.error);
  if (nameRes.value !== 'Alice') throw new Error('fill did not set value, got: ' + nameRes.value);
  console.log('fill test passed');

  // upload test
  console.log('Running upload test...');
  const fixture = path.resolve(__dirname, 'fixtures', 'testfile.txt');
  const uploadRes = await adapter.upload('#file', fixture);
  if (!uploadRes.success) throw new Error('upload failed: ' + uploadRes.error);
  const fileNameRes = await adapter.evaluate('document.querySelector("#file").files[0] && document.querySelector("#file").files[0].name');
  if (!fileNameRes.success) throw new Error('eval after upload failed: ' + fileNameRes.error);
  const expectedName = path.basename(fixture);
  if (fileNameRes.value !== expectedName) throw new Error('upload did not attach file, got: ' + String(fileNameRes.value));
  console.log('upload test passed');

  await adapter.close();
  console.log('\nAll tests passed');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
