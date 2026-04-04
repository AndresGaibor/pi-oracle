// pages/base.page.ts - Base Page Object Model class

import {
	parseSnapshotEntries,
	findEntry,
	findLastEntry,
	type ParsedSnapshotEntry,
} from "../shared/snapshot-utils";

export interface SnapshotEntry {
	ref: string;
	kind?: string;
	label?: string;
	disabled?: boolean;
	checked?: boolean;
	href?: string;
	value?: string;
	placeholder?: string;
}

/**
 * BrowserActions – the contract between Page Objects and the browser infrastructure layer.
 * Page Objects depend ONLY on this interface, not on any concrete implementation.
 */
export interface BrowserActions {
	/** Get snapshot text of the current page */
	snapshotText(pageId?: string): Promise<string>;
	/** Get body innerText of the current page */
	pageText(pageId?: string): Promise<string>;
	/** Evaluate a script in the page context */
	evaluate(pageId: string, script: string): Promise<unknown>;
	/** Click an element by ref token or selector */
	clickRef(refOrToken: string, pageIdHint?: string): Promise<void>;
	/** Fill text into an element */
	fill(refOrToken: string, text: string, pageIdHint?: string): Promise<void>;
	/** Take a screenshot */
	screenshot(destPath: string, pageId?: string): Promise<void>;
	/** Get the main page ID for evaluation */
	getMainPageId(): string;
	/** Open a URL in the main page */
	open?(url: string): Promise<void>;
	/** Reload the page */
	reload?(pageId?: string): Promise<void>;
	/** Get current URL */
	getUrl?(pageId?: string): Promise<string>;
}

/**
 * BasePage – Pure Page Object Model base class.
 * Provides snapshot parsing and query utilities that work with any BrowserActions implementation.
 */
export class BasePage {
	/**
	 * Find entry in snapshot by predicate
	 */
	protected findEntry(
		snapshot: string,
		predicate: (e: SnapshotEntry) => boolean,
	): SnapshotEntry | undefined {
		const entry = findEntry(snapshot, (e: ParsedSnapshotEntry) =>
			predicate({
				ref: e.ref,
				kind: e.kind,
				label: e.label,
				disabled: e.disabled,
				checked: e.checked,
				href: e.href,
				value: e.value,
				placeholder: e.placeholder,
			}),
		);
		return entry
			? {
					ref: entry.ref,
					kind: entry.kind,
					label: entry.label,
					disabled: entry.disabled,
					checked: entry.checked,
					href: entry.href,
					value: entry.value,
					placeholder: entry.placeholder,
				}
			: undefined;
	}

	/**
	 * Find last entry in snapshot by predicate
	 */
	protected findLastEntry(
		snapshot: string,
		predicate: (e: SnapshotEntry) => boolean,
	): SnapshotEntry | undefined {
		const entry = findLastEntry(snapshot, (e: ParsedSnapshotEntry) =>
			predicate({
				ref: e.ref,
				kind: e.kind,
				label: e.label,
				disabled: e.disabled,
				checked: e.checked,
				href: e.href,
				value: e.value,
				placeholder: e.placeholder,
			}),
		);
		return entry
			? {
					ref: entry.ref,
					kind: entry.kind,
					label: entry.label,
					disabled: entry.disabled,
					checked: entry.checked,
					href: entry.href,
					value: entry.value,
					placeholder: entry.placeholder,
				}
			: undefined;
	}

	/**
	 * Parse raw snapshot into structured entries
	 */
	protected parseSnapshot(raw: string): SnapshotEntry[] {
		const parsed = parseSnapshotEntries(raw);
		return parsed.map((p) => ({
			ref: p.ref,
			kind: p.kind,
			label: p.label,
			disabled: p.disabled,
			checked: p.checked,
			href: p.href,
			value: p.value,
			placeholder: p.placeholder,
		}));
	}

	/**
	 * Check if label matches any candidate
	 */
	protected labelMatches(actual: string, candidates: readonly string[]): boolean {
		const normalized = actual.toLowerCase().trim();
		return candidates.some((c) => normalized.includes(c.toLowerCase()));
	}

	/**
	 * Find entries by kind
	 */
	protected filterByKind(snapshot: string, kind: string): SnapshotEntry[] {
		return this.parseSnapshot(snapshot).filter((e) => e.kind === kind);
	}

	/**
	 * Find enabled entries
	 */
	protected enabledOnly(entries: SnapshotEntry[]): SnapshotEntry[] {
		return entries.filter((e) => !e.disabled);
	}
}
