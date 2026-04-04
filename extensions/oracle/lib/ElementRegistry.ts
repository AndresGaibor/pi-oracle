/**
 * ElementRegistry – maps token strings (e1, e2…) to {pageId, selector}.
 * Extracted from browser.ts to eliminate global mutable state.
 */

export interface ElementInfo {
	pageId: string;
	selector: string;
}

export class ElementRegistry {
	private elements = new Map<string, ElementInfo>();
	private counter = 0;

	/** Register a selector and return a token (e1, e2…) */
	register(pageId: string, selector: string): string {
		this.counter += 1;
		const token = `e${this.counter}`;
		this.elements.set(token, { pageId, selector });
		return token;
	}

	/** Resolve a token to its ElementInfo */
	resolve(token: string): ElementInfo | undefined {
		return this.elements.get(token);
	}

	/** Check if a token exists */
	has(token: string): boolean {
		return this.elements.has(token);
	}

	/** Clear all registered elements */
	clear(): void {
		this.elements.clear();
		this.counter = 0;
	}

	/** Get current count (useful for testing) */
	get size(): number {
		return this.elements.size;
	}
}
