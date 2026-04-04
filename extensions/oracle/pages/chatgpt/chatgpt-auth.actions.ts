/**
 * ChatGPT Auth Actions – browser interactions for authentication flow.
 */
import type { BrowserActions } from "../browser-actions.types";
import { AUTH_SELECTORS, AUTH_LABELS, labelMatches } from "./chatgpt-auth.selectors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotEntry {
	ref: string;
	kind?: string;
	label?: string;
	disabled?: boolean;
	href?: string;
}

// ---------------------------------------------------------------------------
// Snapshot parsing (shared)
// ---------------------------------------------------------------------------

function parseSnapshotEntries(snapshot: string): SnapshotEntry[] {
	return snapshot
		.split("\n")
		.map((line) => {
			const refMatch = line.match(/\bref=(e\d+|@e\d+)\b/);
			if (!refMatch) return undefined;
			const kindMatch = line.match(/^\s*-\s*([^\s]+)/);
			const quotedMatch = line.match(/"([^"]*)"/);
			const hrefMatch = line.match(/href="([^"]+)"/);
			return {
				ref: refMatch[1].startsWith("@") ? refMatch[1] : `@${refMatch[1]}`,
				kind: kindMatch ? kindMatch[1] : undefined,
				label: quotedMatch ? quotedMatch[1] : undefined,
				href: hrefMatch ? hrefMatch[1] : undefined,
				disabled: /\bdisabled\b/.test(line),
			};
		})
		.filter(Boolean) as SnapshotEntry[];
}

function findEntry(
	snapshot: string,
	predicate: (e: SnapshotEntry) => boolean,
): SnapshotEntry | undefined {
	return parseSnapshotEntries(snapshot).find(predicate);
}

function findLastEntry(
	snapshot: string,
	predicate: (e: SnapshotEntry) => boolean,
): SnapshotEntry | undefined {
	const entries = parseSnapshotEntries(snapshot);
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		if (predicate(entries[i])) return entries[i];
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Login actions
// ---------------------------------------------------------------------------

/** Find login button entry in snapshot */
export function findLoginButton(snapshot: string): SnapshotEntry | undefined {
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
export function findLoginLink(snapshot: string): SnapshotEntry | undefined {
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
export type { SnapshotEntry };
