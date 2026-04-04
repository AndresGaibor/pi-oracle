// pages/base.page.ts - Base Page Object Model class

import {
	parseSnapshotEntries,
	findEntry,
	findLastEntry,
	type ParsedSnapshotEntry,
} from "../shared/snapshot-utils";
import type { BrowserActions } from "./browser-actions.types";

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
