/**
 * ChatGPT Actions – browser interactions for the ChatGPT page.
 * Each method performs a concrete action using the BrowserActions interface.
 */
import type { BrowserActions } from "../browser-actions.types";
import { parseSnapshotEntries, findLabeledEntry as findLabeledEntryFromUtils, type ParsedSnapshotEntry } from "../../shared/snapshot-utils";
import { CHATGPT_SELECTORS, CHATGPT_LABELS, labelMatches } from "./chatgpt.selectors";

/**
 * Helper wrapper that parses snapshot and finds labeled entry.
 * Uses the canonical findLabeledEntry from snapshot-utils.
 */
function findLabeledEntry(
	snapshot: string,
	kind: string,
	labels: readonly string[],
): ParsedSnapshotEntry | undefined {
	const entries = parseSnapshotEntries(snapshot);
	return findLabeledEntryFromUtils(entries, kind, labels);
}

// ---------------------------------------------------------------------------
// Composer actions
// ---------------------------------------------------------------------------

/** Click the composer textbox to focus it */
export async function clickComposer(browser: BrowserActions): Promise<void> {
	const snapshot = await browser.snapshotText();
	const entry = findLabeledEntry(snapshot, "textbox", CHATGPT_LABELS.composer);
	if (!entry) throw new Error("Composer textbox not found in snapshot");
	await browser.clickRef(entry.ref);
}

/** Type a prompt into the composer via JS (handles contenteditable) */
export async function typePrompt(browser: BrowserActions, prompt: string): Promise<boolean> {
	const result = await browser.evaluate(browser.getMainPageId(), `
		const textbox = document.querySelector('${CHATGPT_SELECTORS.composer[3]}')
			|| document.querySelector('${CHATGPT_SELECTORS.composer[4]}');
		if (textbox) {
			textbox.focus();
			textbox.textContent = ${JSON.stringify(JSON.stringify(prompt))};
			textbox.dispatchEvent(new Event('input', { bubbles: true }));
			textbox.dispatchEvent(new Event('change', { bubbles: true }));
		}
		return { success: !!textbox };
	`);
	return !!(result && typeof result === "object" && "success" in result && result.success);
}

// ---------------------------------------------------------------------------
// Send actions
// ---------------------------------------------------------------------------

/** Click the send button */
export async function clickSend(browser: BrowserActions): Promise<void> {
	const snapshot = await browser.snapshotText();
	const entry = findLabeledEntry(snapshot, "button", CHATGPT_LABELS.send);
	if (!entry) throw new Error("Send button not found in snapshot");
	await browser.clickRef(entry.ref);
}

/**
 * Submit prompt using Enter key (preferred over clickSend).
 * More reliable than clicking the send button which may not be visible.
 * Works for both regular messages and regeneration.
 */
export async function sendPrompt(browser: BrowserActions): Promise<void> {
	await browser.press("Enter");
}

// ---------------------------------------------------------------------------
// File upload actions
// ---------------------------------------------------------------------------

/** Click the add files button */
export async function clickAddFiles(browser: BrowserActions): Promise<boolean> {
	const snapshot = await browser.snapshotText();
	const entry = findLabeledEntry(snapshot, "button", CHATGPT_LABELS.addFiles);
	if (!entry) return false;
	await browser.clickRef(entry.ref);
	return true;
}

// ---------------------------------------------------------------------------
// Model configuration actions
// ---------------------------------------------------------------------------

/** Click the close button in model config panel */
export async function clickClose(browser: BrowserActions): Promise<boolean> {
	const snapshot = await browser.snapshotText();
	const entry = findLabeledEntry(snapshot, "button", CHATGPT_LABELS.close);
	if (!entry) return false;
	await browser.clickRef(entry.ref);
	return true;
}


