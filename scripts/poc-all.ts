// scripts/poc-all.ts
// Run a sequence of PoCs: evaluate, fill, upload, snapshot, download.
// Usage: bun scripts/poc-all.ts

process.env.USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT || '1';

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import adapter from '../adapter/playwright-adapter';

async function sha256(filePath: string) {
  const buf = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main() {
  console.log('POC All: starting');
  await adapter.launchPersistent('.poc-user-data', { headless: false, slowMo: 50, devtools: true } as any);

  const p1 = await adapter.newPage('about:blank');
  console.log('Evaluate test...');
  const evalRes = await adapter.evaluate(p1, `({ ok: true, ts: Date.now() })`);
  console.log('evaluate ->', evalRes);

  // create small page with inputs and downloads
  const html = `<!doctype html><html><body>
    <input id="text" />
    <input id="file" type="file" />
    <a id="dl" download="hello.txt" href="data:text/plain,hello">Download static</a>
    <button id="dyn">Dynamic download</button>
    <script>
      document.getElementById('dyn').addEventListener('click', () => {
        const blob = new Blob(['dynamic contents'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'dynamic.txt'; document.body.appendChild(a); a.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
      });
    </script>
  </body></html>`;

  const p2 = await adapter.newPage(`data:text/html,${encodeURIComponent(html)}`);

  console.log('Fill test...');
  await adapter.fill('#text', 'hola desde poc', p2);

  console.log('Upload test...');
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'poc-'));
  const filePath = path.join(tmp, 'poc.txt');
  await fs.promises.writeFile(filePath, 'poc upload file');
  await adapter.upload('#file', filePath, p2);

  console.log('Snapshot + download test...');
  const snap = await adapter.snapshotText(p2);
  console.log('Snapshot:\n', snap);

  // pick first ref token like e1
  const m = snap.match(/ref=(e\d+)/);
  if (m) {
    const token = m[1];
    const dest = path.join(os.tmpdir(), `poc-down-${Date.now()}.bin`);
    console.log('Downloading ref', token, 'to', dest);
    await adapter.downloadByRef(token, dest, p2);
    console.log('Downloaded. sha256=', await sha256(dest));
  } else {
    console.log('No ref found to download from snapshot');
  }

  await adapter.close();
  console.log('POC All: done');
}

main().catch((e)=>{ console.error(e); process.exit(1); });
