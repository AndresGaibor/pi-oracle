/**
 * Browser lifecycle for job workers.
 */
import { CHAT_URL_POLL_MS } from "../constants";
import * as browser from "../browser";
import { sleep } from "../../shared/helpers";

export async function closeBrowser(): Promise<void> {
  await browser.close().catch(() => undefined);
}

export async function launchBrowser(
  runtimeProfileDir: string,
  url: string,
  runMode: "headed" | "headless",
  executablePath?: string,
  userAgent?: string,
  args?: string[],
): Promise<void> {
  await closeBrowser();
  await browser.launch({
    userDataDir: runtimeProfileDir,
    executablePath,
    userAgent,
    args: Array.isArray(args) ? args : undefined,
    headless: runMode !== "headed",
  });
  await browser.open(url);
}

export async function waitForStableChatUrl(
  previousChatUrl: string | undefined,
  heartbeatFn: () => Promise<void>,
): Promise<string> {
  const timeoutAt = Date.now() + 60_000;
  let lastUrl = "";
  let stableCount = 0;
  let latestUrl = "";

  while (Date.now() < timeoutAt) {
    await heartbeatFn();
    latestUrl = await browser.getUrl();
    const url = normalizeUrl(latestUrl);
    const isConversationUrl = /\/c\/[A-Za-z0-9-]+$/i.test(url);
    const isKnownFollowUp = previousChatUrl ? normalizeUrl(previousChatUrl) === url : false;

    if (isConversationUrl || isKnownFollowUp) {
      if (url === lastUrl) stableCount += 1;
      else stableCount = 1;
      lastUrl = url;
      if (stableCount >= 2) return url;
    }
    await sleep(CHAT_URL_POLL_MS);
  }

  return previousChatUrl || lastUrl || normalizeUrl(latestUrl);
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}
