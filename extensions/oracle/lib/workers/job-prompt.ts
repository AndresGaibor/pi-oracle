/**
 * ChatGPT prompt sending for job workers.
 */
import * as browser from "../browser";
import { CHATGPT_LABELS } from "../../pages/chatgpt/chatgpt.selectors";
import { findEntry, labelMatches } from "../../shared/helpers";

export async function clickComposer(): Promise<void> {
  const snapshot = await browser.snapshotText();
  const entry = findEntry(snapshot, (e) => e.kind === "textbox" && labelMatches(e.label, CHATGPT_LABELS.composer) && !e.disabled);
  if (entry) await browser.clickRef(entry.ref);
}

export async function typePrompt(prompt: string): Promise<void> {
  await browser.evaluate(browser.getMainPageId(), `
    const textbox = document.querySelector('[data-id*="composer"], [contenteditable="true"]');
    if (textbox) {
      textbox.focus();
      textbox.textContent = ${JSON.stringify(JSON.stringify(prompt))};
      textbox.dispatchEvent(new Event('input', { bubbles: true }));
      textbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { success: !!textbox };
  `);
}

export async function clickSend(): Promise<boolean> {
  const snapshot = await browser.snapshotText();
  const entry = findEntry(snapshot, (e) => e.kind === "button" && labelMatches(e.label, CHATGPT_LABELS.send) && !e.disabled);
  if (!entry) return false;
  await browser.clickRef(entry.ref);
  return true;
}

export async function maybeClickAddFiles(): Promise<boolean> {
  const snapshot = await browser.snapshotText();
  const entry = findEntry(snapshot, (e) => e.kind === "button" && labelMatches(e.label, CHATGPT_LABELS.addFiles) && !e.disabled);
  if (!entry) return false;
  await browser.clickRef(entry.ref);
  return true;
}

export async function sendPrompt(prompt: string): Promise<void> {
  await clickComposer();
  await typePrompt(prompt);
  await clickSend();
}
