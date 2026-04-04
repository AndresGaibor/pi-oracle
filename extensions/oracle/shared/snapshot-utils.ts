/**
 * Pure utilities for parsing Playwright accessibility snapshots.
 *
 * All exported functions are @pure: no side effects, result depends only on input.
 * This makes them trivially testable without mocks or a browser.
 */
export interface ParsedSnapshotEntry {
	line: string;
	ref: string;
	kind: string | undefined;
	label: string | undefined;
	value: string | undefined;
	disabled: boolean;
	checked?: boolean;
	href?: string;
	placeholder?: string;
}

/**
 * Parse snapshot text from agent-browser into structured entries.
 * Format: "ref=... kind ... "label" ... :value ... [disabled]"
 *
 * @pure — No tiene efectos secundarios. Siempre retorna el mismo resultado
 *         para el mismo input.
 */
export function parseSnapshotEntries(snapshot: string): ParsedSnapshotEntry[] {
	return snapshot
		.split("\n")
		.map((line) => {
			const refMatch = line.match(/\bref=(e\d+|@e\d+)\b/);
			if (!refMatch) return undefined;

			const kindMatch = line.match(/^\s*-\s*([^\s]+)/);
			const quotedMatch = line.match(/"([^"]*)"/);
			const valueMatch = line.match(/:\s*(.+)$/);

			return {
				line,
				ref: refMatch[1].startsWith("@") ? refMatch[1] : `@${refMatch[1]}`,
				kind: kindMatch ? kindMatch[1] : undefined,
				label: quotedMatch ? quotedMatch[1] : undefined,
				value: valueMatch ? valueMatch[1].trim() : undefined,
				disabled: /\bdisabled\b/.test(line),
				checked: /\bchecked\b/.test(line),
			};
		})
		.filter(Boolean) as ParsedSnapshotEntry[];
}

/**
 * Find first entry matching predicate.
 *
 * @pure — No tiene efectos secundarios.
 */
export function findEntry(
	snapshot: string,
	predicate: (entry: ParsedSnapshotEntry) => boolean,
): ParsedSnapshotEntry | undefined {
	return parseSnapshotEntries(snapshot).find(predicate);
}

/**
 * Find last entry matching predicate.
 *
 * @pure — No tiene efectos secundarios.
 */
export function findLastEntry(
	snapshot: string,
	predicate: (entry: ParsedSnapshotEntry) => boolean,
): ParsedSnapshotEntry | undefined {
	const entries = parseSnapshotEntries(snapshot);
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		if (predicate(entries[index])) return entries[index];
	}
	return undefined;
}

/**
 * Check if label matches any of the candidate labels.
 *
 * @pure — No tiene efectos secundarios.
 */
export function labelMatches(
	actual: string | undefined,
	candidates: readonly string[],
): boolean {
	if (!actual) return false;
	const normalized = actual.toLowerCase().trim();
	return candidates.some((c) => normalized.includes(c.toLowerCase()));
}

/**
 * Filter entries by kind.
 *
 * @pure — No tiene efectos secundarios.
 */
export function filterByKind(
	entries: ParsedSnapshotEntry[],
	kind: string,
): ParsedSnapshotEntry[] {
	return entries.filter((e) => e.kind === kind);
}

/**
 * Busca una entrada en el snapshot por kind y labels (case-insensitive, substring).
 * Utilidad común usada por actions y assertions de ChatGPT.
 *
 * @pure — No tiene efectos secundarios.
 */
export function findLabeledEntry(
	entries: ParsedSnapshotEntry[],
	kind: string,
	labels: readonly string[],
): ParsedSnapshotEntry | undefined {
	return entries.find(
		(e) => e.kind === kind && labelMatches(e.label, labels) && !e.disabled,
	);
}

/**
 * Filter entries by label.
 *
 * @pure — No tiene efectos secundarios.
 */
export function filterByLabel(
	entries: ParsedSnapshotEntry[],
	labels: readonly string[],
): ParsedSnapshotEntry[] {
	return entries.filter((e) => labelMatches(e.label, labels));
}

/**
 * Get enabled entries only.
 *
 * @pure — No tiene efectos secundarios.
 */
export function enabledEntries(
	entries: ParsedSnapshotEntry[],
): ParsedSnapshotEntry[] {
	return entries.filter((e) => !e.disabled);
}

/**
 * Find button entries.
 *
 * @pure — No tiene efectos secundarios.
 */
export function findButtons(snapshot: string): ParsedSnapshotEntry[] {
	return parseSnapshotEntries(snapshot).filter((e) => e.kind === "button");
}

/**
 * Find link entries.
 *
 * @pure — No tiene efectos secundarios.
 */
export function findLinks(snapshot: string): ParsedSnapshotEntry[] {
	return parseSnapshotEntries(snapshot).filter((e) => e.kind === "link");
}

/**
 * Find textbox entries.
 *
 * @pure — No tiene efectos secundarios.
 */
export function findTextboxes(snapshot: string): ParsedSnapshotEntry[] {
	return parseSnapshotEntries(snapshot).filter((e) => e.kind === "textbox");
}
