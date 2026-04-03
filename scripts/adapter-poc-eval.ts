#!/usr/bin/env ts-node
import fs from "fs";
import os from "os";
import path from "path";
import adapter from "../adapter/playwright-adapter";

async function main() {
  if (process.env.USE_PLAYWRIGHT !== "1") {
    console.warn("Warning: USE_PLAYWRIGHT!=1 — PoC requires setting USE_PLAYWRIGHT=1. Continuing may throw.");
  }

  await adapter.launchPersistent();

  // open about:blank and run a simple eval that returns JSON
  const p1 = await adapter.newPage("about:blank");
  const result = await adapter.evaluate(p1, `({ ok: true, timestamp: Date.now() })`);
  console.log("Eval result:", result);

  // create a tiny test page with a text input and file input via data URL
  const html = `<!doctype html>
  <html>
  <body>
    <input id="text" />
    <input id="file" type="file" />
    <script>
      // expose a helper to read file name
      window.__getFileName = () => {
        const f = document.getElementById('file');
        if (!f || !f.files || !f.files[0]) return null;
        return f.files[0].name;
      };
    </script>
  </body>
  </html>`;

  const dataUrl = "data:text/html," + encodeURIComponent(html);
  const p2 = await adapter.newPage(dataUrl);

  // fill the text input
  await adapter.fill("#text", "Hello from PoC", p2);
  console.log("Filled text input on page", p2);

  // prepare a temporary file to upload
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-adapter-"));
  const filePath = path.join(tmpDir, "poc-upload.txt");
  fs.writeFileSync(filePath, "playwright upload proof\n");

  await adapter.upload("#file", filePath, p2);
  console.log("Uploaded file to input on page", p2);

  // read filename from page
  const uploadedName = await adapter.evaluate(p2, `() => ({ name: (window.__getFileName && window.__getFileName()) || null })`);
  console.log("Uploaded filename (from page):", uploadedName);

  await adapter.close();
}

main().catch((err) => {
  console.error("PoC error:", err);
  process.exit(1);
});
