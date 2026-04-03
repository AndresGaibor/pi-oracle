import adapter from "../adapter/playwright-adapter";
import fs from "fs/promises";
import crypto from "crypto";

async function main() {
  if (process.env.USE_PLAYWRIGHT !== "1") {
    console.error("Set USE_PLAYWRIGHT=1 to run this PoC");
    process.exit(1);
  }
  const userProfile = undefined; // use default tmp profile
  await adapter.launchPersistent(userProfile);

  const html = `<!doctype html>
<html>
  <body>
    <a id="dl1" href="data:text/plain;utf-8,hello%20world" download="hello1.txt">Download 1</a>
    <button id="dlbtn">Download 2</button>
    <button id="btn1">Click me</button>
    <script>
      document.getElementById('dlbtn').addEventListener('click', () => {
        const data = 'generated file content ' + Date.now();
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hello2.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      });
    </script>
  </body>
</html>`;

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  const page = await adapter.newPage(dataUrl);

  const snap = await adapter.snapshotText(page as string);
  console.log('Snapshot:\n', snap);

  const m = snap.match(/ref=(e\d+)/);
  if (!m) {
    console.error('No element ref found in snapshot');
    process.exit(2);
  }
  const ref = m[1];
  console.log('Selected ref:', ref);

  const dest = `/tmp/pi-download-${Date.now()}.bin`;
  await adapter.downloadByRef(ref, dest, undefined);

  // validate file exists and print sha256
  try {
    const data = await fs.readFile(dest);
    const sha = crypto.createHash('sha256').update(data).digest('hex');
    console.log('Downloaded file:', dest);
    console.log('SHA256:', sha);
  } catch (err) {
    console.error('Download failed or file missing', err);
    process.exit(3);
  }

  await adapter.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(10);
});
