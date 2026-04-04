/**
 * Capture browser diagnostics (URL, snapshot, body, screenshot) to a logs directory.
 */

import * as browser from "../lib/browser";
import { secureWriteText } from "./helpers";

export async function captureDiagnostics(
  logsDir: string,
  reason: string,
  browserConnected: boolean,
): Promise<void> {
  if (!browserConnected) return;
  try {
    const [url, snapshot, body] = await Promise.all([
      browser.getUrl().catch(() => ""),
      browser.snapshotText().catch(() => ""),
      browser.pageText().catch(() => ""),
    ]);
    await secureWriteText(`${logsDir}/${reason}.url.txt`, `${url || ""}\n`);
    await secureWriteText(`${logsDir}/${reason}.snapshot.txt`, `${snapshot || ""}\n`);
    await secureWriteText(`${logsDir}/${reason}.body.txt`, `${body || ""}\n`);
    await browser.screenshot(`${logsDir}/${reason}.png`).catch(() => undefined);
  } catch {
    // Diagnostics should never throw
  }
}
