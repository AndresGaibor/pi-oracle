/**
 * ChatGPT Auth Actions – browser interactions for authentication flow.
 */
import { parseSnapshotEntries, findEntry, findLastEntry, type ParsedSnapshotEntry } from "../../shared/snapshot-utils";
import type { BrowserActions } from "../browser-actions.types";
import { AUTH_SELECTORS, AUTH_LABELS, labelMatches } from "./chatgpt-auth.selectors";


// ---------------------------------------------------------------------------
// Login actions
// ---------------------------------------------------------------------------

/** Find login button entry in snapshot */
export function findLoginButton(snapshot: string): ParsedSnapshotEntry | undefined {
	return findEntry(
		snapshot,
		(e) =>
			e.kind === "button" &&
			!!e.label &&
			labelMatches(e.label, AUTH_LABELS.login) &&
			!e.disabled,
	);
}

/** Find login link entry in snapshot */
export function findLoginLink(snapshot: string): ParsedSnapshotEntry | undefined {
	return findEntry(
		snapshot,
		(e) =>
			e.kind === "link" &&
			!!e.href &&
			AUTH_LABELS.authUrls.some((pattern) => e.href!.includes(pattern)) &&
			!e.disabled,
	);
}

/** Click login button/link if visible */
export async function clickLogin(browser: BrowserActions): Promise<boolean> {
	const snapshot = await browser.snapshotText();
	const entry = findLoginButton(snapshot) || findLoginLink(snapshot);
	if (!entry) return false;
	await browser.clickRef(entry.ref);
	return true;
}

// ---------------------------------------------------------------------------
// Account chooser actions
// ---------------------------------------------------------------------------

/** Click account chooser button by name */
export async function clickAccountChooser(
	browser: BrowserActions,
	accountName: string,
): Promise<boolean> {
	const snapshot = await browser.snapshotText();
	const entry = findEntry(
		snapshot,
		(e) => e.kind === "button" && e.label === accountName && !e.disabled,
	);
	if (!entry) return false;
	await browser.clickRef(entry.ref);
	return true;
}

/** Click first visible login CTA when backend is authenticated */
export async function clickLoginCta(browser: BrowserActions): Promise<boolean> {
	const snapshot = await browser.snapshotText();
	const entry = findLastEntry(
		snapshot,
		(e) => e.kind === "button" && labelMatches(e.label, AUTH_LABELS.login) && !e.disabled,
	);
	if (!entry) return false;
	await browser.clickRef(entry.ref);
	return true;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { parseSnapshotEntries, findEntry, findLastEntry };
export type { ParsedSnapshotEntry as SnapshotEntry };
