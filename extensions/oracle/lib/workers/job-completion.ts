/**
 * ChatGPT response completion detection for job workers.
 */
import * as browser from "../browser";
import { isResponseComplete } from "../../pages/chatgpt/chatgpt.assertions";
import { sleep } from "../../shared/helpers";

export async function getAssistantMessages(): Promise<Array<{ text: string }>> {
  const raw = await browser.evaluate(browser.getMainPageId(), buildAssistantMessagesScript());
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.messages)) return [];
    return parsed.messages.map((m: unknown) => ({
      text: typeof (m as { text?: string })?.text === "string" ? (m as { text: string }).text : "",
    }));
  } catch {
    return [];
  }
}

function buildAssistantMessagesScript(): string {
  return `JSON.stringify((() => {
    const turnStart = Array.from(
      document.querySelectorAll('[data-message-author-role="assistant"][data-turn-start-message="true"]'),
    );
    const messages = turnStart.length
      ? turnStart
      : Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    const renderText = (node) => {
      if (!node) return '';
      const clone = node.cloneNode(true);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre-wrap;pointer-events:none';
      host.appendChild(clone); document.body.appendChild(host);
      let text = (host.innerText || host.textContent || '').trim(); host.remove();
      const endings = ['\\\\nChatGPT can make mistakes. Check important info.', '\\\\nChatGPT puede cometer errores. Comprueba la información importante.'];
      for (const ending of endings) { if (text.includes(ending)) text = text.split(ending)[0].trim(); }
      text = text.split('\\\\n').map(l => l.trimEnd()).filter(l => l.trim() && !/^Thought for\\\\b/i.test(l.trim())).join('\\\\n').trim();
      return text;
    };
    return { messages: messages.map((m) => ({ text: renderText(m) })) };
  })(), null, 2)`;
}

export async function waitForChatCompletion(
  baselineAssistantCount: number,
  timeoutMs: number,
  pollMs: number,
  heartbeatFn: () => Promise<void>,
): Promise<{ responseIndex: number; responseText: string }> {
  const timeoutAt = Date.now() + timeoutMs;
  let lastText = "";
  let stableCount = 0;

  while (Date.now() < timeoutAt) {
    await heartbeatFn();
    const snapshot = await browser.snapshotText();
    const messages = await getAssistantMessages();
    const targetMessage = messages[baselineAssistantCount];
    const targetText = targetMessage?.text || "";
    const hasCompleted = isResponseComplete(snapshot);

    if (targetText && hasCompleted) {
      if (targetText === lastText) stableCount += 1;
      else stableCount = 1;
      lastText = targetText;
      if (stableCount >= 3) return { responseIndex: baselineAssistantCount, responseText: targetText };
    }
    await sleep(pollMs);
  }

  throw new Error("Timed out waiting for ChatGPT response completion");
}
