// pages/base.page.ts - Base Page Object Model class
import type { Page } from "playwright";

export interface SnapshotEntry {
	ref: string;
	kind: string;
	label: string;
	disabled?: boolean;
	checked?: boolean;
	href?: string;
	value?: string;
	placeholder?: string;
}

export class BasePage {
	protected pageToken: string = "";

	// ---- Navigation ----
	async navigate(url: string): Promise<void> {
		// To be implemented by adapter
		console.log(`Navigating to: ${url}`);
	}

	async getCurrentUrl(): Promise<string> {
		return "";
	}

	// ---- Snapshots (accessibility tree) ----
	async getSnapshot(): Promise<SnapshotEntry[]> {
		return [];
	}

	protected parseSnapshot(raw: string): SnapshotEntry[] {
		const entries: SnapshotEntry[] = [];
		const lines = raw.split("\n");

		for (const line of lines) {
			const tokenMatch = line.match(/^(\w+)\s*>\s*(.*)/);
			if (!tokenMatch) continue;

			const ref = tokenMatch[1];
			const rest = tokenMatch[2].trim();

			const kindMatch = rest.match(
				/^(button|link|textbox|heading|img|checkbox|radio|listbox|option|combobox|dialog|alert|banner|navigation|main|search|form|article|section|nav)(.*)/i,
			);
			const kind = kindMatch ? kindMatch[1].toLowerCase() : "text";

			const labelMatch = rest.match(/"([^"]+)"/);
			const label = labelMatch ? labelMatch[1] : rest.replace(/"/g, "").trim();

			const hrefMatch = rest.match(/href="([^"]+)"/);

			entries.push({
				ref,
				kind,
				label,
				href: hrefMatch?.[1],
			});
		}
		return entries;
	}

	async findEntry(
		predicate: (e: SnapshotEntry) => boolean,
	): Promise<SnapshotEntry | undefined> {
		const entries = await this.getSnapshot();
		return entries.find(predicate);
	}

	async findLastEntry(
		predicate: (e: SnapshotEntry) => boolean,
	): Promise<SnapshotEntry | undefined> {
		const entries = await this.getSnapshot();
		const matches = entries.filter(predicate);
		return matches[matches.length - 1];
	}

	// ---- Interaction ----
	async click(entryOrRef: SnapshotEntry | string): Promise<void> {
		const ref = typeof entryOrRef === "string" ? entryOrRef : entryOrRef.ref;
		console.log(`Clicking: ${ref}`);
	}

	async type(selector: string, text: string, human = true): Promise<void> {
		if (human) {
			await this.humanType(selector, text);
		} else {
			await this.fill(selector, text);
		}
	}

	protected async humanType(selector: string, text: string): Promise<void> {
		console.log(`Human typing: ${text.slice(0, 20)}...`);
		// Type character by character with human-like delays
		for (const char of text) {
			const baseDelay = 30 + Math.random() * 120;
			const pause = Math.random() < 0.05 ? 200 + Math.random() * 300 : 0;
			await new Promise((r) => setTimeout(r, baseDelay + pause));
		}
	}

	protected async fill(selector: string, value: string): Promise<void> {
		console.log(`Filling: ${selector}`);
	}

	// ---- Diagnostic ----
	async takeScreenshot(path: string): Promise<void> {
		console.log(`Screenshot: ${path}`);
	}

	async getPageText(): Promise<string> {
		return "";
	}
}

// Helper functions
export function labelMatches(
	actual: string,
	candidates: readonly string[],
): boolean {
	const normalized = actual.toLowerCase().trim();
	return candidates.some((c) => normalized.includes(c.toLowerCase()));
}
