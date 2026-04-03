// scripts/simulate-worker.ts
// Simulate a simple worker flow against a chat-like page using selectors provided.
// Usage examples:
// bun scripts/simulate-worker.ts --url='data:...' --file='/path/to/file' --composer='#composer' --fileSel='input[type=file]' --sendSel='#send'

process.env.USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT || '1';

import fs from 'fs';
import path from 'path';
import os from 'os';
import adapter from '../adapter/playwright-adapter';

function parseArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const url = parseArg('url') || `data:text/html,${encodeURIComponent(`<!doctype html><html><body>
    <textarea id="composer"></textarea>
    <input id="file" type="file" />
    <button id="send">Send</button>
  </body></html>`)}`;

  const filePath = parseArg('file') || (() => { const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'sim-')); const p = path.join(tmp,'file.txt'); fs.writeFileSync(p,'sim file'); return p; })();
  const composerSel = parseArg('composer') || '#composer';
  const fileSel = parseArg('fileSel') || '#file';
  const sendSel = parseArg('sendSel') || '#send';

  console.log('Simulate worker: opening', url);
  await adapter.launchPersistent('.sim-user-data', { headless: false, slowMo: 50 } as any);
  const p = await adapter.newPage(url);

  console.log('Filling composer', composerSel);
  await adapter.fill(composerSel, 'Este es un prompt de prueba', p);

  console.log('Uploading file', filePath, 'to', fileSel);
  await adapter.upload(fileSel, filePath, p);

  console.log('Clicking send', sendSel);
  // clicking by ref: register selector then click via downloadByRef-like approach
  // we reuse evaluate to click
  await adapter.evaluate(p, `() => { const el = document.querySelector(${JSON.stringify(sendSel)}); if(el) el.click(); return true; }`);

  console.log('Simulate worker done — keep browser open for inspection until ENTER');
  await new Promise<void>((resolve)=>{ process.stdin.resume(); process.stdin.once('data', ()=>resolve()); });

  await adapter.close();
}

main().catch(e=>{ console.error(e); process.exit(1); });
